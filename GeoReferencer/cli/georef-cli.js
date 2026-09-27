#!/usr/bin/env node
// GeoReferencer CLI
// PNG画像＋マーキングJSON＋GPSポイントExcelからジオリファレンスを実行し、
// GeoJSON (dataspec-geojson-202604.md 第3章準拠) を指定フォルダへ出力する。
//
// 使い方:
//   node georef-cli.js <フォルダ> <PNGファイル名> <JSONファイル名> <GPS Excelファイル名> [出力フォルダ] [--skip-elevation]
//
// - JSONファイル名はカンマ区切りで複数指定可（例: points.json,route1.json,spots.json）
// - 出力フォルダ省略時は入力フォルダに出力
// - --skip-elevation 指定時は国土地理院標高APIによる標高取得を行わない

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

// ==========================================
// 定数（ブラウザ版 constants.js / elevation-fetcher.js と同値）
// ==========================================
const MAX_EXCEL_ROWS = 1000;              // ヘッダー行含む最大読み込み行数
const ELEVATION_DELAY_MS = 500;           // 標高API レート制限: 0.5秒/件
const GSI_API_BASE = 'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php';
const WEB_MERCATOR_MAX = 20037508.34;

// ==========================================
// 座標変換・行列計算（math-utils.js から移植）
// ==========================================
function lonToWebMercatorX(lon) {
    return lon * WEB_MERCATOR_MAX / 180;
}

function latToWebMercatorY(lat) {
    const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
    return y * WEB_MERCATOR_MAX / 180;
}

function webMercatorXToLon(x) {
    return x * 180 / WEB_MERCATOR_MAX;
}

function webMercatorYToLat(y) {
    const lat = y * 180 / WEB_MERCATOR_MAX;
    return 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
}

function transpose(matrix) {
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
}

function multiply(a, b) {
    const result = new Array(a.length).fill(0).map(() => new Array(b[0].length).fill(0));
    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b[0].length; j++) {
            for (let k = 0; k < b.length; k++) {
                result[i][j] += a[i][k] * b[k][j];
            }
        }
    }
    return result;
}

function multiplyVector(matrix, vector) {
    return matrix.map(row => row.reduce((sum, val, i) => sum + val * vector[i], 0));
}

// ガウス・ジョーダン法（部分ピボット選択付き）
function gaussJordan(A, B) {
    const n = A.length;
    const augmented = A.map((row, i) => [...row, B[i]]);

    for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                maxRow = k;
            }
        }
        if (maxRow !== i) {
            [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
        }
        if (Math.abs(augmented[i][i]) < 1e-10) {
            return null; // 特異行列
        }
        const pivot = augmented[i][i];
        for (let j = i; j <= n; j++) {
            augmented[i][j] /= pivot;
        }
        for (let k = 0; k < n; k++) {
            if (k !== i) {
                const factor = augmented[k][i];
                for (let j = i; j <= n; j++) {
                    augmented[k][j] -= factor * augmented[i][j];
                }
            }
        }
    }
    return augmented.map(row => row[n]);
}

// 最小二乗法による6パラメータアフィン変換（画像座標 → Web Mercator）
function calculateAffineTransformation(controlPoints) {
    const n = controlPoints.length;
    const A = new Array(2 * n).fill(0).map(() => new Array(6).fill(0));
    const B = new Array(2 * n).fill(0);

    for (let i = 0; i < n; i++) {
        const imageX = controlPoints[i].pointJson.imageX;
        const imageY = controlPoints[i].pointJson.imageY;
        const gpsX = lonToWebMercatorX(controlPoints[i].gpsPoint.lng);
        const gpsY = latToWebMercatorY(controlPoints[i].gpsPoint.lat);

        A[i * 2][0] = imageX;
        A[i * 2][1] = imageY;
        A[i * 2][2] = 1;
        B[i * 2] = gpsX;

        A[i * 2 + 1][3] = imageX;
        A[i * 2 + 1][4] = imageY;
        A[i * 2 + 1][5] = 1;
        B[i * 2 + 1] = gpsY;
    }

    const At = transpose(A);
    const AtA = multiply(At, A);
    const AtB = multiplyVector(At, B);
    const params = gaussJordan(AtA, AtB);
    if (!params) return null;

    return {
        a: params[0], b: params[1], c: params[2],
        d: params[3], e: params[4], f: params[5]
    };
}

// 変換精度（制御点ごとの誤差・Web Mercatorメートル）
function calculateTransformationAccuracy(controlPoints, t) {
    const errors = controlPoints.map(point => {
        const tx = t.a * point.pointJson.imageX + t.b * point.pointJson.imageY + t.c;
        const ty = t.d * point.pointJson.imageX + t.e * point.pointJson.imageY + t.f;
        const ax = lonToWebMercatorX(point.gpsPoint.lng);
        const ay = latToWebMercatorY(point.gpsPoint.lat);
        return Math.sqrt((tx - ax) ** 2 + (ty - ay) ** 2);
    });
    return {
        meanError: errors.reduce((s, e) => s + e, 0) / errors.length,
        maxError: Math.max(...errors),
        minError: Math.min(...errors)
    };
}

// アフィン変換で画像座標をGPS座標 [lat, lng] に変換
function applyAffineTransform(imageX, imageY, t) {
    const webMercatorX = t.a * imageX + t.b * imageY + t.c;
    const webMercatorY = t.d * imageX + t.e * imageY + t.f;
    return [webMercatorYToLat(webMercatorY), webMercatorXToLon(webMercatorX)];
}

// 座標を小数点5桁に丸める（app-main.js roundCoordinate と同一）
function roundCoordinate(coordinate) {
    return Math.round(coordinate * 100000) / 100000;
}

// ==========================================
// 入力ファイル読み込み
// ==========================================

// GPSポイントExcel読み込み（file-handler.js validateAndConvertExcelData と同一仕様）
function loadGpsExcel(filePath) {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    const range = worksheet['!ref'];
    if (range) {
        const decoded = XLSX.utils.decode_range(range);
        const maxRows = MAX_EXCEL_ROWS - 1;
        if (decoded.e.r > maxRows) {
            decoded.e.r = maxRows;
            worksheet['!ref'] = XLSX.utils.encode_range(decoded);
        }
    }

    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (!rawData || rawData.length === 0) {
        throw new Error('Excelファイルが空です。');
    }

    const requiredColumns = ['ポイントID', '名称', '緯度', '経度'];
    const optionalColumns = ['標高', '備考'];
    const headerRow = rawData[0];
    if (!headerRow || headerRow.length === 0) {
        throw new Error('ヘッダー行が見つかりません。');
    }

    const columnIndexMap = {};
    for (const column of [...requiredColumns, ...optionalColumns]) {
        const index = headerRow.indexOf(column);
        if (index !== -1) {
            columnIndexMap[column] = index;
        } else if (requiredColumns.includes(column)) {
            throw new Error(`必須列「${column}」が見つかりません。`);
        }
    }

    const validatedData = [];
    for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        const pointData = {};
        let isValidRow = true;
        for (const column of requiredColumns) {
            const value = row[columnIndexMap[column]];
            if (value === undefined || value === null || value === '') {
                isValidRow = false;
                break;
            }
            pointData[column] = value;
        }
        if (!isValidRow) continue;

        for (const column of optionalColumns) {
            if (columnIndexMap[column] !== undefined) {
                const value = row[columnIndexMap[column]];
                if (value !== undefined && value !== null && value !== '') {
                    pointData[column] = value;
                }
            }
        }

        const lat = parseFloat(pointData['緯度']);
        const lng = parseFloat(pointData['経度']);
        if (isNaN(lat) || isNaN(lng)) continue;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

        validatedData.push({
            pointId: String(pointData['ポイントID']),
            name: pointData['名称'],
            lat: lat,
            lng: lng,
            elevation: pointData['標高'] !== undefined ? parseFloat(pointData['標高']) : null,
            description: pointData['備考'] || null
        });
    }
    return validatedData;
}

// マーキングJSONの種別判定と正規化（dataspec-json-202604.md 準拠）
// 戻り値: { points: [], routes: [], spots: [], areas: [] }
function loadMarkingJson(filePath, dataset) {
    // BOM付きUTF-8に対応（Windowsのエディタで保存したJSONを許容）
    const text = fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
    const obj = JSON.parse(text);
    const fileName = path.basename(filePath);

    const coordOf = (item) => ({
        imageX: item.imageX !== undefined ? item.imageX : item.x,
        imageY: item.imageY !== undefined ? item.imageY : item.y
    });

    // 3.5 複合フォーマット (Combined)
    if (obj.data && (Array.isArray(obj.data.points) || Array.isArray(obj.data.routes) ||
        Array.isArray(obj.data.spots) || Array.isArray(obj.data.areas))) {
        for (const p of obj.data.points || []) {
            const c = coordOf(p);
            dataset.points.push({
                id: p.id || p.Id || p.name,
                name: p.name || p.id,
                imageX: c.imageX, imageY: c.imageY,
                elevation: p.elevation ?? null
            });
        }
        for (const r of obj.data.routes || []) {
            dataset.routes.push({
                routeName: r.routeName || null,
                startPoint: r.startPoint || 'unknown_start',
                endPoint: r.endPoint || 'unknown_end',
                waypoints: (r.waypoints || []).map(w => {
                    const c = coordOf(w);
                    return { imageX: c.imageX, imageY: c.imageY, elevation: w.elevation ?? null };
                })
            });
        }
        for (const s of obj.data.spots || []) {
            const c = coordOf(s);
            dataset.spots.push({
                id: s.id || null,
                name: s.name,
                imageX: c.imageX, imageY: c.imageY,
                elevation: s.elevation ?? null
            });
        }
        for (const [index, a] of (obj.data.areas || []).entries()) {
            dataset.areas.push(normalizeArea(a, index));
        }
        return 'combined';
    }

    // 3.2 ルート定義ファイル
    if (obj.routeInfo && obj.routeInfo.startPoint && obj.routeInfo.endPoint &&
        Array.isArray(obj.points) && obj.points.some(p => p.type === 'waypoint')) {
        dataset.routes.push({
            routeName: obj.routeInfo.routeName || null,
            startPoint: obj.routeInfo.startPoint,
            endPoint: obj.routeInfo.endPoint,
            waypoints: obj.points
                .filter(p => p.type === 'waypoint' && p.imageX !== undefined && p.imageY !== undefined)
                .map(w => ({ imageX: w.imageX, imageY: w.imageY, elevation: w.elevation ?? null }))
        });
        return 'route';
    }

    // 3.1 ポイント定義ファイル
    if (Array.isArray(obj.points) &&
        obj.points.some(p => p.type !== 'waypoint' && (p.id || p.name) &&
            p.imageX !== undefined && p.imageY !== undefined)) {
        for (const p of obj.points) {
            if (p.type === 'waypoint') continue;
            if (p.imageX === undefined || p.imageY === undefined) continue;
            dataset.points.push({
                id: p.Id || p.id || p.name,
                name: p.name || p.id,
                imageX: p.imageX, imageY: p.imageY,
                elevation: p.elevation ?? null
            });
        }
        return 'points';
    }

    // 3.3 スポット定義ファイル（spots配列）
    if (Array.isArray(obj.spots) &&
        obj.spots.some(s => typeof s.name === 'string' && s.name !== '' &&
            s.imageX !== undefined && s.imageY !== undefined)) {
        for (const s of obj.spots) {
            if (!s.name || s.imageX === undefined || s.imageY === undefined) continue;
            dataset.spots.push({
                id: s.id || null,
                name: s.name,
                imageX: s.imageX, imageY: s.imageY,
                elevation: s.elevation ?? null
            });
        }
        return 'spots';
    }

    // 3.4 エリア定義ファイル
    if (Array.isArray(obj.areas) &&
        obj.areas.some(a => Array.isArray(a.vertices) &&
            a.vertices.some(v => v.x !== undefined && v.y !== undefined))) {
        for (const [index, a] of obj.areas.entries()) {
            dataset.areas.push(normalizeArea(a, index));
        }
        return 'areas';
    }

    // 3.3 単一スポット形式
    if (typeof obj.name === 'string' && obj.name !== '' &&
        obj.imageX !== undefined && obj.imageY !== undefined) {
        dataset.spots.push({
            id: obj.id || null,
            name: obj.name,
            imageX: obj.imageX, imageY: obj.imageY,
            elevation: obj.elevation ?? null
        });
        return 'spot';
    }

    throw new Error(`JSONファイルの種別を判定できません: ${fileName}`);
}

function normalizeArea(a, index) {
    const name = a.name || a.areaName || a.description || `エリア ${index + 1}`;
    return {
        id: a.id || `area_${index}`,
        name: name,
        vertices: (a.vertices || [])
            .filter(v => v.x !== undefined && v.y !== undefined)
            .map(v => ({ x: v.x, y: v.y, elevation: v.elevation ?? null }))
    };
}

// ==========================================
// 標高取得（elevation-fetcher.js から移植）
// ==========================================
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchElevation(lng, lat) {
    try {
        const url = `${GSI_API_BASE}?lon=${lng}&lat=${lat}&outtype=JSON`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data && typeof data.elevation === 'number') {
            return Math.round(data.elevation * 10) / 10; // 小数点1桁に丸め
        }
        return null;
    } catch (error) {
        console.warn(`  [警告] 標高取得エラー (lat=${lat}, lng=${lng}): ${error.message}`);
        return null;
    }
}

// targets: [{label, items: [{lat, lng, elevation}]}] を順に処理
async function fetchElevationsForAll(targets) {
    let fetched = 0;
    let failed = 0;
    const total = targets.reduce((sum, t) => sum + t.items.length, 0);
    let current = 0;

    for (const target of targets) {
        for (const item of target.items) {
            current++;
            if (item.elevation !== undefined && item.elevation !== null) {
                process.stdout.write(`\r[標高取得] ${current}/${total} (${target.label}: 既設定スキップ)        `);
                continue;
            }
            const elevation = await fetchElevation(item.lng, item.lat);
            if (elevation !== null) {
                item.elevation = elevation;
                fetched++;
            } else {
                failed++;
            }
            process.stdout.write(`\r[標高取得] ${current}/${total} (${target.label})        `);
            await delay(ELEVATION_DELAY_MS);
        }
    }
    if (total > 0) process.stdout.write('\n');
    return { fetched, failed, total };
}

// ==========================================
// GeoJSON生成（app-main.js collectGeoreferencedData と同一仕様）
// ==========================================
function coordsOf(item) {
    const coords = [roundCoordinate(item.lng), roundCoordinate(item.lat)];
    if (item.elevation !== undefined && item.elevation !== null) {
        coords.push(roundCoordinate(item.elevation));
    }
    return coords;
}

function buildGeoJson(dataset) {
    const features = [];

    // 1. ポイント
    for (const point of dataset.points) {
        features.push({
            type: 'Feature',
            properties: {
                id: point.id,
                name: point.name || point.id,
                type: 'point',
                source: 'image_transformed',
                description: '画像ポイント（GPS変換済）'
            },
            geometry: { type: 'Point', coordinates: coordsOf(point) }
        });
    }

    // 2. スポット（ルートのstart/endがスポットを指す場合があるため、ルートより先に収集）
    let spotCounter = 1;
    for (const spot of dataset.spots) {
        const spotName = spot.name || spot.id || `spot${String(spotCounter).padStart(2, '0')}`;
        features.push({
            type: 'Feature',
            properties: {
                id: `spot${String(spotCounter).padStart(2, '0')}_${spotName}`,
                name: spotName,
                type: 'spot',
                source: 'image_transformed',
                description: 'スポット（GPS変換済）'
            },
            geometry: { type: 'Point', coordinates: coordsOf(spot) }
        });
        spotCounter++;
    }

    // ポイント/スポットID・名称 → GPS座標のルックアップマップ
    const pointGpsMap = new Map();
    for (const f of features) {
        if (f.properties.type === 'point' || f.properties.type === 'spot') {
            if (f.properties.id) pointGpsMap.set(f.properties.id, f.geometry.coordinates);
            if (f.properties.name && f.properties.name !== f.properties.id) {
                pointGpsMap.set(f.properties.name, f.geometry.coordinates);
            }
        }
    }

    // 3. ルート
    for (const route of dataset.routes) {
        const startPoint = route.startPoint || 'unknown_start';
        const endPoint = route.endPoint || 'unknown_end';
        features.push({
            type: 'Feature',
            properties: {
                id: `route_${startPoint}_to_${endPoint}`,
                name: `${startPoint} ～ ${endPoint}`,
                type: 'route',
                startPoint: startPoint,
                endPoint: endPoint,
                startPointGPS: pointGpsMap.get(startPoint) || null,
                endPointGPS: pointGpsMap.get(endPoint) || null,
                source: 'image_transformed',
                description: 'ルート（GPS変換済）'
            },
            geometry: {
                type: 'LineString',
                coordinates: route.waypoints.map(w => coordsOf(w))
            }
        });
    }

    // 4. エリア（閉合リングとして出力）
    for (const area of dataset.areas) {
        const coordinates = area.vertices.map(v => coordsOf(v));
        if (coordinates.length === 0) continue;
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
            coordinates.push([...first]);
        }
        features.push({
            type: 'Feature',
            properties: {
                id: area.id || `area_${Date.now()}`,
                name: area.name || '名称未設定エリア',
                type: 'area',
                source: 'image_transformed',
                description: 'エリア（GPS変換済）'
            },
            geometry: { type: 'Polygon', coordinates: [coordinates] }
        });
    }

    return { type: 'FeatureCollection', features };
}

// 出力ファイル名生成（app-main.js getGeoJsonFileName と同一仕様）
function getGeoJsonFileName(pngFileName, geoJsonData) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const abbreviation = pngFileName.split(/[-_\s.]/)[0];

    const features = geoJsonData.features || [];
    const counts = [
        ['P', features.filter(f => f.properties?.type === 'point').length],
        ['R', features.filter(f => f.properties?.type === 'route').length],
        ['S', features.filter(f => f.properties?.type === 'spot').length],
        ['A', features.filter(f => f.properties?.type === 'area').length]
    ];
    const countStr = counts.filter(([, n]) => n > 0).map(([k, n]) => `${k}${n}`).join('_');
    return countStr
        ? `${abbreviation}-GPS-${countStr}-${dateStr}.geojson`
        : `${abbreviation}-GPS-${dateStr}.geojson`;
}

// ==========================================
// メイン処理
// ==========================================
function printUsage() {
    console.log(`GeoReferencer CLI - PNG+JSONペアのジオリファレンス実行

使い方:
  node georef-cli.js <フォルダ> <PNGファイル名> <JSONファイル名> <GPS Excelファイル名> [出力フォルダ] [--skip-elevation]

引数:
  フォルダ            入力ファイル（PNG/JSON/Excel）のあるフォルダ
  PNGファイル名       ハイキングマップPNG（出力ファイル名の略称に使用）
  JSONファイル名      マーキングJSON（カンマ区切りで複数指定可）
  GPS Excelファイル名 ポイントID・名称・緯度・経度列を持つ .xlsx
  出力フォルダ        省略時は入力フォルダ

オプション:
  --skip-elevation    国土地理院標高APIによる標高取得をスキップ

例:
  node georef-cli.js C:\\data minoh-map.png minoh-marks.json pointGPS.xlsx C:\\output`);
}

async function main() {
    const args = process.argv.slice(2);
    const flags = args.filter(a => a.startsWith('--'));
    const positional = args.filter(a => !a.startsWith('--'));
    const skipElevation = flags.includes('--skip-elevation');

    if (positional.length < 4) {
        printUsage();
        process.exit(positional.length === 0 ? 0 : 1);
    }

    const [folder, pngName, jsonNames, excelName] = positional;
    const outDir = positional[4] || folder;

    // --- 入力ファイル検証 ---
    const pngPath = path.join(folder, pngName);
    const excelPath = path.join(folder, excelName);
    const jsonPaths = jsonNames.split(',').map(name => path.join(folder, name.trim()));

    for (const [label, p] of [['PNG', pngPath], ['Excel', excelPath], ...jsonPaths.map(jp => ['JSON', jp])]) {
        if (!fs.existsSync(p)) {
            console.error(`[エラー] ${label}ファイルが見つかりません: ${p}`);
            process.exit(1);
        }
    }
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    console.log(`=== GeoReferencer CLI ===`);
    console.log(`PNG:   ${pngPath}`);
    console.log(`JSON:  ${jsonPaths.join(', ')}`);
    console.log(`Excel: ${excelPath}`);
    console.log(`出力:  ${outDir}`);

    // --- マーキングJSON読み込み ---
    const dataset = { points: [], routes: [], spots: [], areas: [] };
    for (const jsonPath of jsonPaths) {
        const type = loadMarkingJson(jsonPath, dataset);
        console.log(`[読込] ${path.basename(jsonPath)} (種別: ${type})`);
    }
    console.log(`[読込] ポイント: ${dataset.points.length}件, ルート: ${dataset.routes.length}件, スポット: ${dataset.spots.length}件, エリア: ${dataset.areas.length}件`);

    // --- GPSポイントExcel読み込み ---
    const gpsPoints = loadGpsExcel(excelPath);
    console.log(`[読込] GPSポイント(Excel): ${gpsPoints.length}件`);

    // --- 制御点マッチング（georeferencing.js matchPointJsonWithGPS と同一仕様） ---
    const gpsPointMap = new Map(gpsPoints.map(p => [p.pointId, p]));
    const matchedPairs = [];
    const unmatchedIds = [];
    for (const point of dataset.points) {
        const gpsPoint = gpsPointMap.get(String(point.id));
        if (gpsPoint) {
            matchedPairs.push({ pointJsonId: point.id, pointJson: point, gpsPoint });
        } else {
            unmatchedIds.push(point.id);
        }
    }
    console.log(`[マッチング] 制御点: ${matchedPairs.length}件一致 / 不一致: ${unmatchedIds.length}件${unmatchedIds.length > 0 ? ` (${unmatchedIds.join(', ')})` : ''}`);

    if (matchedPairs.length < 3) {
        console.error(`[エラー] 精密版ジオリファレンシングには最低3つのポイントが必要です。現在: ${matchedPairs.length}ポイント`);
        process.exit(1);
    }

    // --- アフィン変換パラメータ計算 ---
    const transformation = calculateAffineTransformation(matchedPairs);
    if (!transformation) {
        console.error('[エラー] アフィン変換パラメータの計算に失敗しました（特異行列）。');
        process.exit(1);
    }
    const accuracy = calculateTransformationAccuracy(matchedPairs, transformation);
    console.log(`[ジオリファレンス] 変換精度: 平均誤差=${accuracy.meanError.toFixed(2)}m, 最大誤差=${accuracy.maxError.toFixed(2)}m, 最小誤差=${accuracy.minError.toFixed(2)}m`);

    // --- 全データをGPS座標に変換 ---
    const setLatLng = (item, x, y) => {
        const [lat, lng] = applyAffineTransform(x, y, transformation);
        item.lat = lat;
        item.lng = lng;
    };
    for (const p of dataset.points) setLatLng(p, p.imageX, p.imageY);
    for (const s of dataset.spots) setLatLng(s, s.imageX, s.imageY);
    for (const r of dataset.routes) {
        for (const w of r.waypoints) setLatLng(w, w.imageX, w.imageY);
    }
    for (const a of dataset.areas) {
        for (const v of a.vertices) setLatLng(v, v.x, v.y);
    }
    const totalConverted = dataset.points.length + dataset.spots.length +
        dataset.routes.reduce((s, r) => s + r.waypoints.length, 0) +
        dataset.areas.reduce((s, a) => s + a.vertices.length, 0);
    console.log(`[GPS変換] ${totalConverted}件の座標を変換しました`);

    // --- 標高取得（0.5秒/件のレート制限あり） ---
    if (!skipElevation) {
        const targets = [
            { label: 'ポイント', items: dataset.points },
            { label: 'ルート中間点', items: dataset.routes.flatMap(r => r.waypoints) },
            { label: 'スポット', items: dataset.spots },
            { label: 'エリア頂点', items: dataset.areas.flatMap(a => a.vertices) }
        ];
        const total = targets.reduce((sum, t) => sum + t.items.length, 0);
        console.log(`[標高取得] 開始: ${total}件 (約${Math.ceil(total * ELEVATION_DELAY_MS / 1000)}秒)`);
        const result = await fetchElevationsForAll(targets);
        console.log(`[標高取得] 完了: 成功=${result.fetched}, 失敗=${result.failed}, 合計=${result.total}`);
    } else {
        console.log('[標高取得] スキップ (--skip-elevation)');
    }

    // --- GeoJSON生成・出力 ---
    const geoJsonData = buildGeoJson(dataset);
    if (geoJsonData.features.length === 0) {
        console.error('[エラー] 出力対象のデータがありません。');
        process.exit(1);
    }

    const fileName = getGeoJsonFileName(pngName, geoJsonData);
    const outPath = path.join(outDir, fileName);
    fs.writeFileSync(outPath, JSON.stringify(geoJsonData, null, 2), 'utf-8');
    console.log(`[出力] GeoJSONを出力しました: ${outPath} (${geoJsonData.features.length} features)`);
}

main().catch(error => {
    console.error(`[エラー] ${error.message}`);
    process.exit(1);
});

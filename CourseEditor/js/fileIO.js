// ファイル入出力機能

import { DEFAULTS } from './constants.js';
import { showMessage } from './message.js';
import { loadExcelFile } from './excelLoader.js';
import { isEditingMode, getCourses, loadCourses } from './courseEditor.js';

// ========================================
// ポイント・スポットのストア（ルート端点検索用）
// ========================================
// ポイントGPS (Excel): pointId -> {lat, lng}
const gpsPointStore = new Map();
// 標高 (Excel): pointId -> elevation
const elevationStore = new Map();
// GeoJSONポイント (type=point): pointId -> {lat, lng}
const geojsonPointStore = new Map();
// スポット: [{name, lat, lng}]
const spotStore = [];

// ========================================
// コースオーバーレイ用ストア（courseEditorが参照）
// ========================================
// GPS・GeoJSONポイント: pointId -> Leafletマーカー
export const markerStore = new Map();
// ルートフィーチャー: [{startId, endId, coords: [[lat,lng],...]}]
export const routeFeatureStore = [];

/**
 * ルート端点の座標を検索する
 * 優先順位: ポイントGPS > GeoJSONポイント > スポット(名称一致、複数なら最近傍)
 * @param {string} id - 検索するID/名称
 * @param {number} refLat - 最近傍判定の基準緯度（スポット検索時）
 * @param {number} refLng - 最近傍判定の基準経度（スポット検索時）
 * @returns {{lat, lng}|null}
 */
function findEndpoint(id, refLat, refLng) {
    if (gpsPointStore.has(id)) return gpsPointStore.get(id);
    if (geojsonPointStore.has(id)) return geojsonPointStore.get(id);

    // スポットを名称で検索
    const matches = spotStore.filter(s => s.name === id);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    // 複数一致 → 基準点に最も近いものを返す
    let nearest = null;
    let minDist = Infinity;
    for (const s of matches) {
        const d = Math.pow(s.lat - refLat, 2) + Math.pow(s.lng - refLng, 2);
        if (d < minDist) { minDist = d; nearest = s; }
    }
    return nearest;
}

// ========================================
// フィーチャー種別判定
// ========================================
function classifyFeature(f) {
    if (!f.geometry) return null;
    const geomType = f.geometry.type;
    const type = f.properties && f.properties.type;

    if (geomType === 'LineString') return 'route';
    if (geomType === 'Point') {
        if (type === 'spot') return 'spot';
        return 'point';
    }
    return null;
}

// ========================================
// 読み込み種別選択モーダル
// ========================================
function showImportModal(features) {
    return new Promise((resolve) => {
        const counts = { point: 0, route: 0, spot: 0 };
        features.forEach(f => {
            const cls = classifyFeature(f);
            if (cls) counts[cls]++;
        });

        document.getElementById('importPointCount').textContent = `${counts.point}点`;
        document.getElementById('importRouteCount').textContent = `${counts.route}本`;
        document.getElementById('importSpotCount').textContent = `${counts.spot}個`;

        // デフォルト: ポイントはオフ、ルート・スポットはオン
        document.getElementById('importPoint').checked = false;
        document.getElementById('importRoute').checked = counts.route > 0;
        document.getElementById('importSpot').checked = counts.spot > 0;

        const modal = document.getElementById('geojsonImportModal');
        modal.style.display = 'flex';

        const confirmBtn = document.getElementById('importConfirmBtn');
        const cancelBtn = document.getElementById('importCancelBtn');

        const cleanup = () => {
            modal.style.display = 'none';
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onConfirm = () => {
            const selection = {
                point: document.getElementById('importPoint').checked,
                route: document.getElementById('importRoute').checked,
                spot: document.getElementById('importSpot').checked
            };
            cleanup();
            resolve(selection);
        };

        const onCancel = () => { cleanup(); resolve(null); };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    });
}

// ========================================
// ポイントGPS(Excel)の読み込み
// ========================================
export function setupExcelInput(dataLayer) {
    document.getElementById('excelInput').addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const points = await loadExcelFile(file);

            if (!points || points.length === 0) {
                showMessage('有効なポイントデータが見つかりませんでした', 'warning');
                return;
            }

            points.forEach(p => {
                const pid = String(p.pointId);
                const pname = p.name || '';

                // ストアに登録（ルート端点検索用）
                gpsPointStore.set(pid, { lat: p.lat, lng: p.lng });
                if (p.elevation !== undefined) elevationStore.set(pid, p.elevation);

                // 地図に表示
                const marker = L.circleMarker([p.lat, p.lng], DEFAULTS.GPS_POINT_STYLE);
                marker.bindPopup(() => {
                    const div = document.createElement('div');
                    div.innerHTML = `${pid}<br>${pname}<br>(PointGPS)`;
                    if (isEditingMode()) {
                        const btn = document.createElement('button');
                        btn.textContent = 'コースに追加';
                        btn.style.cssText = 'margin-top:4px; width:100%;';
                        btn.addEventListener('click', () => {
                            document.dispatchEvent(new CustomEvent('gpsPointClicked',
                                { detail: { pointId: pid, name: pname } }));
                            marker.closePopup();
                        });
                        div.appendChild(document.createElement('br'));
                        div.appendChild(btn);
                    }
                    return div;
                });
                markerStore.set(pid, marker);
                dataLayer.addLayer(marker);
            });

            showMessage(`${points.length}件のポイントGPSを読み込みました`);
        } catch (error) {
            showMessage(`読み込みエラー: ${error.message}`, 'error');
        } finally {
            this.value = '';
        }
    });
}

// ========================================
// ルート(GeoJSON)ファイルの読み込み
// ========================================
export function setupGeoJsonInput(dataLayer) {
    document.getElementById('geojsonInput').addEventListener('change', async function (e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // 全ファイルのフィーチャーを収集
        const allFeatures = [];
        for (const file of files) {
            try {
                const text = await file.text();
                const json = JSON.parse(text);
                if (!json.features || !Array.isArray(json.features)) {
                    showMessage(`読み込みエラー (${file.name}): 有効なGeoJSONではありません`, 'error');
                    continue;
                }
                allFeatures.push(...json.features);
            } catch (error) {
                showMessage(`読み込みエラー (${file.name}): ${error.message}`, 'error');
            }
        }

        if (allFeatures.length === 0) { this.value = ''; return; }

        // モーダルで読み込み種別を選択
        const selection = await showImportModal(allFeatures);
        if (!selection) { this.value = ''; return; }

        // ─── 第1パス: ポイント・スポットをストアに登録 ───
        // 選択状態に関わらず全ポイント/スポットを登録（ルート端点検索に使用）
        allFeatures.forEach(f => {
            const cls = classifyFeature(f);
            const props = f.properties || {};

            if (cls === 'point') {
                const [lng, lat] = f.geometry.coordinates;
                const id = String(props.id || props.pointId || '');
                if (id && !gpsPointStore.has(id)) {
                    geojsonPointStore.set(id, { lat, lng });
                }
            } else if (cls === 'spot') {
                const [lng, lat] = f.geometry.coordinates;
                const name = props.name || '';
                if (name) spotStore.push({ name, lat, lng });
            }
        });

        // ─── 第2パス: 全ルートをストアに登録し、選択された場合は地図に表示 ───
        let count = 0;
        allFeatures.forEach(f => {
            if (classifyFeature(f) !== 'route') return;
            const props = f.properties || {};
            const waypointCoords = f.geometry.coordinates.map(c => [c[1], c[0]]);

            // startPoint / endPoint プロパティから開始・終了ポイントIDを取得
            const startId = props.startPoint != null ? String(props.startPoint) : null;
            const endId   = props.endPoint   != null ? String(props.endPoint)   : null;

            // 基準点: 中間点の先頭・末尾（最近傍スポット判定用）
            const refFirst = waypointCoords.length > 0 ? waypointCoords[0] : [0, 0];
            const refLast  = waypointCoords.length > 0 ? waypointCoords[waypointCoords.length - 1] : [0, 0];

            const startCoord = startId ? findEndpoint(startId, refFirst[0], refFirst[1]) : null;
            const endCoord   = endId   ? findEndpoint(endId,   refLast[0],  refLast[1])  : null;

            const fullCoords = [
                ...(startCoord ? [[startCoord.lat, startCoord.lng]] : []),
                ...waypointCoords,
                ...(endCoord   ? [[endCoord.lat,   endCoord.lng]]   : [])
            ];

            // 選択状態に関わらず常にストアに登録（コースエディタのルート検索に使用）
            routeFeatureStore.push({ startId, endId, coords: fullCoords });

            if (selection.route) {
                L.polyline(fullCoords, DEFAULTS.ROUTE_STYLE).addTo(dataLayer);
                count++;
            }
        });

        // ─── 第3パス: ポイント・スポットを選択された場合は地図に表示 ───
        allFeatures.forEach(f => {
            const cls = classifyFeature(f);
            if (cls !== 'point' && cls !== 'spot') return;
            if (!selection[cls]) return;

            const props = f.properties || {};
            const name = props.name || '';

            if (cls === 'point') {
                // ポイント: aquamarine の円形、ポイントID + "Point"
                const [lng, lat] = f.geometry.coordinates;
                const pointId = props.id || props.pointId || '';
                const marker = L.circleMarker([lat, lng], DEFAULTS.POINT_STYLE);
                marker.bindPopup(`${pointId}<br>(Point)`);
                if (pointId) markerStore.set(String(pointId), marker);
                dataLayer.addLayer(marker);
                count++;

            } else if (cls === 'spot') {
                // スポット: yellowgreen の正方形、スポット名 + "Spot"
                const [lng, lat] = f.geometry.coordinates;
                const icon = L.divIcon({
                    className: '',
                    html: '<div style="width:8px;height:8px;background:#9acd32;border:1px solid white;box-shadow:0 0 2px rgba(0,0,0,0.5);"></div>',
                    iconSize: [8, 8],
                    iconAnchor: [4, 4]
                });
                const marker = L.marker([lat, lng], { icon });
                marker.bindPopup(`${name}<br>(Spot)`);
                dataLayer.addLayer(marker);
                count++;
            }
        });

        if (count > 0) showMessage(`${count}件のデータを読み込みました`);

        this.value = '';
    });
}

// ========================================
// ハイキングコースのファイル出力（GeoJSON）
// ========================================

/**
 * [lng, lat] に標高があれば [lng, lat, elevation] を返すヘルパー
 */
function withElev(lng, lat, pointId) {
    const e = elevationStore.get(pointId);
    return e !== undefined ? [lng, lat, e] : [lng, lat];
}

/**
 * コースの全座標を GeoJSON 用 [lng, lat(, elevation)] 配列として組み立てる
 * GPSポイント位置（セグメントの先頭・末尾）に標高値があれば第3要素として付加する
 * キャッシュ済みセグメントを優先し、未キャッシュはマーカーストアから直線で補完する
 */
function buildCourseCoords(course) {
    const { points, segmentRoutes } = course;
    if (points.length === 0) return [];

    // ポイントが1つだけ
    if (points.length === 1) {
        const m = markerStore.get(points[0].pointId);
        if (!m) return [];
        const { lat, lng } = m.getLatLng();
        return [withElev(lng, lat, points[0].pointId)];
    }

    const coords = [];
    for (let i = 0; i < points.length - 1; i++) {
        const seg = segmentRoutes[i]; // [[lat, lng], ...] (Leaflet形式)
        const startId = points[i].pointId;
        const endId   = points[i + 1].pointId;

        if (seg && seg.length > 0) {
            // Leaflet [lat, lng] → GeoJSON [lng, lat(, elev)] に変換
            // セグメントの先頭 = points[i]、末尾 = points[i+1] の位置
            const converted = seg.map((c, idx) => {
                if (idx === 0)             return withElev(c[1], c[0], startId);
                if (idx === seg.length - 1) return withElev(c[1], c[0], endId);
                return [c[1], c[0]]; // 中間ウェイポイントは標高なし
            });
            if (i === 0) {
                coords.push(...converted);
            } else {
                // 先頭座標は前セグメントの末尾と重複するためスキップ
                coords.push(...converted.slice(1));
            }
        } else {
            // 未キャッシュ: マーカーストアから直線で補完
            if (i === 0) {
                const m0 = markerStore.get(startId);
                if (m0) {
                    const ll = m0.getLatLng();
                    coords.push(withElev(ll.lng, ll.lat, startId));
                }
            }
            const m1 = markerStore.get(endId);
            if (m1) {
                const ll = m1.getLatLng();
                coords.push(withElev(ll.lng, ll.lat, endId));
            }
        }
    }
    return coords;
}

export function setupExportButton() {
    document.getElementById('exportBtn').addEventListener('click', function () {
        const courses = getCourses();
        if (courses.length === 0) {
            showMessage('出力するコースがありません', 'warning');
            return;
        }

        const features = courses
            .filter(c => c.points.length > 0)
            .map(c => ({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: buildCourseCoords(c)
                },
                properties: {
                    id: c.id,
                    name: c.name,
                    fixed: c.fixed,
                    points: c.points.map(p => ({ pointId: p.pointId, name: p.name })),
                    // 再読み込み用: セグメントルートを [lng, lat] 形式で保存
                    segments: c.segmentRoutes.map(seg =>
                        seg ? seg.map(coord => [coord[1], coord[0]]) : null
                    )
                }
            }));

        const geojson = { type: 'FeatureCollection', features };
        const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
        const url = URL.createObjectURL(blob);

        const today = new Date();
        const yyyymmdd = today.getFullYear().toString()
            + String(today.getMonth() + 1).padStart(2, '0')
            + String(today.getDate()).padStart(2, '0');
        const filename = `hiking-courses_${yyyymmdd}.geojson`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        showMessage(`${features.length}件のコースを ${filename} に出力しました`);
    });
}

// ========================================
// ハイキングコースのファイル読み込み（GeoJSON）
// ========================================
export function setupImportCourseButton() {
    document.getElementById('courseImportInput').addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const geojson = JSON.parse(text);

            if (!geojson.features || !Array.isArray(geojson.features)) {
                showMessage('有効なGeoJSONではありません', 'error');
                return;
            }

            const imported = geojson.features
                .filter(f => f.properties && Array.isArray(f.properties.points))
                .map(f => {
                    const props = f.properties;
                    const points = props.points.map(p => ({
                        pointId: String(p.pointId),
                        name: p.name || ''
                    }));
                    // segments: [lng, lat] → Leaflet [lat, lng] に戻す
                    const segsRaw = Array.isArray(props.segments)
                        ? props.segments
                        : new Array(Math.max(0, points.length - 1)).fill(null);
                    const segmentRoutes = segsRaw.map(seg =>
                        seg ? seg.map(c => [c[1], c[0]]) : null
                    );
                    return {
                        id: Number(props.id) || 0,
                        name: props.name || '',
                        fixed: Boolean(props.fixed),
                        points,
                        segmentRoutes
                    };
                });

            if (imported.length === 0) {
                showMessage('読み込めるコースがありませんでした', 'warning');
                return;
            }

            loadCourses(imported);
            showMessage(`${imported.length}件のコースを読み込みました`);
        } catch (err) {
            showMessage(`読み込みエラー: ${err.message}`, 'error');
        } finally {
            this.value = '';
        }
    });
}

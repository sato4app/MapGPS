// Excelファイル読み込み機能

import { DEFAULTS } from './constants.js';

const MAX_ROWS = DEFAULTS.MAX_EXCEL_ROWS;

/**
 * Excelファイルを読み込み、GPSポイントの配列を返す
 * @param {File} file
 * @returns {Promise<Array>}
 */
export async function loadExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                if (typeof XLSX === 'undefined') {
                    throw new Error('SheetJSライブラリが読み込まれていません');
                }

                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const worksheet = workbook.Sheets[workbook.SheetNames[0]];

                // 行数制限
                const range = worksheet['!ref'];
                if (range) {
                    const decoded = XLSX.utils.decode_range(range);
                    if (decoded.e.r > MAX_ROWS - 1) {
                        decoded.e.r = MAX_ROWS - 1;
                        worksheet['!ref'] = XLSX.utils.encode_range(decoded);
                    }
                }

                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                const points = parseExcelData(jsonData);
                resolve(points);
            } catch (error) {
                reject(new Error('Excelファイルの読み込みに失敗しました: ' + error.message));
            }
        };

        reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Excel生データをGPSポイントの配列に変換
 * 必須列: ポイントID, 名称, 緯度, 経度
 * オプション列: 標高, 備考
 */
function parseExcelData(rawData) {
    if (!rawData || rawData.length < 2) {
        throw new Error('データが見つかりません');
    }

    const headerRow = rawData[0];
    const required = ['ポイントID', '名称', '緯度', '経度'];
    const optional = ['標高', '備考'];

    const colIndex = {};
    for (const col of [...required, ...optional]) {
        const idx = headerRow.indexOf(col);
        if (idx !== -1) {
            colIndex[col] = idx;
        } else if (required.includes(col)) {
            throw new Error(`必須列「${col}」が見つかりません`);
        }
    }

    const points = [];
    for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        // 必須値チェック
        const values = {};
        let valid = true;
        for (const col of required) {
            const v = row[colIndex[col]];
            if (v === undefined || v === null || v === '') { valid = false; break; }
            values[col] = v;
        }
        if (!valid) continue;

        const lat = parseFloat(values['緯度']);
        const lng = parseFloat(values['経度']);
        if (isNaN(lat) || isNaN(lng)) continue;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

        const point = {
            pointId: values['ポイントID'],
            name: values['名称'],
            lat,
            lng
        };

        for (const col of optional) {
            if (colIndex[col] !== undefined) {
                const v = row[colIndex[col]];
                if (v !== undefined && v !== null && v !== '') {
                    point[col === '標高' ? 'elevation' : 'description'] = v;
                }
            }
        }

        points.push(point);
    }

    return points;
}

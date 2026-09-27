// サンプルデータ生成スクリプト（動作確認用）
// 実行: node sample/make-sample.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const dir = path.dirname(fileURLToPath(import.meta.url));

// 1x1 透明PNG（CLIはPNGの内容を読まないためダミーで十分）
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
fs.writeFileSync(path.join(dir, 'sample-map.png'), Buffer.from(pngBase64, 'base64'));

// マーキングJSON（複合フォーマット）: 箕面大滝周辺
const marks = {
    version: '1.0',
    imageReference: 'sample-map.png',
    data: {
        points: [
            { id: 'A-01', name: '登山口',   x: 100, y: 100 },
            { id: 'A-02', name: '東屋',     x: 900, y: 120 },
            { id: 'A-03', name: '山頂',     x: 880, y: 950 },
            { id: 'A-04', name: '駐車場前', x: 120, y: 930 }
        ],
        routes: [
            {
                routeName: '表参道ルート',
                startPoint: 'A-01',
                endPoint: 'A-02',
                waypoints: [
                    { x: 300, y: 105 },
                    { x: 500, y: 110 },
                    { x: 700, y: 115 }
                ]
            }
        ],
        spots: [
            { name: '見晴台', x: 500, y: 500, description: '絶景ポイント' }
        ],
        areas: [
            {
                id: 'area_01',
                name: '駐車場エリア',
                vertices: [
                    { x: 150, y: 850 },
                    { x: 250, y: 850 },
                    { x: 250, y: 920 },
                    { x: 150, y: 920 }
                ]
            }
        ]
    }
};
fs.writeFileSync(path.join(dir, 'sample-marks.json'), JSON.stringify(marks, null, 2), 'utf-8');

// GPSポイントExcel（画像座標とほぼ整合する緯度経度）
const rows = [
    ['ポイントID', '名称', '緯度', '経度', '標高', '備考'],
    ['A-01', '登山口',   34.858, 135.465, '', '基準点1'],
    ['A-02', '東屋',     34.857, 135.480, '', '基準点2'],
    ['A-03', '山頂',     34.846, 135.479, '', '基準点3'],
    ['A-04', '駐車場前', 34.847, 135.466, '', '基準点4']
];
const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'GPSポイント');
XLSX.writeFile(wb, path.join(dir, 'pointGPS.xlsx'));

console.log('サンプルデータを生成しました: sample-map.png, sample-marks.json, pointGPS.xlsx');

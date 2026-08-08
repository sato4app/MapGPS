// 背景（ハイキングマップ）の表示
// 緊急ポイント・ハイキングルート／スポットの geojson を読み込み、地理院地図に重ねる。
// 位置指定の目印として表示するだけで、編集・出力・公開の対象にはしない。

import { BASEMAP_STYLES } from './constants.js';
import { showMessage } from './message.js';

const state = {
    map: null,
    layer: null,
    counts: { route: 0, point: 0, area: 0 }
};

// 点の形状SVG（minoh-hiking のマーカー設定の既定形状に合わせる）
function pointIconHtml(style) {
    const size = style.size;
    if (style.shape === 'square') {
        return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;">`
            + `<rect x="0" y="0" width="${size}" height="${size}" fill="${style.color}" /></svg>`;
    }
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;">`
        + `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${style.color}" /></svg>`;
}

// 背景の点マーカーを生成する。
// interactive:false とし、クリックは常に地図へ届くようにする
// （追加・移動モードで背景の上をクリックしても地点を追加できるようにするため）。
function createBackgroundMarker(latlng, style) {
    return L.marker(latlng, {
        pane: 'basemapMarkers',
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
            className: 'basemap-marker',
            html: pointIconHtml(style),
            iconSize: [style.size, style.size],
            iconAnchor: [style.size / 2, style.size / 2]
        })
    });
}

// Point の種別（統合GeoJSON の properties.type）に応じたスタイルを返す
function pointStyleFor(type) {
    if (type === 'spot' || type === 'スポット') return BASEMAP_STYLES.spot;
    if (type === 'route_waypoint') {
        return { ...BASEMAP_STYLES.route, shape: 'circle', size: 5 };
    }
    return BASEMAP_STYLES.emergency;
}

// 読み込んだ geojson を1レイヤーとして描画する
function buildLayer(geojson) {
    return L.geoJSON(geojson, {
        pane: 'basemapLines',
        interactive: false,
        style: (feature) => {
            const geomType = feature.geometry && feature.geometry.type;
            if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
                return { ...BASEMAP_STYLES.area, fill: true };
            }
            return BASEMAP_STYLES.route;
        },
        pointToLayer: (feature, latlng) => {
            const type = feature.properties && feature.properties.type;
            return createBackgroundMarker(latlng, pointStyleFor(type));
        }
    });
}

// 種別ごとの件数を数える（表示用）
function countFeatures(geojson) {
    const counts = { route: 0, point: 0, area: 0 };
    (geojson.features || []).forEach(f => {
        const geomType = f.geometry && f.geometry.type;
        if (geomType === 'LineString' || geomType === 'MultiLineString') counts.route++;
        else if (geomType === 'Polygon' || geomType === 'MultiPolygon') counts.area++;
        else if (geomType === 'Point') counts.point++;
    });
    return counts;
}

function updateSummary() {
    const summary = document.getElementById('basemapSummary');
    if (!summary) return;
    if (!state.layer) {
        summary.textContent = '未読み込み';
        return;
    }
    const { route, point, area } = state.counts;
    summary.textContent = `ルート ${route}本 / ポイント ${point}点`
        + (area > 0 ? ` / エリア ${area}件` : '');
}

// 背景データを消去する
function clearBasemap() {
    if (state.layer) {
        state.map.removeLayer(state.layer);
        state.layer = null;
    }
    state.counts = { route: 0, point: 0, area: 0 };
    updateSummary();
}

function setVisible(visible) {
    if (!state.layer) return;
    if (visible) state.layer.addTo(state.map);
    else state.map.removeLayer(state.layer);
}

// ファイル読み込み（複数ファイルをまとめて読み込み可。既存の背景に追加する）
async function handleFilesSelected(files) {
    let loadedFiles = 0;

    for (const file of files) {
        let json;
        try {
            json = JSON.parse(await file.text());
        } catch {
            showMessage(`読み込みエラー (${file.name}): JSONとして読み込めません`, 'error');
            continue;
        }
        if (!json || !Array.isArray(json.features)) {
            showMessage(`読み込みエラー (${file.name}): 有効なGeoJSONフォーマットではありません`, 'error');
            continue;
        }

        if (!state.layer) {
            state.layer = L.layerGroup();
            if (document.getElementById('basemapVisible').checked) {
                state.layer.addTo(state.map);
            }
        }
        state.layer.addLayer(buildLayer(json));

        const counts = countFeatures(json);
        state.counts.route += counts.route;
        state.counts.point += counts.point;
        state.counts.area += counts.area;
        loadedFiles++;
    }

    updateSummary();
    if (loadedFiles > 0) {
        showMessage(`ハイキングマップを読み込みました（${loadedFiles}ファイル）`, 'success');
    }
}

export function init(map) {
    state.map = map;

    document.getElementById('basemapFileInput').addEventListener('change', async function () {
        const files = Array.from(this.files);
        if (files.length === 0) return;
        try {
            await handleFilesSelected(files);
        } catch (error) {
            console.error('Basemap load error:', error);
            showMessage(`読み込みエラー: ${error.message}`, 'error');
        } finally {
            this.value = '';
        }
    });

    document.getElementById('basemapVisible').addEventListener('change', function () {
        setVisible(this.checked);
    });

    document.getElementById('clearBasemapBtn').addEventListener('click', function () {
        if (!state.layer) {
            showMessage('読み込んだハイキングマップはありません', 'warning');
            return;
        }
        clearBasemap();
        showMessage('ハイキングマップを消去しました', 'success');
    });

    updateSummary();
}

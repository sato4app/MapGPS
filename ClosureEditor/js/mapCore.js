// 地図のコア機能（地理院地図の初期化・レイヤーの重ね順）

import { DEFAULTS } from './constants.js';

// 地図と描画レイヤーの初期化
// 重ね順は専用ペインで制御する:
//   basemapLines(410) < basemapMarkers(590) < 登録地点マーカー(markerPane 600)
// 登録地点は常に背景（ハイキングマップ）より前面に置き、掴み損ねないようにする。
export function initializeMap() {
    const map = L.map('map').setView(DEFAULTS.MAP_CENTER, DEFAULTS.MAP_ZOOM);

    L.tileLayer(DEFAULTS.GSI_TILE_URL, {
        attribution: DEFAULTS.GSI_ATTRIBUTION,
        maxZoom: DEFAULTS.MAP_MAX_ZOOM
    }).addTo(map);

    L.control.scale({
        position: 'bottomright',
        metric: true,
        imperial: false
    }).addTo(map);

    const CustomZoomControl = L.Control.extend({
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');

            const zoomInBtn = L.DomUtil.create('a', 'zoom-in-btn', container);
            zoomInBtn.innerHTML = '＋';
            zoomInBtn.href = '#';
            zoomInBtn.title = 'ズームイン';

            const zoomOutBtn = L.DomUtil.create('a', 'zoom-out-btn', container);
            zoomOutBtn.innerHTML = '－';
            zoomOutBtn.href = '#';
            zoomOutBtn.title = 'ズームアウト';

            L.DomEvent.on(zoomInBtn, 'click', function (e) {
                L.DomEvent.preventDefault(e);
                map.zoomIn();
            });

            L.DomEvent.on(zoomOutBtn, 'click', function (e) {
                L.DomEvent.preventDefault(e);
                map.zoomOut();
            });
            return container;
        },

        onRemove: function () {
            // クリーンアップは特に必要なし
        }
    });

    map.removeControl(map.zoomControl);
    new CustomZoomControl({ position: 'bottomright' }).addTo(map);
    new CustomZoomControl({ position: 'topleft' }).addTo(map);

    map.createPane('basemapLines').style.zIndex = 410;
    map.createPane('basemapMarkers').style.zIndex = 590;

    // 登録地点マーカーの置き場（既定の markerPane を使う）
    const closureLayer = L.layerGroup().addTo(map);

    return { map, closureLayer };
}

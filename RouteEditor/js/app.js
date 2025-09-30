import { DEFAULTS, MODES } from './constants.js';

// メッセージ表示関数（タイプによって表示時間が異なる）
function showMessage(message, type = 'success') {
    // 既存のメッセージがあれば削除
    const existingMsg = document.querySelector('.toast-message');
    if (existingMsg) {
        existingMsg.remove();
    }

    // メッセージ要素を作成
    const msgDiv = document.createElement('div');
    msgDiv.className = `toast-message ${type}`;
    msgDiv.textContent = message;
    document.body.appendChild(msgDiv);

    // タイプによって表示時間を変更
    const displayTime = type === 'error' ? 6000 : type === 'warning' ? 4500 : 3000;

    // 指定時間後に削除
    setTimeout(() => {
        msgDiv.classList.add('fade-out');
        setTimeout(() => msgDiv.remove(), 300);
    }, displayTime);
}

// 地図の初期化
const map = L.map('map').setView(DEFAULTS.MAP_CENTER, DEFAULTS.MAP_ZOOM);

// 地理院地図タイルの追加
L.tileLayer(DEFAULTS.GSI_TILE_URL, {
    attribution: DEFAULTS.GSI_ATTRIBUTION,
    maxZoom: DEFAULTS.MAP_MAX_ZOOM
}).addTo(map);

// スケールコントロールを右下に追加
L.control.scale({
    position: 'bottomright',
    metric: true,
    imperial: false
}).addTo(map);

// カスタムズームコントロールを右下に追加
const CustomZoomControl = L.Control.extend({
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');

        // ズームインボタン
        const zoomInBtn = L.DomUtil.create('a', 'zoom-in-btn', container);
        zoomInBtn.innerHTML = '＋';
        zoomInBtn.href = '#';
        zoomInBtn.title = 'ズームイン';

        // ズームアウトボタン
        const zoomOutBtn = L.DomUtil.create('a', 'zoom-out-btn', container);
        zoomOutBtn.innerHTML = '－';
        zoomOutBtn.href = '#';
        zoomOutBtn.title = 'ズームアウト';

        // イベントハンドラー
        L.DomEvent.on(zoomInBtn, 'click', function(e) {
            L.DomEvent.preventDefault(e);
            map.zoomIn();
        });

        L.DomEvent.on(zoomOutBtn, 'click', function(e) {
            L.DomEvent.preventDefault(e);
            map.zoomOut();
        });
        return container;
    },

    onRemove: function(map) {
        // クリーンアップは特に必要なし
    }
});

// デフォルトのズームコントロールを削除し、カスタムズームコントロールを追加
map.removeControl(map.zoomControl);
new CustomZoomControl({ position: 'bottomright' }).addTo(map);

// GeoJSONレイヤーグループ
let geoJsonLayer = L.layerGroup().addTo(map);
let loadedData = null;
let lastLoadedFileHandle = null; // File System Access API用のファイルハンドル

// 統計情報の更新
function updateStats(geoJsonData) {
    let pointCount = 0;      // ポイントGPS
    let waypointCount = 0;   // ルート中間点
    let spotCount = 0;       // スポット
    let polygonCount = 0;    // ポリゴン
    const waypointRouteIdSet = new Set(); // ルートID収集（中間点から補完）

    // 再帰的にLineString/MultiLineStringを数える
    function countRoutes(obj) {
        if (!obj) return 0;
        const t = obj.type;
        if (t === 'FeatureCollection' && Array.isArray(obj.features)) {
            return obj.features.reduce((sum, f) => sum + countRoutes(f), 0);
        }
        if (t === 'Feature') {
            return countRoutes(obj.geometry);
        }
        if (t === 'GeometryCollection' && Array.isArray(obj.geometries)) {
            return obj.geometries.reduce((sum, g) => sum + countRoutes(g), 0);
        }
        if (t === 'LineString' || t === 'MultiLineString') {
            return 1;
        }
        return 0;
    }

    if (geoJsonData && geoJsonData.features) {
        geoJsonData.features.forEach(feature => {
            const featureType = feature.properties && feature.properties.type;
            const geometryType = feature.geometry && feature.geometry.type;

            // Pointの場合はプロパティのtypeで分類
            if (geometryType === 'Point') {
                if (featureType === 'ポイントGPS') {
                    pointCount++;
                } else if (featureType === 'route_waypoint') {
                    waypointCount++;
                    const rid = feature.properties && feature.properties.route_id;
                    if (rid) waypointRouteIdSet.add(rid);
                } else if (featureType === 'spot') {
                    spotCount++;
                } else {
                    // typeが指定されていない場合はポイントとしてカウント
                    pointCount++;
                }
            }
            // Polygonはスポットまたはポリゴンとしてカウント
            else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
                polygonCount++;
            }
        });
    }

    const lineBasedRouteCount = countRoutes(geoJsonData);
    const routeCount = lineBasedRouteCount > 0 ? lineBasedRouteCount : waypointRouteIdSet.size;

    document.getElementById('fileCount').value = geoJsonData ? '1' : '0';
    document.getElementById('pointCount').value = pointCount;
    // ルートカウントはLineString/MultiLineStringの本数。無ければ中間点のroute_idユニーク数
    document.getElementById('routeCount').value = routeCount;
    // スポットカウントはスポットポイントとポリゴンの合計
    document.getElementById('spotCount').value = spotCount + polygonCount;
}

// ファイル読み込み処理
document.getElementById('fileInput').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (file) {
        // File System Access API対応: ファイルハンドルを保存
        try {
            if ('showOpenFilePicker' in window && file.handle) {
                lastLoadedFileHandle = file.handle;
            }
        } catch (err) {
            // File System Access APIが使えない場合は無視
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const geoJsonData = JSON.parse(e.target.result);

                // 既存のレイヤーをクリア
                geoJsonLayer.clearLayers();

                // GeoJSONデータを地図に追加
                L.geoJSON(geoJsonData, {
                    // 線のみスタイル適用（ポイントには適用しない）
                    style: function(feature) {
                        const type = feature && feature.geometry && feature.geometry.type;
                        if (type === 'LineString' || type === 'MultiLineString' || type === 'Polygon' || type === 'MultiPolygon') {
                            return DEFAULTS.LINE_STYLE;
                        }
                        return undefined;
                    },
                    pointToLayer: function(feature, latlng) {
                        // フィーチャータイプに基づいてスタイルを選択
                        const featureType = feature.properties && feature.properties.type;
                        const style = DEFAULTS.FEATURE_STYLES[featureType] || DEFAULTS.POINT_STYLE;

                        // 形状に基づいてマーカーを作成
                        if (style.shape === 'diamond') {
                            // 菱形（ダイヤモンド型）マーカー
                            return L.marker(latlng, {
                                icon: L.divIcon({
                                    className: 'diamond-marker',
                                    html: `<div style="width: ${style.radius * 2}px; height: ${style.radius * 2}px; background-color: ${style.fillColor}; transform: rotate(45deg); opacity: ${style.fillOpacity};"></div>`,
                                    iconSize: [style.radius * 2, style.radius * 2],
                                    iconAnchor: [style.radius, style.radius]
                                })
                            });
                        } else if (style.shape === 'square') {
                            // 正方形マーカー
                            return L.marker(latlng, {
                                icon: L.divIcon({
                                    className: 'square-marker',
                                    html: `<div style="width: ${style.radius}px; height: ${style.radius}px; background-color: ${style.fillColor}; opacity: ${style.fillOpacity};"></div>`,
                                    iconSize: [style.radius, style.radius],
                                    iconAnchor: [style.radius / 2, style.radius / 2]
                                })
                            });
                        } else {
                            // デフォルトの円形マーカー
                            return L.circleMarker(latlng, style);
                        }
                    },
                    onEachFeature: function(feature, layer) {
                        if (feature.properties && feature.properties.name) {
                            layer.bindPopup(feature.properties.name);
                        }
                    }
                }).addTo(geoJsonLayer);

                loadedData = geoJsonData;
                updateStats(geoJsonData);

                // データの範囲に地図をフィット
                const group = new L.featureGroup();
                geoJsonLayer.eachLayer(layer => group.addLayer(layer));
                if (group.getBounds().isValid()) {
                    map.fitBounds(group.getBounds(), {padding: [10, 10]});
                }

                showMessage('GeoJSONファイルを読み込みました');
            } catch (error) {
                showMessage('ファイルの読み込みに失敗しました: ' + error.message, 'error');
            }
        };
        
        reader.readAsText(file);
    }
});

// 日付文字列生成関数（yyyymmdd形式）
function getDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// ファイル出力処理
document.getElementById('exportBtn').addEventListener('click', async function() {
    if (!loadedData) {
        showMessage('出力するデータがありません。先にGeoJSONファイルを読み込んでください。', 'warning');
        return;
    }

    const dataStr = JSON.stringify(loadedData, null, 2);
    const blob = new Blob([dataStr], {type: 'application/json'});
    const filename = `MapGPS-${getDateString()}.geojson`;

    // File System Access APIが使える場合は、読み込んだフォルダに保存
    if ('showSaveFilePicker' in window) {
        try {
            const options = {
                suggestedName: filename,
                types: [{
                    description: 'GeoJSON Files',
                    accept: {'application/json': ['.geojson', '.json']}
                }]
            };

            // 読み込み時のディレクトリハンドルがあれば、同じディレクトリを開始場所にする
            if (lastLoadedFileHandle) {
                try {
                    // ファイルハンドルから親ディレクトリを取得することはできないため、
                    // ブラウザのデフォルト動作（最後に使用したフォルダ）に依存
                } catch (err) {
                    // 無視
                }
            }

            const handle = await window.showSaveFilePicker(options);
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();

            showMessage('GeoJSONファイルを出力しました');
            return;
        } catch (err) {
            if (err.name === 'AbortError') {
                // ユーザーがキャンセルした場合
                return;
            }
            console.warn('File System Access API使用失敗、フォールバック:', err);
        }
    }

    // フォールバック: 従来のダウンロード方式
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMessage('GeoJSONファイルを出力しました');
});

// モード切り替え処理
document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', function() {
        // 選択状態の表示更新
        document.querySelectorAll('.control-section label span').forEach(span => {
            span.classList.remove('selected');
        });

        if (this.checked) {
            this.nextElementSibling.classList.add('selected');
        }
    });
});

// 初期統計表示
updateStats(null);
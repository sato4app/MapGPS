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
let allPoints = []; // 全ポイントのリスト
let allRoutes = []; // 全ルートのリスト（開始点～終了点のペア）
let selectedRouteId = null; // 選択中のルートID
let markerMap = new Map(); // フィーチャーID/route_idをキーにしたマーカーのマップ
let selectedRouteLine = null; // 選択中のルート線（Leafletポリライン）
let isAddMode = false; // 追加モードフラグ
let mapClickHandler = null; // 地図クリックイベントハンドラー
let isMoveMode = false; // 移動モードフラグ
let draggableMarkers = []; // ドラッグ可能なマーカーのリスト
let isDeleteMode = false; // 削除モードフラグ

// ポイントとルートの抽出
function extractPointsAndRoutes(geoJsonData) {
    allPoints = [];
    allRoutes = [];

    if (!geoJsonData || !geoJsonData.features) {
        return;
    }

    const routeIdSet = new Set(); // route_idのセット

    geoJsonData.features.forEach(feature => {
        const featureType = feature.properties && feature.properties.type;
        const geometryType = feature.geometry && feature.geometry.type;

        // ポイントGPSを収集
        if (geometryType === 'Point' && featureType === 'ポイントGPS') {
            const pointId = feature.properties && feature.properties.id;
            if (pointId) {
                allPoints.push(pointId);
            }
        }

        // ルート中間点からroute_idを収集
        if (geometryType === 'Point' && featureType === 'route_waypoint') {
            const routeId = feature.properties && feature.properties.route_id;
            if (routeId) {
                routeIdSet.add(routeId);
            }
        }
    });

    // route_idからルートを構築
    routeIdSet.forEach(routeId => {
        // route_idの形式: "route_開始ポイントID_to_終了ポイントID"
        // 例: "route_C-03_to_J-01"
        const match = routeId.match(/^route_(.+)_to_(.+)$/);
        if (match) {
            const startId = match[1];
            const endId = match[2];

            allRoutes.push({
                routeId: routeId,          // route_id全体
                startId: startId,          // 開始ポイントID（例: "C-03"）
                endId: endId               // 終了ポイントID（例: "J-01"）
            });
        }
    });
}

// ドロップダウンの更新（route-dropdown-shortのみ）
function updateDropdowns() {
    const routeStartSelect = document.getElementById('routeStart');

    // 以前の選択を保存
    const previousStartSelection = routeStartSelect.value;

    // allRoutesから実際にルートが存在するポイントIDの1文字目を収集
    const routePointIds = new Set();
    allRoutes.forEach(route => {
        routePointIds.add(route.startId);
        routePointIds.add(route.endId);
    });
    const firstChars = [...new Set([...routePointIds].map(id => id.charAt(0)))].sort();

    // 絞り込みドロップダウン（短い方）: ルートが存在するポイントGPSのIDの1文字目のみ
    routeStartSelect.innerHTML = '<option value=""></option>';
    firstChars.forEach(char => {
        const option = document.createElement('option');
        option.value = char;
        option.textContent = char;
        routeStartSelect.appendChild(option);
    });

    // 以前の選択を復元（リストになければ空文字列になる）
    if (previousStartSelection) {
        routeStartSelect.value = previousStartSelection;
        // 選択値がリストになければ自動的に空文字列になる
    }

    // route-dropdown-longとroute-path-dropdownも更新
    updateRouteLongDropdown();
}

// route-dropdown-longの更新（route-dropdown-shortの選択に応じて）
function updateRouteLongDropdown() {
    const routeStartSelect = document.getElementById('routeStart');
    const routeEndSelect = document.getElementById('routeEnd');

    const startCharFilter = routeStartSelect.value; // 1文字フィルター

    // 以前の選択を保存
    const previousEndSelection = routeEndSelect.value;

    // route-dropdown-shortが選択されている場合、選択値を含む開始ポイントIDまたは終了ポイントIDを収集
    let filteredPointIds = [];
    if (startCharFilter) {
        const routePointIds = new Set();
        allRoutes.forEach(route => {
            // 開始ポイントIDが選択値を含む場合、そのIDを追加
            if (route.startId.charAt(0) === startCharFilter) {
                routePointIds.add(route.startId);
            }
            // 終了ポイントIDが選択値を含む場合、そのIDを追加
            if (route.endId.charAt(0) === startCharFilter) {
                routePointIds.add(route.endId);
            }
        });
        filteredPointIds = [...routePointIds].sort();
    } else {
        // 選択されていなければ全てのルートポイントID
        const allRoutePointIds = new Set();
        allRoutes.forEach(route => {
            allRoutePointIds.add(route.startId);
            allRoutePointIds.add(route.endId);
        });
        filteredPointIds = [...allRoutePointIds].sort();
    }

    // route-dropdown-longを再構築
    routeEndSelect.innerHTML = '<option value="">選択</option>';
    filteredPointIds.forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        routeEndSelect.appendChild(option);
    });

    // 以前の選択を復元（リストになければ空文字列になる）
    if (previousEndSelection) {
        routeEndSelect.value = previousEndSelection;
        // 選択値がリストになければ自動的に空文字列になる
    }

    // route-path-dropdownも更新（選択値がリセットされる可能性があるので色をリセット）
    const routePathSelect = document.getElementById('routePath');
    const previousSelection = routePathSelect.value;
    updateRoutePathDropdown();

    // 以前の選択が新しいリストにない場合、ハイライトをリセット
    if (previousSelection && routePathSelect.value !== previousSelection) {
        resetRouteHighlight();
    }
}

// route-path-dropdownの更新（絞り込みに応じて）
function updateRoutePathDropdown() {
    const routeStartSelect = document.getElementById('routeStart');
    const routeEndSelect = document.getElementById('routeEnd');
    const routePathSelect = document.getElementById('routePath');

    const startCharFilter = routeStartSelect.value; // 1文字フィルター
    const endIdFilter = routeEndSelect.value;       // 完全なIDフィルター

    // 以前の選択を保存
    const previousSelection = routePathSelect.value;

    // フィルタリング
    let filteredRoutes = allRoutes;

    // route-dropdown-shortまたはroute-dropdown-longが選択されていれば絞り込み
    if (startCharFilter) {
        filteredRoutes = filteredRoutes.filter(r =>
            r.startId.charAt(0) === startCharFilter || r.endId.charAt(0) === startCharFilter
        );
    }

    if (endIdFilter) {
        filteredRoutes = filteredRoutes.filter(r =>
            r.startId === endIdFilter || r.endId === endIdFilter
        );
    }

    // route-path-dropdownを再構築（選択がなければ全てのルート）
    routePathSelect.innerHTML = '<option value="">開始 ～ 終了ポイント</option>';
    filteredRoutes.forEach(route => {
        // 中間点の数を取得
        const waypointCount = loadedData.features.filter(f =>
            f.properties && f.properties.route_id === route.routeId && f.properties.type === 'route_waypoint'
        ).length;

        const option = document.createElement('option');
        option.value = route.routeId;
        option.textContent = `${route.startId} ～ ${route.endId} (${waypointCount})`;
        routePathSelect.appendChild(option);
    });

    // 以前の選択を復元
    if (previousSelection) {
        routePathSelect.value = previousSelection;
    }

    // 以前の選択が新しいリストにない場合、ハイライトをリセット
    if (previousSelection && routePathSelect.value !== previousSelection) {
        resetRouteHighlight();
    }
}

// GeoJSONから座標を取得する関数
function getCoordinatesFromGeoJSON(routeId) {
    if (!loadedData || !loadedData.features) return null;

    const coordinates = [];
    const match = routeId.match(/^route_(.+)_to_(.+)$/);
    if (!match) return null;

    const startId = match[1];
    const endId = match[2];

    // 開始ポイントの座標を取得
    const startFeature = loadedData.features.find(f =>
        f.properties && f.properties.type === 'ポイントGPS' && f.properties.id === startId
    );
    if (startFeature && startFeature.geometry && startFeature.geometry.coordinates) {
        const [lng, lat] = startFeature.geometry.coordinates;
        coordinates.push([lat, lng]);
    }

    // 中間点の座標を取得（waypoint_numberでソート）
    const waypoints = loadedData.features
        .filter(f => f.properties && f.properties.route_id === routeId && f.properties.type === 'route_waypoint')
        .sort((a, b) => {
            const numA = parseInt(a.properties.waypoint_number) || 0;
            const numB = parseInt(b.properties.waypoint_number) || 0;
            return numA - numB;
        });

    waypoints.forEach(wp => {
        if (wp.geometry && wp.geometry.coordinates) {
            const [lng, lat] = wp.geometry.coordinates;
            coordinates.push([lat, lng]);
        }
    });

    // 終了ポイントの座標を取得
    const endFeature = loadedData.features.find(f =>
        f.properties && f.properties.type === 'ポイントGPS' && f.properties.id === endId
    );
    if (endFeature && endFeature.geometry && endFeature.geometry.coordinates) {
        const [lng, lat] = endFeature.geometry.coordinates;
        coordinates.push([lat, lng]);
    }

    return coordinates.length >= 2 ? coordinates : null;
}

// ルート選択時のマーカー色変更と線描画
function highlightRoute(routeId) {
    // 以前の選択をリセット
    resetRouteHighlight();

    if (!routeId) return;

    selectedRouteId = routeId;

    // routeIdからstartIdとendIdを抽出
    const match = routeId.match(/^route_(.+)_to_(.+)$/);
    if (!match) return;

    const startId = match[1];
    const endId = match[2];

    // 開始・終了ポイントを赤色に変更
    const startMarker = markerMap.get(startId);
    const endMarker = markerMap.get(endId);

    if (startMarker && startMarker.setStyle) {
        startMarker.setStyle({ fillColor: '#ff0000', color: '#ff0000' });
    }
    if (endMarker && endMarker.setStyle) {
        endMarker.setStyle({ fillColor: '#ff0000', color: '#ff0000' });
    }

    // 中間点を朱色(#ef454a)に変更
    const waypointMarkers = markerMap.get(routeId);
    if (Array.isArray(waypointMarkers)) {
        waypointMarkers.forEach(marker => {
            if (marker && marker.getElement) {
                const element = marker.getElement();
                if (element) {
                    const div = element.querySelector('div');
                    if (div) {
                        div.style.backgroundColor = '#ef454a';
                    }
                }
            }
        });
    }

    // ルート線を描画
    const coordinates = getCoordinatesFromGeoJSON(routeId);
    if (coordinates) {
        selectedRouteLine = L.polyline(coordinates, {
            color: '#ef454a',
            weight: 2
        }).addTo(map);
    }
}

// 中間点を追加する関数
function addWaypointToRoute(routeId, latlng) {
    if (!loadedData || !loadedData.features) return;

    // 既存の中間点の最大waypoint_numberを取得
    let maxWaypointNumber = 0;
    loadedData.features.forEach(feature => {
        if (feature.properties && feature.properties.route_id === routeId && feature.properties.type === 'route_waypoint') {
            const num = parseInt(feature.properties.waypoint_number) || 0;
            if (num > maxWaypointNumber) {
                maxWaypointNumber = num;
            }
        }
    });

    // 新しい中間点フィーチャーを作成
    const newWaypoint = {
        type: 'Feature',
        properties: {
            type: 'route_waypoint',
            route_id: routeId,
            waypoint_number: (maxWaypointNumber + 1).toString()
        },
        geometry: {
            type: 'Point',
            coordinates: [latlng.lng, latlng.lat]
        }
    };

    // GeoJSONデータに追加
    loadedData.features.push(newWaypoint);

    // 新しいマーカーを作成して地図に追加
    const style = DEFAULTS.FEATURE_STYLES['route_waypoint'];
    const marker = L.marker(latlng, {
        icon: L.divIcon({
            className: 'diamond-marker',
            html: `<div style="width: ${style.radius * 2}px; height: ${style.radius * 2}px; background-color: #ef454a; transform: rotate(45deg); opacity: ${style.fillOpacity};"></div>`,
            iconSize: [style.radius * 2, style.radius * 2],
            iconAnchor: [style.radius, style.radius]
        })
    }).addTo(geoJsonLayer);

    // markerMapに追加
    if (!markerMap.has(routeId)) {
        markerMap.set(routeId, []);
    }
    markerMap.get(routeId).push(marker);

    // route-path-dropdownを更新（中間点数が変わったため）
    updateRoutePathDropdown();
}

// ルート線を再描画する関数
function redrawRouteLine(routeId) {
    // 既存のルート線を削除
    if (selectedRouteLine) {
        map.removeLayer(selectedRouteLine);
        selectedRouteLine = null;
    }

    // 新しい座標を取得して描画
    const coordinates = getCoordinatesFromGeoJSON(routeId);
    if (coordinates) {
        selectedRouteLine = L.polyline(coordinates, {
            color: '#ef454a',
            weight: 2
        }).addTo(map);
    }
}

// ルートハイライトのリセット
function resetRouteHighlight() {
    if (!selectedRouteId) return;

    // routeIdからstartIdとendIdを抽出
    const match = selectedRouteId.match(/^route_(.+)_to_(.+)$/);
    if (match) {
        const startId = match[1];
        const endId = match[2];

        // 開始・終了ポイントを元の色（緑）に戻す
        const startMarker = markerMap.get(startId);
        const endMarker = markerMap.get(endId);

        if (startMarker && startMarker.setStyle) {
            startMarker.setStyle(DEFAULTS.FEATURE_STYLES['ポイントGPS']);
        }
        if (endMarker && endMarker.setStyle) {
            endMarker.setStyle(DEFAULTS.FEATURE_STYLES['ポイントGPS']);
        }
    }

    // 中間点を元の色（橙色）に戻す
    const waypointMarkers = markerMap.get(selectedRouteId);
    if (Array.isArray(waypointMarkers)) {
        waypointMarkers.forEach(marker => {
            if (marker && marker.getElement) {
                const element = marker.getElement();
                if (element) {
                    const div = element.querySelector('div');
                    if (div) {
                        div.style.backgroundColor = '#f58220';
                    }
                }
            }
        });
    }

    // ルート線を削除
    if (selectedRouteLine) {
        map.removeLayer(selectedRouteLine);
        selectedRouteLine = null;
    }

    selectedRouteId = null;
}

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
                markerMap.clear();

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

                        let marker;
                        // 形状に基づいてマーカーを作成
                        if (style.shape === 'diamond') {
                            // 菱形（ダイヤモンド型）マーカー
                            marker = L.marker(latlng, {
                                icon: L.divIcon({
                                    className: 'diamond-marker',
                                    html: `<div style="width: ${style.radius * 2}px; height: ${style.radius * 2}px; background-color: ${style.fillColor}; transform: rotate(45deg); opacity: ${style.fillOpacity};"></div>`,
                                    iconSize: [style.radius * 2, style.radius * 2],
                                    iconAnchor: [style.radius, style.radius]
                                })
                            });
                        } else if (style.shape === 'square') {
                            // 正方形マーカー
                            marker = L.marker(latlng, {
                                icon: L.divIcon({
                                    className: 'square-marker',
                                    html: `<div style="width: ${style.radius}px; height: ${style.radius}px; background-color: ${style.fillColor}; opacity: ${style.fillOpacity};"></div>`,
                                    iconSize: [style.radius, style.radius],
                                    iconAnchor: [style.radius / 2, style.radius / 2]
                                })
                            });
                        } else {
                            // デフォルトの円形マーカー
                            marker = L.circleMarker(latlng, style);
                        }

                        // マーカーをマップに保存（ポイントGPSはid、ルート中間点はroute_idをキーに）
                        if (featureType === 'ポイントGPS' && feature.properties && feature.properties.id) {
                            markerMap.set(feature.properties.id, marker);
                        } else if (featureType === 'route_waypoint' && feature.properties && feature.properties.route_id) {
                            const routeId = feature.properties.route_id;
                            if (!markerMap.has(routeId)) {
                                markerMap.set(routeId, []);
                            }
                            markerMap.get(routeId).push(marker);
                        }

                        return marker;
                    },
                    onEachFeature: function(feature, layer) {
                        const featureType = feature.properties && feature.properties.type;

                        // ルート中間点はポップアップ不要
                        if (featureType === 'route_waypoint') {
                            return;
                        }

                        // ポイントGPSの場合はIDをポップアップ表示
                        if (featureType === 'ポイントGPS' && feature.properties && feature.properties.id) {
                            layer.bindPopup(feature.properties.id);
                        }
                        // それ以外のフィーチャーは名称をポップアップ表示
                        else if (feature.properties && feature.properties.name) {
                            layer.bindPopup(feature.properties.name);
                        }
                    }
                }).addTo(geoJsonLayer);

                loadedData = geoJsonData;
                updateStats(geoJsonData);
                extractPointsAndRoutes(geoJsonData);
                updateDropdowns();

                // データの範囲に地図をフィット
                const group = new L.featureGroup();
                geoJsonLayer.eachLayer(layer => group.addLayer(layer));
                if (group.getBounds().isValid()) {
                    map.fitBounds(group.getBounds(), {padding: [10, 10]});
                }

                // ポイントGPSのポップアップを自動表示
                geoJsonLayer.eachLayer(layer => {
                    if (layer.feature && layer.feature.properties && layer.feature.properties.type === 'ポイントGPS') {
                        layer.openPopup();
                    }
                });

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

    // 統計情報を取得
    const pointCount = parseInt(document.getElementById('pointCount').value) || 0;
    const routeCount = parseInt(document.getElementById('routeCount').value) || 0;
    const spotCount = parseInt(document.getElementById('spotCount').value) || 0;

    const dataStr = JSON.stringify(loadedData, null, 2);
    const blob = new Blob([dataStr], {type: 'application/json'});
    const filename = `MapGPS-${getDateString()}_P${pointCount}_R${routeCount}_S${spotCount}.geojson`;

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

        // パネルの表示切り替え
        const geojsonPanel = document.getElementById('geojsonPanel');
        const routePanel = document.getElementById('routePanel');

        if (this.value === MODES.GEOJSON) {
            geojsonPanel.style.display = 'block';
            routePanel.style.display = 'none';
        } else if (this.value === MODES.ROUTE) {
            geojsonPanel.style.display = 'none';
            routePanel.style.display = 'block';
        } else if (this.value === MODES.SPOT) {
            geojsonPanel.style.display = 'none';
            routePanel.style.display = 'none';
        }
    });
});

// 絞り込みドロップダウンの変更イベントリスナー
document.getElementById('routeStart').addEventListener('change', function() {
    updateRouteLongDropdown();
});

document.getElementById('routeEnd').addEventListener('change', function() {
    updateRoutePathDropdown();
});

// route-path-dropdownの変更イベントリスナー（ルートハイライト）
document.getElementById('routePath').addEventListener('change', function() {
    const selectedRouteId = this.value;
    highlightRoute(selectedRouteId);
});

// 追加モードを解除する関数
function exitAddMode() {
    if (!isAddMode) return;

    isAddMode = false;

    // ボタンの押下状態を解除
    const addBtn = document.getElementById('addRouteBtn');
    addBtn.classList.remove('active');

    // 地図クリックイベントを削除
    if (mapClickHandler) {
        map.off('click', mapClickHandler);
        mapClickHandler = null;
    }

    // カーソルを通常に戻す
    map.getContainer().style.cursor = '';
}

// 中間点をドラッグ可能にする関数
function makeWaypointsDraggable(routeId) {
    const waypointMarkers = markerMap.get(routeId);
    if (!Array.isArray(waypointMarkers)) return;

    draggableMarkers = [];

    waypointMarkers.forEach((marker, index) => {
        // divIconを使用しているマーカーを扱う
        if (marker && marker.getElement) {
            const element = marker.getElement();
            if (element) {
                element.style.cursor = 'move';

                // ドラッグ機能を追加
                marker.dragging = marker.dragging || new L.Handler.MarkerDrag(marker);
                marker.dragging.enable();

                // ドラッグ中のイベント
                marker.on('drag', function(e) {
                    // GeoJSONデータの座標を更新
                    const newLatLng = marker.getLatLng();
                    updateWaypointCoordinates(routeId, index, newLatLng);

                    // ルート線を再描画
                    redrawRouteLine(routeId);
                });

                // ドラッグ終了時のイベント
                marker.on('dragend', function(e) {
                    const newLatLng = marker.getLatLng();
                    updateWaypointCoordinates(routeId, index, newLatLng);
                    redrawRouteLine(routeId);
                });

                draggableMarkers.push(marker);
            }
        }
    });
}

// 中間点の座標を更新する関数
function updateWaypointCoordinates(routeId, waypointIndex, latlng) {
    if (!loadedData || !loadedData.features) return;

    // route_idに該当する中間点を取得してソート
    const waypoints = loadedData.features
        .filter(f => f.properties && f.properties.route_id === routeId && f.properties.type === 'route_waypoint')
        .sort((a, b) => {
            const numA = parseInt(a.properties.waypoint_number) || 0;
            const numB = parseInt(b.properties.waypoint_number) || 0;
            return numA - numB;
        });

    // 指定されたインデックスの中間点の座標を更新
    if (waypoints[waypointIndex]) {
        waypoints[waypointIndex].geometry.coordinates = [latlng.lng, latlng.lat];
    }
}

// 移動モードを解除する関数
function exitMoveMode() {
    if (!isMoveMode) return;

    isMoveMode = false;

    // ボタンの押下状態を解除
    const moveBtn = document.getElementById('moveRouteBtn');
    moveBtn.classList.remove('active');

    // 全てのドラッグ可能マーカーのドラッグを無効化
    draggableMarkers.forEach(marker => {
        if (marker && marker.dragging) {
            marker.dragging.disable();
        }
        const element = marker.getElement && marker.getElement();
        if (element) {
            element.style.cursor = '';
        }
    });

    draggableMarkers = [];

    // カーソルを通常に戻す
    map.getContainer().style.cursor = '';
}

// 中間点を削除する関数
function deleteWaypoint(routeId, marker) {
    if (!loadedData || !loadedData.features) return;

    // マーカーの座標を取得
    const markerLatLng = marker.getLatLng();

    // GeoJSONデータから該当する中間点を探して削除
    const waypointIndex = loadedData.features.findIndex(f => {
        if (f.properties && f.properties.route_id === routeId && f.properties.type === 'route_waypoint') {
            if (f.geometry && f.geometry.coordinates) {
                const [lng, lat] = f.geometry.coordinates;
                // 座標が一致する中間点を検索（小数点以下6桁で比較）
                return Math.abs(lat - markerLatLng.lat) < 0.000001 && Math.abs(lng - markerLatLng.lng) < 0.000001;
            }
        }
        return false;
    });

    if (waypointIndex !== -1) {
        // GeoJSONデータから削除
        loadedData.features.splice(waypointIndex, 1);

        // 地図からマーカーを削除
        map.removeLayer(marker);

        // markerMapから削除
        const waypointMarkers = markerMap.get(routeId);
        if (Array.isArray(waypointMarkers)) {
            const markerIdx = waypointMarkers.indexOf(marker);
            if (markerIdx !== -1) {
                waypointMarkers.splice(markerIdx, 1);
            }
        }

        // ルート線を再描画
        redrawRouteLine(routeId);

        // route-path-dropdownを更新（中間点数が変わったため）
        updateRoutePathDropdown();
    }
}

// 中間点をクリック可能にする関数（削除モード用）
function makeWaypointsClickable(routeId) {
    const waypointMarkers = markerMap.get(routeId);
    if (!Array.isArray(waypointMarkers)) return;

    waypointMarkers.forEach(marker => {
        if (marker && marker.getElement) {
            const element = marker.getElement();
            if (element) {
                element.style.cursor = 'pointer';

                // クリックイベントを追加
                marker.on('click', function(e) {
                    if (!isDeleteMode) return;

                    // イベントの伝播を停止（地図のクリックイベントを防ぐ）
                    L.DomEvent.stopPropagation(e);

                    // 中間点を削除
                    deleteWaypoint(routeId, marker);
                });
            }
        }
    });
}

// 削除モードを解除する関数
function exitDeleteMode() {
    if (!isDeleteMode) return;

    isDeleteMode = false;

    // ボタンの押下状態を解除
    const deleteBtn = document.getElementById('deleteRouteBtn');
    deleteBtn.classList.remove('active');

    // カーソルを通常に戻す
    map.getContainer().style.cursor = '';

    // 中間点のカーソルとクリックイベントをリセット
    if (selectedRouteId) {
        const waypointMarkers = markerMap.get(selectedRouteId);
        if (Array.isArray(waypointMarkers)) {
            waypointMarkers.forEach(marker => {
                const element = marker.getElement && marker.getElement();
                if (element) {
                    element.style.cursor = '';
                }
                // クリックイベントを削除
                marker.off('click');
            });
        }
    }
}

// 2点間の距離を計算する関数（ハバーサイン公式）
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // 地球の半径（km）
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // km単位の距離
}

// ルートを最適化する関数（貪欲法：最短距離の点を順次選択）
function optimizeRoute(routeId) {
    if (!loadedData || !loadedData.features) return;

    const match = routeId.match(/^route_(.+)_to_(.+)$/);
    if (!match) return;

    const startId = match[1];
    const endId = match[2];

    // 開始ポイントと終了ポイントの座標を取得
    const startFeature = loadedData.features.find(f =>
        f.properties && f.properties.type === 'ポイントGPS' && f.properties.id === startId
    );
    const endFeature = loadedData.features.find(f =>
        f.properties && f.properties.type === 'ポイントGPS' && f.properties.id === endId
    );

    if (!startFeature || !endFeature) {
        showMessage('開始ポイントまたは終了ポイントが見つかりません', 'error');
        return;
    }

    const [startLng, startLat] = startFeature.geometry.coordinates;
    const [endLng, endLat] = endFeature.geometry.coordinates;

    // 中間点を取得
    const waypoints = loadedData.features.filter(f =>
        f.properties && f.properties.route_id === routeId && f.properties.type === 'route_waypoint'
    );

    if (waypoints.length === 0) {
        showMessage('最適化する中間点がありません', 'warning');
        return;
    }

    // 貪欲法で最適な順序を決定
    const optimizedWaypoints = [];
    const remainingWaypoints = [...waypoints];
    let currentLat = startLat;
    let currentLng = startLng;

    while (remainingWaypoints.length > 0) {
        // 現在位置から最も近い中間点を探す
        let nearestIndex = 0;
        let minDistance = Infinity;

        remainingWaypoints.forEach((wp, index) => {
            const [wpLng, wpLat] = wp.geometry.coordinates;
            const distance = calculateDistance(currentLat, currentLng, wpLat, wpLng);
            if (distance < minDistance) {
                minDistance = distance;
                nearestIndex = index;
            }
        });

        // 最も近い中間点を選択
        const nearestWaypoint = remainingWaypoints.splice(nearestIndex, 1)[0];
        optimizedWaypoints.push(nearestWaypoint);

        // 現在位置を更新
        [currentLng, currentLat] = nearestWaypoint.geometry.coordinates;
    }

    // waypoint_numberを振り直す
    optimizedWaypoints.forEach((wp, index) => {
        wp.properties.waypoint_number = (index + 1).toString();
    });

    showMessage(`ルートを最適化しました（${optimizedWaypoints.length}個の中間点）`, 'success');
}

// ルート編集モードのイベントハンドラー
document.getElementById('addRouteBtn').addEventListener('click', function() {
    const path = document.getElementById('routePath').value;

    if (!path) {
        showMessage('ルートを選択してください', 'warning');
        return;
    }

    // 既に追加モードの場合は解除
    if (isAddMode) {
        exitAddMode();
        showMessage('追加モードを解除しました', 'success');
        return;
    }

    // 他のモードが有効な場合は解除
    if (isMoveMode) {
        exitMoveMode();
    }
    if (isDeleteMode) {
        exitDeleteMode();
    }

    // 追加モードを開始
    isAddMode = true;
    this.classList.add('active');

    // カーソルを十字に変更
    map.getContainer().style.cursor = 'crosshair';

    showMessage('地図上をクリックして中間点を追加してください。\n追加ボタンをもう一度クリックで解除', 'success');

    // 地図クリックイベントを設定
    mapClickHandler = function(e) {
        if (!isAddMode) return;

        // クリック位置に中間点を追加
        addWaypointToRoute(path, e.latlng);

        // ルート線を再描画
        redrawRouteLine(path);

        showMessage('中間点を追加しました', 'success');
    };

    map.on('click', mapClickHandler);
});

document.getElementById('moveRouteBtn').addEventListener('click', function() {
    const path = document.getElementById('routePath').value;

    if (!path) {
        showMessage('ルートを選択してください', 'warning');
        return;
    }

    // 既に移動モードの場合は解除
    if (isMoveMode) {
        exitMoveMode();
        showMessage('移動モードを解除しました', 'success');
        return;
    }

    // 他のモードが有効な場合は解除
    if (isAddMode) {
        exitAddMode();
    }
    if (isDeleteMode) {
        exitDeleteMode();
    }

    // 移動モードを開始
    isMoveMode = true;
    this.classList.add('active');

    // 中間点をドラッグ可能にする
    makeWaypointsDraggable(path);

    showMessage('中間点をドラッグして移動できます。移動ボタンをもう一度クリックで解除', 'success');
});

document.getElementById('deleteRouteBtn').addEventListener('click', function() {
    const path = document.getElementById('routePath').value;

    if (!path) {
        showMessage('ルートを選択してください', 'warning');
        return;
    }

    // 既に削除モードの場合は解除
    if (isDeleteMode) {
        exitDeleteMode();
        showMessage('削除モードを解除しました', 'success');
        return;
    }

    // 他のモードが有効な場合は解除
    if (isAddMode) {
        exitAddMode();
    }
    if (isMoveMode) {
        exitMoveMode();
    }

    // 削除モードを開始
    isDeleteMode = true;
    this.classList.add('active');

    // 中間点をクリック可能にする
    makeWaypointsClickable(path);

    showMessage('中間点をクリックして削除できます。削除ボタンをもう一度クリックで解除', 'success');
});

document.getElementById('optimizeRouteBtn').addEventListener('click', function() {
    const path = document.getElementById('routePath').value;

    if (!path) {
        showMessage('ルートを選択してください', 'warning');
        return;
    }

    // 他のモードが有効な場合は解除
    if (isAddMode) {
        exitAddMode();
    }
    if (isMoveMode) {
        exitMoveMode();
    }
    if (isDeleteMode) {
        exitDeleteMode();
    }

    // ルートを最適化
    optimizeRoute(path);

    // ルート線を再描画
    redrawRouteLine(path);
});

document.getElementById('clearRouteBtn').addEventListener('click', function() {
    const path = document.getElementById('routePath').value;

    if (!path) {
        showMessage('ルートを選択してください', 'warning');
        return;
    }

    // 他のモードが有効な場合は解除
    if (isAddMode) {
        exitAddMode();
    }
    if (isMoveMode) {
        exitMoveMode();
    }
    if (isDeleteMode) {
        exitDeleteMode();
    }

    // ルート名を取得（route-path-dropdownの選択テキスト）
    const routePathSelect = document.getElementById('routePath');
    const selectedOption = routePathSelect.options[routePathSelect.selectedIndex];
    const routeName = selectedOption ? selectedOption.textContent : path;

    // 確認メッセージを表示
    const confirmed = confirm(`ルート ${routeName} を削除しますか？`);
    if (!confirmed) {
        return;
    }

    // ルートの中間点をすべて削除
    if (loadedData && loadedData.features) {
        // 中間点を逆順で削除（配列の要素を削除しながら走査するため）
        for (let i = loadedData.features.length - 1; i >= 0; i--) {
            const feature = loadedData.features[i];
            if (feature.properties &&
                feature.properties.route_id === path &&
                feature.properties.type === 'route_waypoint') {
                loadedData.features.splice(i, 1);
            }
        }
    }

    // 地図から中間点マーカーを削除
    const waypointMarkers = markerMap.get(path);
    if (Array.isArray(waypointMarkers)) {
        waypointMarkers.forEach(marker => {
            map.removeLayer(marker);
        });
        markerMap.delete(path);
    }

    // ルート線を削除
    if (selectedRouteLine) {
        map.removeLayer(selectedRouteLine);
        selectedRouteLine = null;
    }

    // 開始・終了ポイントのマーカー色を元に戻す
    const match = path.match(/^route_(.+)_to_(.+)$/);
    if (match) {
        const startId = match[1];
        const endId = match[2];

        const startMarker = markerMap.get(startId);
        const endMarker = markerMap.get(endId);

        if (startMarker && startMarker.setStyle) {
            startMarker.setStyle(DEFAULTS.FEATURE_STYLES['ポイントGPS']);
        }
        if (endMarker && endMarker.setStyle) {
            endMarker.setStyle(DEFAULTS.FEATURE_STYLES['ポイントGPS']);
        }
    }

    // selectedRouteIdをリセット
    selectedRouteId = null;

    // allRoutesから削除したルートを除外
    const routeIndex = allRoutes.findIndex(r => r.routeId === path);
    if (routeIndex !== -1) {
        allRoutes.splice(routeIndex, 1);
    }

    // route-dropdown-shortとroute-dropdown-longを更新
    updateDropdowns();

    // route-path-dropdownを更新して選択無し状態にする
    document.getElementById('routePath').value = '';

    showMessage('ルートを削除(=クリア)しました', 'success');
});

// リセットボタン：ドロップダウンを一括クリア
document.getElementById('resetDropdownBtn').addEventListener('click', function() {
    // ハイライトをリセット
    resetRouteHighlight();

    document.getElementById('routeStart').value = '';
    document.getElementById('routeEnd').value = '';
    document.getElementById('routePath').value = '';
    updateRouteLongDropdown(); // ルートドロップダウンも初期状態に戻す
    // showMessage('ドロップダウンをリセットしました', 'success');
});

// 初期統計表示
updateStats(null);
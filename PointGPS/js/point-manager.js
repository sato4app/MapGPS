// ポイント表示・編集管理クラス
import { CONFIG } from './config.js';
import { DataUtils } from './data-utils.js';
import { ElevationAPI } from './elevation-api.js';

export class PointManager {
    constructor(mapManager, gpsDataManager) {
        this.mapManager = mapManager;
        this.gpsDataManager = gpsDataManager;
        this.markers = new Map(); // pointId -> marker
        this.selectedMarker = null;
        this.selectedPointId = null;
        this.isAddingPoint = false;
        this.isMovingPoint = false;
        this.appInstance = null; // アプリケーションインスタンスへの参照
        
        // ドラッグ関連の状態
        this.isDragging = false;
        this.draggingMarker = null;
        this.draggingPointId = null;
        
        this.initEventHandlers();
    }

    // アプリケーションインスタンスを設定
    setAppInstance(appInstance) {
        this.appInstance = appInstance;
    }

    // イベントハンドラーを初期化
    initEventHandlers() {
        // 地図クリックでポイント追加モード時の処理
        this.mapManager.onMapClick(async (e) => {
            if (this.isAddingPoint) {
                await this.addPointAtLocation(e.latlng);
                this.setAddingMode(false);
            }
        });

        // 地図全体でのマウスイベント（ドラッグ用、追加モード時のカーソル制御）
        const map = this.mapManager.getMap();
        map.on('mousemove', (e) => {
            if (this.isDragging && this.draggingMarker && this.draggingPointId === this.selectedPointId) {
                this.draggingMarker.setLatLng(e.latlng);
                // ドラッグ中にリアルタイムで座標情報を更新
                this.updateCoordinateFieldsRealtime(e.latlng.lat, e.latlng.lng);
            }
            // 追加モード時のカーソル制御
            else if (this.isAddingPoint) {
                const nearbyPoint = this.findNearbyPoint(e.latlng);
                document.body.style.cursor = nearbyPoint ? 'not-allowed' : 'crosshair';
            }
        });

        map.on('mouseup', (e) => {
            if (this.isDragging && this.draggingMarker) {
                this.stopDragging();
            }
        });
    }

    // すべてのポイントを地図に表示
    displayAllPoints() {
        this.clearAllMarkers();
        
        const points = this.gpsDataManager.getAllPoints();
        points.forEach(point => {
            this.addMarkerForPoint(point);
        });

        this.updatePointCountDisplay();
    }

    // 指定位置の近くに既存ポイントがあるかチェック
    findNearbyPoint(latlng) {
        const map = this.mapManager.getMap();
        const clickPoint = map.latLngToLayerPoint(latlng);

        // すべてのマーカーをチェック
        for (const [pointId, marker] of this.markers) {
            const markerPoint = map.latLngToLayerPoint(marker.getLatLng());
            const distance = clickPoint.distanceTo(markerPoint);

            // 設定距離内に既存ポイントがある場合
            if (distance <= CONFIG.DUPLICATE_CHECK_DISTANCE) {
                const point = this.gpsDataManager.getPointById(pointId);
                return point;
            }
        }

        return null;
    }

    // 指定ポイントのマーカーを追加
    addMarkerForPoint(point) {
        const marker = L.circleMarker([point.lat, point.lng], {
            radius: CONFIG.POINT_MARKER_RADIUS,
            fillColor: CONFIG.POINT_MARKER_COLOR,
            color: CONFIG.POINT_MARKER_COLOR,
            weight: 2,
            opacity: 1,
            fillOpacity: 0.6,
            draggable: false
        }).addTo(this.mapManager.getMap());

        // マーカークリックイベント
        marker.on('click', (e) => {
            if (this.isMovingPoint && this.selectedPointId !== point.id) {
                // 移動モードで他のポイントをクリックした場合、移動モードを解除
                this.setMovingMode(false);
                if (this.appInstance && this.appInstance.resetMoveButtonColor) {
                    this.appInstance.resetMoveButtonColor();
                }
            }
            this.selectPoint(point.id);
            e.originalEvent.stopPropagation();
        });

        // 手動ドラッグ機能を実装
        marker.on('mousedown', (e) => {
            if (this.isMovingPoint && this.selectedPointId === point.id) {
                this.startDragging(marker, point.id, e);
                e.originalEvent.stopPropagation();
                e.originalEvent.preventDefault();
            }
        });

        this.markers.set(point.id, marker);
        
        // ツールチップ表示
        marker.bindTooltip(point.id, {
            permanent: false,
            direction: 'top',
            offset: [0, -10]
        });
    }

    // 指定位置にポイントを追加
    async addPointAtLocation(latlng) {
        // 既存ポイントとの重複チェック
        const nearbyPoint = this.findNearbyPoint(latlng);
        if (nearbyPoint) {
            this.showMessage(DataUtils.formatMessage(CONFIG.MESSAGES.DUPLICATE_POINT_WARNING, {id: nearbyPoint.id}));
            return;
        }

        const point = this.gpsDataManager.addPoint(latlng.lat, latlng.lng);
        this.addMarkerForPoint(point);
        await this.selectPoint(point.id, true); // 新しいポイントフラグをtrueにする
        this.updatePointCountDisplay();
        this.showMessage(DataUtils.formatMessage(CONFIG.MESSAGES.POINT_ADDED, {id: point.id}));

        // 標高をAPIから取得
        await this.ensureElevationIfNeeded(point);

        // すべての処理が完了してからポイントIDフィールドをフォーカス・全選択
        setTimeout(() => {
            const pointIdField = document.getElementById('pointIdField');
            if (pointIdField && point.id.match(/^仮\d{2}$/)) {
                pointIdField.focus();
                pointIdField.select();

                // さらに確実にするため、setSelectionRangeも併用
                setTimeout(() => {
                    pointIdField.setSelectionRange(0, pointIdField.value.length);
                }, 10);
            }
        }, 100);
    }

    // ポイントを選択
    async selectPoint(pointId, isNewPoint = false) {
        // 前回選択されたマーカーの色をリセット
        if (this.selectedMarker) {
            this.selectedMarker.setStyle({
                fillColor: CONFIG.POINT_MARKER_COLOR,
                color: CONFIG.POINT_MARKER_COLOR
            });
        }

        // 新しいマーカーを選択
        const marker = this.markers.get(pointId);
        if (marker) {
            marker.setStyle({
                fillColor: CONFIG.SELECTED_POINT_COLOR,
                color: CONFIG.SELECTED_POINT_COLOR
            });
            
            this.selectedMarker = marker;
            this.selectedPointId = pointId;
            
            // ポイント情報を表示
            const point = this.gpsDataManager.getPointById(pointId);
            if (point) {
                this.updatePointInfoDisplay(point, isNewPoint);
                
                // 標高が正の値でない場合は経度・緯度から標高を取得
                await this.ensureElevationIfNeeded(point);
            }
        }
    }

    // 標高が正の値でない場合に経度・緯度から標高を取得
    async ensureElevationIfNeeded(point) {
        try {
            const updatedElevation = await this.gpsDataManager.ensureValidElevation(point.id);
            
            // 表示を更新
            if (this.selectedPointId === point.id) {
                document.getElementById('elevationField').value = updatedElevation;
            }
        } catch (error) {
            console.warn('標高取得中にエラーが発生しました:', error);
        }
    }

    // ドラッグ後の標高取得・更新（強制的に再取得）
    async fetchAndUpdateElevationAfterDrag(pointId, lat, lng) {
        try {
            const elevation = await ElevationAPI.fetchElevation(lat, lng);
            
            if (elevation !== null) {
                // 標高を更新
                const updates = { elevation: String(elevation) };
                this.gpsDataManager.updatePoint(pointId, updates);
                
                // 表示も更新（選択されているポイントの場合のみ）
                if (this.selectedPointId === pointId) {
                    document.getElementById('elevationField').value = elevation;
                }
            }
        } catch (error) {
            console.warn('ドラッグ後の標高取得中にエラーが発生しました:', error);
        }
    }

    // ポイントの位置を更新
    updatePointPosition(pointId, lat, lng) {
        const point = this.gpsDataManager.updatePoint(pointId, { lat, lng });
        if (point) {
            this.updatePointInfoDisplay(point);
            this.showMessage(DataUtils.formatMessage(CONFIG.MESSAGES.POINT_MOVED, {id: pointId}));
        }
    }

    // 選択されたポイントを削除
    deleteSelectedPoint() {
        if (!this.selectedPointId) {
            this.showMessage(CONFIG.MESSAGES.NO_POINT_SELECTED);
            return;
        }

        // マーカーを地図から削除
        const marker = this.markers.get(this.selectedPointId);
        if (marker) {
            this.mapManager.getMap().removeLayer(marker);
            this.markers.delete(this.selectedPointId);
        }

        // データから削除
        this.gpsDataManager.removePoint(this.selectedPointId);

        // メッセージ用にポイントIDを保存
        const deletedPointId = this.selectedPointId;

        // 選択状態をクリア
        this.selectedMarker = null;
        this.selectedPointId = null;
        this.clearPointInfoDisplay();

        this.updatePointCountDisplay();
        this.showMessage(DataUtils.formatMessage(CONFIG.MESSAGES.POINT_DELETED, {id: deletedPointId}));
    }

    // 全マーカーを削除
    clearAllMarkers() {
        this.markers.forEach(marker => {
            this.mapManager.getMap().removeLayer(marker);
        });
        this.markers.clear();
        this.selectedMarker = null;
        this.selectedPointId = null;
    }

    // ポイント追加モードの設定
    setAddingMode(enabled) {
        this.isAddingPoint = enabled;
        document.body.style.cursor = enabled ? 'crosshair' : 'default';
    }

    // ポイント移動モードの設定
    setMovingMode(enabled) {
        this.isMovingPoint = enabled;
        
        // 選択されたマーカーのみドラッグ可能状態を更新
        if (enabled && this.selectedMarker) {
            // 選択されたマーカーをドラッグ可能にする
            this.selectedMarker.options.draggable = true;
            if (this.selectedMarker.dragging) {
                this.selectedMarker.dragging.enable();
            }
        } else if (!enabled) {
            // すべてのマーカーのドラッグを無効にする
            this.markers.forEach(marker => {
                marker.options.draggable = false;
                if (marker.dragging) {
                    marker.dragging.disable();
                }
            });
        }
        
        document.body.style.cursor = enabled ? 'move' : 'default';
    }

    // ポイント情報表示を更新
    updatePointInfoDisplay(point, isNewPoint = false) {
        const pointIdField = document.getElementById('pointIdField');
        pointIdField.value = point.id;
        document.getElementById('latDecimalField').value = point.lat.toFixed(5);
        document.getElementById('lngDecimalField').value = point.lng.toFixed(5);
        document.getElementById('dmsField').value = 
            this.formatDMSCoordinates(point.lng, point.lat);
        document.getElementById('elevationField').value = point.elevation;
        document.getElementById('locationField').value = point.location;
        document.getElementById('remarksField').value = point.remarks || '';
        
    }

    // ドラッグ中のリアルタイム座標更新（緯度・経度・DMSのみ）
    updateCoordinateFieldsRealtime(lat, lng) {
        document.getElementById('latDecimalField').value = lat.toFixed(5);
        document.getElementById('lngDecimalField').value = lng.toFixed(5);
        document.getElementById('dmsField').value = this.formatDMSCoordinates(lng, lat);
    }

    // ポイント情報表示をクリア
    clearPointInfoDisplay() {
        document.getElementById('pointIdField').value = '';
        document.getElementById('latDecimalField').value = '';
        document.getElementById('lngDecimalField').value = '';
        document.getElementById('dmsField').value = '';
        document.getElementById('elevationField').value = '';
        document.getElementById('locationField').value = '';
        document.getElementById('remarksField').value = '';
    }

    // ポイント数表示を更新
    updatePointCountDisplay() {
        const count = this.gpsDataManager.getPointCount();
        document.getElementById('pointCountField').value = count;
    }

    // 選択されたポイントの情報を更新
    updateSelectedPointInfo() {
        if (!this.selectedPointId) return;

        const updates = {
            id: document.getElementById('pointIdField').value,
            elevation: document.getElementById('elevationField').value,
            location: document.getElementById('locationField').value,
            remarks: document.getElementById('remarksField').value
        };

        this.gpsDataManager.updatePoint(this.selectedPointId, updates);
        
        // IDが変更された場合、マーカーのマップを更新
        if (updates.id !== this.selectedPointId) {
            const marker = this.markers.get(this.selectedPointId);
            this.markers.delete(this.selectedPointId);
            this.markers.set(updates.id, marker);
            this.selectedPointId = updates.id;
            
            // ツールチップを更新
            marker.setTooltipContent(updates.id);
        }
    }

    // DMS座標を「東経・北緯」順でE/N付きでフォーマット
    formatDMSCoordinates(lng, lat) {
        const lngDMS = this.toDMSWithDirection(lng, true);
        const latDMS = this.toDMSWithDirection(lat, false);
        return `${lngDMS} ${latDMS}`;
    }
    
    // 10進数をDMS形式に変換（E/N方向付き）
    toDMSWithDirection(decimal, isLongitude) {
        const absDecimal = Math.abs(decimal);
        const degrees = Math.floor(absDecimal);
        const minutes = Math.floor((absDecimal - degrees) * 60);
        const seconds = ((absDecimal - degrees - minutes / 60) * 3600).toFixed(2);
        
        let direction;
        if (isLongitude) {
            direction = decimal >= 0 ? 'E' : 'W';
        } else {
            direction = decimal >= 0 ? 'N' : 'S';
        }
        
        return `${degrees}°${minutes}'${seconds}"${direction}`;
    }

    // ドラッグ開始
    startDragging(marker, pointId, e) {
        this.isDragging = true;
        this.draggingMarker = marker;
        this.draggingPointId = pointId;
        this.mapManager.getMap().dragging.disable();
        document.body.style.cursor = 'grabbing';
    }
    
    // ドラッグ終了
    async stopDragging() {
        if (this.isDragging && this.draggingMarker && this.draggingPointId) {
            const newLatLng = this.draggingMarker.getLatLng();
            this.updatePointPosition(this.draggingPointId, newLatLng.lat, newLatLng.lng);
            
            // GPS標高を再取得して更新
            await this.fetchAndUpdateElevationAfterDrag(this.draggingPointId, newLatLng.lat, newLatLng.lng);
            
            // 状態をリセット
            this.isDragging = false;
            this.draggingMarker = null;
            this.draggingPointId = null;
            this.mapManager.getMap().dragging.enable();
            
            // 移動モードを解除
            this.setMovingMode(false);
            if (this.appInstance && this.appInstance.resetMoveButtonColor) {
                this.appInstance.resetMoveButtonColor();
            }
            
            document.body.style.cursor = 'default';
        }
    }

    // メッセージを表示
    showMessage(message) {
        const messageArea = document.getElementById('messageArea');
        messageArea.textContent = message;
        messageArea.style.display = 'block';
        
        setTimeout(() => {
            messageArea.style.display = 'none';
        }, CONFIG.MESSAGE_DISPLAY_DURATION);
    }
}
// 画像オーバーレイ機能を管理するモジュール
import { DEFAULTS } from './constants.js';

export class ImageOverlay {
    constructor(mapCore) {
        this.map = mapCore.getMap();
        this.mapCore = mapCore;
        this.imageOverlay = null;
        this.currentImage = new Image();
        this.currentImageFileName = null;
        this.centerMarker = null;
        this.isMovingImage = false;
        this.imageUpdateCallbacks = [];
        this.transformedCenter = null; // アフィン変換結果の中心位置
        
        // 内部scale管理（初期値はconstantsから取得）
        this.currentScale = this.getDefaultScale();
        
        // 初期スケール値を設定
        this.initializeScaleInput();
        

        this.setupEventHandlers();
    }

    // 初期スケール値を設定（UIフィールドは削除済み）
    initializeScaleInput() {
        // scaleInputフィールドは削除されたため、内部scaleのみ初期化
        this.currentScale = this.getDefaultScale();
    }


    // デフォルトスケール値を取得
    getDefaultScale() {
        return DEFAULTS.IMAGE_OVERLAY_DEFAULT_SCALE;
    }

    // デフォルト透過度を取得
    getDefaultOpacity() {
        return DEFAULTS.IMAGE_OVERLAY_DEFAULT_OPACITY;
    }

    // 現在のscale値を取得
    getCurrentScale() {
        return this.currentScale || this.getDefaultScale();
    }

    // scale値を設定
    setCurrentScale(scale) {
        this.currentScale = scale;
        // scaleInputフィールドは削除されたため、内部scaleのみ更新
        
        // スケール変更時に画像表示を更新
        if (this.imageOverlay) {
            this.updateImageDisplay();
        }
    }




    getDisplayOpacity() {
        return this.getDefaultOpacity() / 100;
    }

    updateImageDisplay() {
        if (!this.imageOverlay || !this.currentImage.src) {
            return;
        }

        // 内部管理のscale値を使用
        const scale = this.getCurrentScale();

        // 画像の中心位置：アフィン変換結果があればそれを使用、なければ地図中心を使用
        const centerPos = this.transformedCenter || this.map.getCenter();
        
        // naturalWidth/naturalHeightを使用して正確なピクセル数を取得
        const imageWidth = this.currentImage.naturalWidth || this.currentImage.width;
        const imageHeight = this.currentImage.naturalHeight || this.currentImage.height;
        
        // 画像サイズの妥当性チェック
        if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
            return;
        }
        
        // より正確なメートル/ピクセル変換（Mercator投影補正）
        const metersPerPixel = 156543.03392 * Math.cos(centerPos.lat * Math.PI / 180) / Math.pow(2, this.map.getZoom());
        
        // metersPerPixelの妥当性チェック
        if (!isFinite(metersPerPixel) || metersPerPixel <= 0) {
            return;
        }
        
        // スケールがアフィン変換から計算された場合は、そのまま使用
        // そうでない場合は、従来の計算方法を使用
        let scaledImageWidthMeters, scaledImageHeightMeters;
        
        if (this.transformedCenter) {
            // アフィン変換結果の場合：スケールは既に正規化済み
            scaledImageWidthMeters = imageWidth * scale * metersPerPixel;
            scaledImageHeightMeters = imageHeight * scale * metersPerPixel;
        } else {
            // 通常の場合：従来の計算
            scaledImageWidthMeters = imageWidth * scale * metersPerPixel;
            scaledImageHeightMeters = imageHeight * scale * metersPerPixel;
        }
        
        // 地球半径と緯度による補正
        const earthRadius = 6378137;
        const cosLat = Math.cos(centerPos.lat * Math.PI / 180);
        
        // より精密な座標オフセット計算
        const latOffset = (scaledImageHeightMeters / 2) / earthRadius * (180 / Math.PI);
        const lngOffset = (scaledImageWidthMeters / 2) / (earthRadius * cosLat) * (180 / Math.PI);
        
        // オフセット値の妥当性チェック
        if (!isFinite(latOffset) || !isFinite(lngOffset)) {
            return;
        }
        
        // 境界座標の計算と妥当性チェック
        const southWest = [centerPos.lat - latOffset, centerPos.lng - lngOffset];
        const northEast = [centerPos.lat + latOffset, centerPos.lng + lngOffset];
        
        if (!isFinite(southWest[0]) || !isFinite(southWest[1]) || !isFinite(northEast[0]) || !isFinite(northEast[1])) {
            return;
        }
        
        const bounds = L.latLngBounds(southWest, northEast);
        
        // 画像レイヤーの境界を更新
        this.imageOverlay.setBounds(bounds);
        
        // 画像レイヤーが地図に追加されていない場合は再追加
        if (!this.map.hasLayer(this.imageOverlay)) {
            this.imageOverlay.addTo(this.map);
        }
        
        // 強制的に画像レイヤーを再描画
        if (this.imageOverlay._image) {
            // ImageOverlayにはredrawメソッドがないため、代替手段を使用
            if (typeof this.imageOverlay._reset === 'function') {
                this.imageOverlay._reset();
            } else {
                // _resetが存在しない場合は、画像の透明度を一時的に変更して強制更新
                const currentOpacity = this.imageOverlay.options.opacity;
                this.imageOverlay.setOpacity(currentOpacity === 1 ? 0.99 : 1);
                setTimeout(() => {
                    this.imageOverlay.setOpacity(currentOpacity);
                }, 10);
            }
        }
        
        // 短時間後に地図の強制更新（レンダリングの遅延対策）
        setTimeout(() => {
            this.map.invalidateSize();
        }, 50);
        
        
        // 画像更新をコールバックに通知
        this.notifyImageUpdate();
    }


    setupEventHandlers() {
        // 透過度は固定値のみ使用するため、イベントハンドラーは不要
    }

    loadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                this.currentImage.onload = () => {
                    if (this.imageOverlay) {
                        this.map.removeLayer(this.imageOverlay);
                    }
                    
                    this.imageOverlay = L.imageOverlay(e.target.result, this.getInitialBounds(), {
                        opacity: this.getDisplayOpacity(),
                        interactive: false
                    }).addTo(this.map);
                    
                    // ファイル名を記録
                    this.currentImageFileName = file.name;
                    
                    // 画像レイヤーが完全に読み込まれるまで少し待つ
                    setTimeout(() => {
                        this.updateImageDisplay();
                        resolve();
                    }, 100);
                };
                
                this.currentImage.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
                this.currentImage.src = e.target.result;
            };
            
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsDataURL(file);
        });
    }

    // 現在読み込まれている画像の情報を取得
    getCurrentImageInfo() {
        return {
            fileName: this.currentImageFileName,
            isLoaded: this.imageOverlay !== null
        };
    }

    // 画像更新時のコールバックを登録
    addImageUpdateCallback(callback) {
        this.imageUpdateCallbacks.push(callback);
    }

    // アフィン変換結果による画像位置・スケール設定
    setTransformedPosition(centerLat, centerLng, scale) {
        this.transformedCenter = { lat: centerLat, lng: centerLng };
        this.setCurrentScale(scale);
        
        // アフィン変換結果の場合は、直接境界を設定
        if (this.imageOverlay && this.currentImage.src) {
            const imageWidth = this.currentImage.naturalWidth || this.currentImage.width;
            const imageHeight = this.currentImage.naturalHeight || this.currentImage.height;
            
            if (imageWidth && imageHeight) {
                // より正確なメートル/ピクセル変換
                const metersPerPixel = 156543.03392 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, this.map.getZoom());
                
                if (isFinite(metersPerPixel) && metersPerPixel > 0) {
                    const scaledImageWidthMeters = imageWidth * scale * metersPerPixel;
                    const scaledImageHeightMeters = imageHeight * scale * metersPerPixel;
                    
                    // 地球半径と緯度による補正
                    const earthRadius = 6378137;
                    const cosLat = Math.cos(centerLat * Math.PI / 180);
                    
                    const latOffset = (scaledImageHeightMeters / 2) / earthRadius * (180 / Math.PI);
                    const lngOffset = (scaledImageWidthMeters / 2) / (earthRadius * cosLat) * (180 / Math.PI);
                    
                    if (isFinite(latOffset) && isFinite(lngOffset)) {
                        const southWest = [centerLat - latOffset, centerLng - lngOffset];
                        const northEast = [centerLat + latOffset, centerLng + lngOffset];
                        
                        if (isFinite(southWest[0]) && isFinite(southWest[1]) && 
                            isFinite(northEast[0]) && isFinite(northEast[1])) {
                            
                            const bounds = L.latLngBounds(southWest, northEast);
                            this.imageOverlay.setBounds(bounds);
                            
                            // 画像レイヤーが地図に追加されていない場合は再追加
                            if (!this.map.hasLayer(this.imageOverlay)) {
                                this.imageOverlay.addTo(this.map);
                            }
                            
                            // 強制的に画像レイヤーを再描画
                            if (this.imageOverlay._image && typeof this.imageOverlay._reset === 'function') {
                                this.imageOverlay._reset();
                            }
                            
                            // 短時間後に地図の強制更新
                            setTimeout(() => {
                                this.map.invalidateSize();
                            }, 50);
                            
                            // 画像更新をコールバックに通知
                            this.notifyImageUpdate();
                            return;
                        }
                    }
                }
            }
        }
        
        // フォールバック: 通常の更新処理
        this.updateImageDisplay();
    }

    // 画像更新時のコールバックを実行
    notifyImageUpdate() {
        this.imageUpdateCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
            }
        });
    }


    getBounds() {
        // Leafletのimageoverlayインスタンスから現在の境界を取得
        if (this.imageOverlay && typeof this.imageOverlay.getBounds === 'function') {
            return this.imageOverlay.getBounds();
        }
        
        // フォールバック: 初期境界を返す
        return this.getInitialBounds();
    }

    getInitialBounds() {
        const center = this.map.getCenter();
        const offset = 0.001;
        return L.latLngBounds(
            [center.lat - offset, center.lng - offset],
            [center.lat + offset, center.lng + offset]
        );
    }
}
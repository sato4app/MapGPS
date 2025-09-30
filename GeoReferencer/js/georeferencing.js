// ジオリファレンシング（画像重ね合わせ）機能を管理するモジュール
import { Logger, errorHandler } from './utils.js';
import { CONFIG } from './constants.js';
import { mathUtils } from './math-utils.js';
import { AffineTransformation } from './affine-transformation.js';

export class Georeferencing {
    constructor(mapCore, imageOverlay, gpsData) {
        this.logger = new Logger('Georeferencing');
        this.mapCore = mapCore;
        this.imageOverlay = imageOverlay;
        this.gpsData = gpsData;
        this.pointJsonData = null;
        this.currentTransformation = null;
        this.imageCoordinateMarkers = [];
        this.imageUpdateCallbackRegistered = false;

        // 分離されたモジュールのインスタンス化
        this.affineTransformation = new AffineTransformation();
    }

    async executeGeoreferencing() {
        try {
            const currentBounds = this.imageOverlay.getInitialBounds();
            
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;
            
            if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
                throw new Error('画像のピクセル寸法を取得できません。');
            }

            const centerPos = this.mapCore.getMap().getCenter();
            const metersPerPixel = 156543.03392 * Math.cos(centerPos.lat * Math.PI / 180) / Math.pow(2, this.mapCore.getMap().getZoom());
            
            if (!isFinite(metersPerPixel) || metersPerPixel <= 0) {
                throw new Error('座標変換パラメータの計算に失敗しました。');
            }

            const scale = this.imageOverlay.getCurrentScale();
            const scaledImageWidthMeters = imageWidth * scale * metersPerPixel;
            const scaledImageHeightMeters = imageHeight * scale * metersPerPixel;
            
            const earthRadius = 6378137;
            const latOffset = (scaledImageHeightMeters / 2) / earthRadius * (180 / Math.PI);
            const lngOffset = (scaledImageWidthMeters / 2) / (earthRadius * Math.cos(centerPos.lat * Math.PI / 180)) * (180 / Math.PI);
            
            if (!isFinite(latOffset) || !isFinite(lngOffset)) {
                throw new Error('地理座標の計算に失敗しました。');
            }


            this.imageOverlay.updateImageDisplay();
            
        } catch (error) {
            this.logger.error('ジオリファレンス実行エラー', error);
            throw error;
        }
    }

    setupGeoreferencingUI() {
        try {

        } catch (error) {
            this.logger.error('ジオリファレンスUI設定エラー', error);
        }
    }

    async performGeoreferencingCalculations() {
        try {
            const gpsPoints = this.gpsData.getPoints();
            const matchResult = this.matchPointJsonWithGPS(gpsPoints);

            if (matchResult.matchedPairs.length >= 3) {
                await this.performAutomaticGeoreferencing(matchResult.matchedPairs);
            } else {
                this.logger.error(`精密版ジオリファレンシングには最低3つのポイントが必要です。現在: ${matchResult.matchedPairs.length}ポイント`);
                throw new Error(`精密版ジオリファレンシングには最低3つのポイントが必要です。現在: ${matchResult.matchedPairs.length}ポイント`);
            }

            // 画像更新時のコールバックを登録（重複登録を防ぐ）
            if (!this.imageUpdateCallbackRegistered) {
                this.imageOverlay.addImageUpdateCallback(() => {
                    this.syncPointPositions();
                    this.syncRouteSpotPositions();
                });
                this.imageUpdateCallbackRegistered = true;
            }

            return {
                matchedCount: matchResult.matchedPairs.length,
                unmatchedPoints: matchResult.unmatchedPointJsonIds,
                totalPoints: gpsPoints.length,
                totalPointJsons: matchResult.totalPointJsons,
                matchedPairs: matchResult.matchedPairs,
                georeferenceCompleted: true
            };
            
        } catch (error) {
            this.logger.error('ジオリファレンス計算エラー', error);
            throw error;
        }
    }

    async performAutomaticGeoreferencing(matchedPairs) {
        try {
            // 一致するポイント数をすべて使用（精密版のみ）
            const controlPoints = matchedPairs;
            
            const transformation = this.affineTransformation.calculatePreciseTransformation(controlPoints);
            
            if (transformation) {
                await this.applyTransformationToImage(transformation, controlPoints);
                
                // 変換適用後に手動でルート・スポット同期を実行
                this.syncRouteSpotPositions();
            } else {
                this.logger.warn('変換パラメータの計算に失敗しました');
            }

        } catch (error) {
            this.logger.error('自動ジオリファレンシングエラー', error);
            throw error;
        }
    }





    async applyTransformationToImage(transformation, controlPoints) {
        try {
            if (transformation.type === 'precise') {
                await this.applyPreciseTransformation(transformation);
            } else {
                this.logger.error('精密版以外の変換はサポートされていません');
                return;
            }


        } catch (error) {
            this.logger.error('画像変換適用エラー', error);
        }
    }

    async applyPreciseTransformation(transformation) {
        try {
            this.currentTransformation = transformation;

            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;

            // 画像の4隅の座標をアフィン変換でGPS座標に変換
            const corners = [
                { x: 0, y: 0 },                    // 左上
                { x: imageWidth, y: 0 },           // 右上
                { x: imageWidth, y: imageHeight }, // 右下
                { x: 0, y: imageHeight }           // 左下
            ];

            const transformedCorners = corners.map(corner => {
                const webMercatorX = transformation.transformation.a * corner.x +
                                   transformation.transformation.b * corner.y +
                                   transformation.transformation.c;
                const webMercatorY = transformation.transformation.d * corner.x +
                                   transformation.transformation.e * corner.y +
                                   transformation.transformation.f;
                
                return {
                    lat: mathUtils.webMercatorYToLat(webMercatorY),
                    lng: mathUtils.webMercatorXToLon(webMercatorX)
                };
            });

            // 変換後の境界を計算
            const lats = transformedCorners.map(c => c.lat);
            const lngs = transformedCorners.map(c => c.lng);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs);
            const maxLng = Math.max(...lngs);

            // 画像の中心位置を計算
            const centerLat = (minLat + maxLat) / 2;
            const centerLng = (minLng + maxLng) / 2;

            // スケール計算（制御点ベース）
            const scale = this.calculateScaleFromTransformation(transformation);

            this.logger.info(`アフィン変換適用: 中心位置=(${centerLat.toFixed(6)}, ${centerLng.toFixed(6)}), スケール=${scale.toFixed(6)}`);

            // アフィン変換結果による画像位置・スケール設定
            this.imageOverlay.setTransformedPosition(centerLat, centerLng, scale);

            await this.updatePointJsonMarkersAfterTransformation();

        } catch (error) {
            this.logger.error('精密変換適用エラー', error);
            throw error;
        }
    }

    calculateScaleFromTransformation(transformation) {
        try {
            // アフィン変換行列から直接スケールを計算
            const t = transformation.transformation;

            // アフィン変換行列の変形スケールを計算
            // スケールは回転を考慮したベクトルの長さで計算
            const scaleX = Math.sqrt(t.a * t.a + t.d * t.d);
            const scaleY = Math.sqrt(t.b * t.b + t.e * t.e);

            // 平均スケールを使用（等方的スケーリングと仮定）
            const averageScale = (scaleX + scaleY) / 2;

            // 制御点から実際のスケールを計算して検証
            if (transformation.controlPoints && transformation.controlPoints.length >= 2) {
                const point1 = transformation.controlPoints[0];
                const point2 = transformation.controlPoints[1];
                
                // 画像座標での距離
                const imageDistance = Math.sqrt(
                    Math.pow(point2.pointJson.imageX - point1.pointJson.imageX, 2) +
                    Math.pow(point2.pointJson.imageY - point1.pointJson.imageY, 2)
                );
                
                // GPS座標での距離（メートル）
                const gpsDistance = mathUtils.calculateGpsDistance(
                    point1.gpsPoint.lat, point1.gpsPoint.lng,
                    point2.gpsPoint.lat, point2.gpsPoint.lng
                );
                
                if (imageDistance > 0 && gpsDistance > 0) {
                    // 実際のスケール（メートル/ピクセル）
                    const actualScale = gpsDistance / imageDistance;
                    
                    // 現在のズームレベルでの地図解像度で正規化
                    const centerPos = this.mapCore.getMap().getCenter();
                    const currentZoom = this.mapCore.getMap().getZoom();
                    const metersPerPixelAtCenter = mathUtils.calculateMetersPerPixel(centerPos.lat, currentZoom);
                    
                    // 実際のスケールをLeafletのスケールに変換
                    const leafletScale = actualScale / metersPerPixelAtCenter;
                    
                    this.logger.info(`スケール計算: 画像距離=${imageDistance.toFixed(2)}px, GPS距離=${gpsDistance.toFixed(2)}m, 実際スケール=${actualScale.toFixed(6)}m/px, Leafletスケール=${leafletScale.toFixed(6)}`);
                    
                    return leafletScale;
                }
            }

            // フォールバック: アフィン変換行列から計算
            const centerPos = this.mapCore.getMap().getCenter();
            const currentZoom = this.mapCore.getMap().getZoom();
            const metersPerPixelAtCenter = mathUtils.calculateMetersPerPixel(centerPos.lat, currentZoom);
            const leafletScale = averageScale / metersPerPixelAtCenter;

            this.logger.info(`フォールバックスケール計算: 平均スケール=${averageScale.toFixed(6)}, Leafletスケール=${leafletScale.toFixed(6)}`);

            return leafletScale;

        } catch (error) {
            this.logger.error('スケール計算エラー', error);
            return this.imageOverlay.getDefaultScale();
        }
    }



    matchPointJsonWithGPS(gpsPoints) {
        try {
            const matchedPairs = [];
            const unmatchedPointJsonIds = [];
            let totalPointJsons = 0;

            if (!this.pointJsonData) {
                this.logger.warn('ポイントJSONデータが存在しません');
                return {
                    matchedPairs: [],
                    unmatchedPointJsonIds: [],
                    totalPointJsons: 0
                };
            }

            const pointJsonArray = Array.isArray(this.pointJsonData) ? this.pointJsonData : 
                (this.pointJsonData.points ? this.pointJsonData.points : [this.pointJsonData]);

            totalPointJsons = pointJsonArray.length;

            const gpsPointMap = new Map();
            gpsPoints.forEach(gpsPoint => {
                gpsPointMap.set(gpsPoint.pointId, gpsPoint);
            });

            pointJsonArray.forEach((pointJson, index) => {
                const pointJsonId = pointJson.Id || pointJson.id || pointJson.name;
                
                if (!pointJsonId) {
                    this.logger.warn(`ポイントJSON[${index}]にIdが見つかりません:`, pointJson);
                    unmatchedPointJsonIds.push(`[${index}] (IDなし)`);
                    return;
                }

                const matchingGpsPoint = gpsPointMap.get(pointJsonId);

                if (matchingGpsPoint) {
                    const pair = {
                        pointJsonId: pointJsonId,
                        pointJson: pointJson,
                        gpsPoint: matchingGpsPoint
                    };
                    matchedPairs.push(pair);
                } else {
                    unmatchedPointJsonIds.push(pointJsonId);
                }
            });

            return {
                matchedPairs,
                unmatchedPointJsonIds,
                totalPointJsons
            };

        } catch (error) {
            this.logger.error('IDマッチング処理エラー', error);
            return {
                matchedPairs: [],
                unmatchedPointJsonIds: [],
                totalPointJsons: 0
            };
        }
    }

    async updatePointJsonMarkersAfterTransformation() {
        try {
            if (!this.currentTransformation || !this.imageCoordinateMarkers || this.imageCoordinateMarkers.length === 0) {
                return;
            }

            const georefMarkers = this.imageCoordinateMarkers.filter(markerInfo => 
                markerInfo.type === 'georeference-point'
            );


            for (const markerInfo of georefMarkers) {
                const marker = markerInfo.marker;
                const data = markerInfo.data;  // dataから直接取得
                
                if (!data || data.imageX === undefined || data.imageY === undefined) {
                    this.logger.warn('マーカーの画像座標データが不足しています', data);
                    continue;
                }

                const transformedGpsCoords = this.transformImageCoordsToGps(
                    data.imageX, 
                    data.imageY, 
                    this.currentTransformation
                );

                if (transformedGpsCoords) {
                    marker.setLatLng(transformedGpsCoords);
                    const updatedPopupContent = this.createUpdatedPopupContent({
                        imageX: data.imageX,
                        imageY: data.imageY,
                        name: data.name || data.id
                    }, transformedGpsCoords);
                    marker.bindPopup(updatedPopupContent);
                }
            }

            
            // 追加: 確実にポイント位置同期を実行
            this.syncPointPositions();
            
        } catch (error) {
            this.logger.error('ポイントJSONマーカー位置更新エラー', error);
        }
    }



    transformImageCoordsToGps(imageX, imageY, transformation) {
        try {
            
            if (transformation.type === 'precise') {
                const result = mathUtils.applyAffineTransform(imageX, imageY, transformation);
                if (result) {
                }
                return result;
            } else {
                this.logger.error('精密版以外の変換はサポートされていません');
                return null;
            }
            
        } catch (error) {
            this.logger.error('座標変換エラー', error);
            return null;
        }
    }

    createUpdatedPopupContent(pointInfo, transformedCoords) {
        try {
            return pointInfo.name || 'ポイント';
        } catch (error) {
            this.logger.error('ポップアップ内容作成エラー', error);
            return pointInfo.name || 'ポイント';
        }
    }

    syncPointPositions() {
        try {
            if (!this.currentTransformation) {
                this.syncPointPositionsBasedOnImageBounds();
                return;
            }
            this.updateMarkerPositions(true);
        } catch (error) {
            this.logger.error('ポイント位置同期エラー', error);
        }
    }

    // 画像境界ベースの位置同期（ジオリファレンス未適用時）
    syncPointPositionsBasedOnImageBounds() {
        try {
            this.updateMarkerPositions(false);
        } catch (error) {
            this.logger.error('画像境界ベース位置同期エラー', error);
        }
    }

    syncRouteSpotPositions() {
        try {
            if (!this.routeSpotHandler) {
                this.logger.warn('⚠️ RouteSpotHandlerが設定されていません。ルート・スポット同期をスキップします。');
                return;
            }


            // ルートマーカーの位置同期
            if (this.routeSpotHandler.routeMarkers && this.routeSpotHandler.routeMarkers.length > 0) {
                this.syncRouteMarkers();
            }

            // スポットマーカーの位置同期
            if (this.routeSpotHandler.spotMarkers && this.routeSpotHandler.spotMarkers.length > 0) {
                this.syncSpotMarkers();
            }


        } catch (error) {
            this.logger.error('❌ ルート・スポット位置同期エラー', error);
        }
    }

    syncRouteMarkers() {
        try {
            if (!this.routeSpotHandler || !this.routeSpotHandler.routeMarkers) {
                return;
            }


            let movedMarkers = 0;
            let skippedMarkers = 0;

            this.routeSpotHandler.routeMarkers.forEach((marker, index) => {
                const meta = marker.__meta;
                if (marker.setLatLng && typeof marker.setLatLng === 'function') {
                    // 単一のマーカー（ルートの開始/中間/終了点）
                    if (meta && meta.origin === 'image' && meta.imageX !== undefined && meta.imageY !== undefined) {
                        const newPos = this.transformImageCoordsToGps(meta.imageX, meta.imageY, this.currentTransformation);
                        if (newPos) {
                            const currentPos = marker.getLatLng();
                            marker.setLatLng(newPos);
                            movedMarkers++;
                        } else {
                        }
                    } else {
                        // GPS由来は移動しない
                        skippedMarkers++;
                    }
                } else if (marker.getLatLngs && typeof marker.getLatLngs === 'function') {
                    // ポリライン：各頂点のメタを使用
                    const currentLatLngs = marker.getLatLngs();
                    const metaPoints = (marker.__meta && Array.isArray(marker.__meta.points)) ? marker.__meta.points : [];
                    const newLatLngs = currentLatLngs.map((latlng, i) => {
                        const pMeta = metaPoints[i];
                        if (pMeta && pMeta.origin === 'image' && pMeta.imageX !== undefined && pMeta.imageY !== undefined) {
                            const newPos = this.transformImageCoordsToGps(pMeta.imageX, pMeta.imageY, this.currentTransformation);
                            if (newPos) {
                                movedMarkers++;
                                return newPos;
                            }
                        }
                        // GPS由来 or 失敗時は元の座標を維持
                        skippedMarkers++;
                        return [latlng.lat, latlng.lng];
                    });
                    marker.setLatLngs(newLatLngs);
                }
            });


        } catch (error) {
            this.logger.error('❌ ルートマーカー同期エラー', error);
        }
    }

    syncSpotMarkers() {
        try {
            if (!this.routeSpotHandler || !this.routeSpotHandler.spotMarkers) {
                return;
            }


            let moved = 0;
            let skipped = 0;

            this.routeSpotHandler.spotMarkers.forEach((marker, index) => {
                const meta = marker.__meta;
                if (meta && meta.origin === 'image' && meta.imageX !== undefined && meta.imageY !== undefined) {
                    const newPos = this.transformImageCoordsToGps(meta.imageX, meta.imageY, this.currentTransformation);
                    if (newPos) {
                        const currentPos = marker.getLatLng();
                        marker.setLatLng(newPos);
                        moved++;
                    } else {
                        skipped++;
                    }
                } else {
                    // GPS由来は移動しない
                    skipped++;
                }
            });


        } catch (error) {
            this.logger.error('❌ スポットマーカー同期エラー', error);
        }
    }

    transformGpsToCurrentPosition(lat, lng) {
        try {
            // ポイントと同じcurrentTransformationを使用してGPS座標を変換
            if (!this.currentTransformation) {
                return [lat, lng];
            }

            // GPS座標を画像座標系に変換してから、ポイントと同じアフィン変換を適用
            // まず、既存のGPS座標から相対的な画像座標を推定
            const imageCoords = this.estimateImageCoordsFromGps(lat, lng);
            if (!imageCoords) {
                return [lat, lng];
            }

            // ポイントと同じtransformImageCoordsToGpsメソッドを使用
            const transformedGps = this.transformImageCoordsToGps(imageCoords[0], imageCoords[1], this.currentTransformation);
            
            if (transformedGps) {
                return transformedGps;
            } else {
                return [lat, lng];
            }

        } catch (error) {
            this.logger.error('❌ GPS座標変換エラー', error);
            return [lat, lng]; // エラー時は元の座標を返す
        }
    }

    estimateImageCoordsFromGps(lat, lng) {
        try {
            // GPS座標から画像座標への概算変換
            // 初期画像境界を基準として相対位置を画像座標に変換
            const initialBounds = this.imageOverlay.getInitialBounds();
            if (!initialBounds) {
                return null;
            }

            const imageWidth = this.imageOverlay.currentImage?.naturalWidth || this.imageOverlay.currentImage?.width || 1000;
            const imageHeight = this.imageOverlay.currentImage?.naturalHeight || this.imageOverlay.currentImage?.height || 1000;

            // GPS座標を初期境界内での相対位置として計算
            const relativeX = (lng - initialBounds.getWest()) / (initialBounds.getEast() - initialBounds.getWest());
            const relativeY = (lat - initialBounds.getNorth()) / (initialBounds.getSouth() - initialBounds.getNorth());

            // 相対位置を画像座標に変換
            const imageX = relativeX * imageWidth;
            const imageY = relativeY * imageHeight;


            return [imageX, imageY];

        } catch (error) {
            this.logger.error('GPS→画像座標推定エラー', error);
            return null;
        }
    }

    // RouteSpotHandlerインスタンスを設定
    setRouteSpotHandler(routeSpotHandler) {
        this.routeSpotHandler = routeSpotHandler;
    }

    // CoordinateDisplayインスタンスを取得（app-main.jsから注入）
    setCoordinateDisplay(coordinateDisplay) {
        this.coordinateDisplay = coordinateDisplay;
    }

    getCoordinateDisplay() {
        return this.coordinateDisplay;
    }

    // マーカー位置更新の統合メソッド
    updateMarkerPositions(useTransformation) {
        const georefMarkers = this.imageCoordinateMarkers.filter(markerInfo => 
            markerInfo.type === 'georeference-point'
        );

        georefMarkers.forEach((markerInfo, index) => {
            const marker = markerInfo.marker;
            const data = markerInfo.data;

            if (!data || data.imageX === undefined || data.imageY === undefined) {
                this.logger.warn(`マーカー${index}: 画像座標データが不完全`, data);
                return;
            }

            let newLatLng;
            let popupDescription;
            
            if (useTransformation && this.currentTransformation) {
                // ジオリファレンス変換使用
                newLatLng = this.transformImageCoordsToGps(data.imageX, data.imageY, this.currentTransformation);
                popupDescription = 'ジオリファレンス変換適用済み';
            } else {
                // 画像境界ベース変換使用
                const coordinateDisplay = this.getCoordinateDisplay();
                if (coordinateDisplay) {
                    newLatLng = coordinateDisplay.convertImageToLatLng(data.imageX, data.imageY);
                    popupDescription = '画像境界ベース変換';
                }
            }

            if (newLatLng) {
                marker.setLatLng(newLatLng);
                const updatedPopupContent = data.name || data.id || 'ポイント';
                marker.bindPopup(updatedPopupContent);
            }
        });
    }

    setPointJsonData(data) {
        this.pointJsonData = data;
    }

    addImageCoordinateMarker(markerInfo) {
        this.imageCoordinateMarkers.push(markerInfo);
    }

    clearImageCoordinateMarkers(markerType = 'all') {
        if (this.imageCoordinateMarkers && this.imageCoordinateMarkers.length > 0) {
            const markersToRemove = this.imageCoordinateMarkers.filter(markerInfo => {
                if (markerType === 'all') return true;
                return markerInfo.type === markerType;
            });

            markersToRemove.forEach(markerInfo => {
                if (this.mapCore && this.mapCore.getMap()) {
                    this.mapCore.getMap().removeLayer(markerInfo.marker);
                }
            });

            this.imageCoordinateMarkers = this.imageCoordinateMarkers.filter(markerInfo => {
                if (markerType === 'all') return false;
                return markerInfo.type !== markerType;
            });
        }
    }
}
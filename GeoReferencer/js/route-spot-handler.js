// ルート・スポットデータ処理機能を管理するモジュール
// JSONファイル自動判定、ルート・スポットマーカー表示機能を提供
import { Logger, errorHandler } from './utils.js';
import { mathUtils } from './math-utils.js';
import { CoordinateDisplay } from './coordinate-display.js';

export class RouteSpotHandler {
    constructor(mapCore, imageOverlay = null) {
        this.logger = new Logger('RouteSpotHandler');
        this.mapCore = mapCore;
        this.imageOverlay = imageOverlay;
        this.pointData = [];
        this.routeData = [];
        this.spotData = [];
        this.routeMarkers = [];
        this.spotMarkers = [];
        this.pointMarkers = [];
    }

    async importRouteSpotData(dataItems) {
        try {
            if (!dataItems || !dataItems.length) return;

            const routeData = [];
            const spotData = [];

            for (const item of dataItems) {
                try {
                    const data = item.data;
                    const fileName = item.fileName;

                    // JSONファイルの内容を自動判定
                    const detectedType = this.detectJsonType(data);

                    if (detectedType === 'route') {
                        const processedRoutes = this.processRouteData(data, fileName);
                        routeData.push(...processedRoutes);
                    } else if (detectedType === 'spot') {
                        const processedSpots = this.processSpotData(data, fileName);
                        spotData.push(...processedSpots);
                    } else if (detectedType === 'point') {
                        this.logger.warn(`ポイントデータは現在サポートされていません: ${fileName}`);
                        continue;
                    } else {
                        this.logger.warn(`ファイル形式を判定できませんでした: ${fileName}`);
                        continue;
                    }

                } catch (dataError) {
                    this.logger.error(`データ処理エラー: ${item.fileName}`, dataError);
                }
            }

            // ルートデータのマージと表示
            if (routeData.length > 0) {
                this.routeData = this.mergeAndDeduplicate(this.routeData, routeData, 'route');
                if (this.mapCore && this.mapCore.getMap()) {
                    await this.displayRouteSpotOnMap(routeData, 'route');
                }
            }

            // スポットデータのマージと表示
            if (spotData.length > 0) {
                this.spotData = this.mergeAndDeduplicate(this.spotData, spotData, 'spot');
                if (this.mapCore && this.mapCore.getMap()) {
                    await this.displayRouteSpotOnMap(spotData, 'spot');
                }
            }

            // ルート中間点数を計算
            let totalWaypoints = 0;
            routeData.forEach(route => {
                if (route.points && Array.isArray(route.points)) {
                    totalWaypoints += route.points.length;
                }
            });

            if (routeData.length > 0) {
                this.logger.info(`データインポート完了: ルート 中間点 ${totalWaypoints}点`);
            }
            else if (spotData.length > 0) {
                this.logger.info(`データインポート完了: スポット ${spotData.length}個`);
            }
            else {
                this.logger.info(`データインポート完了: ルート なし、スポット なし`);
            }

        } catch (error) {
            this.logger.error('ルート・スポットデータインポートエラー', error);
            throw error; // 呼び出し元でエラーハンドリングする
        }
    }

    detectJsonType(data) {
        try {
            // 複合形式の判定（data.dataラッパー: points/routes/spots/areasが1ファイルに入っている形式）
            // 例: { version, imageReference, imageInfo, data: { points[], routes[], spots[], areas[] } }
            if (data.data && typeof data.data === 'object') {
                const d = data.data;
                if ((d.points && Array.isArray(d.points)) ||
                    (d.routes && Array.isArray(d.routes)) ||
                    (d.spots && Array.isArray(d.spots)) ||
                    (d.areas && Array.isArray(d.areas))) {
                    return 'combined';
                }
            }

            // ルートの判定基準
            // - routeInfoオブジェクトがある
            // - routeInfoは、startPoint, endPoint属性を持つ
            // - pointsオブジェクトがある  
            // - pointsは、type属性(値="waypoint")を持ち、imageX, imageYの座標を持つ
            if (data.routeInfo &&
                data.routeInfo.startPoint &&
                data.routeInfo.endPoint &&
                data.points &&
                Array.isArray(data.points)) {

                // pointsの要素をチェック
                const hasWaypoints = data.points.some(point =>
                    point.type === 'waypoint' &&
                    (point.imageX !== undefined && point.imageY !== undefined)
                );

                if (hasWaypoints) {
                    return 'route';
                }
            }

            // スポットの判定基準
            // - spotsオブジェクトがある
            // - spotsは、name属性(値はブランクでない文字列)を持ち、imageX, imageYの座標を持つ
            if (data.spots && Array.isArray(data.spots)) {
                const hasValidSpots = data.spots.some(spot =>
                    spot.name &&
                    typeof spot.name === 'string' &&
                    spot.name.trim() !== '' &&
                    (spot.imageX !== undefined && spot.imageY !== undefined)
                );

                if (hasValidSpots) {
                    return 'spot';
                }
            }

            // 単一スポットの場合（データがspotsオブジェクトで包まれていない）
            if (data.name &&
                typeof data.name === 'string' &&
                data.name.trim() !== '' &&
                (data.imageX !== undefined && data.imageY !== undefined)) {
                return 'spot';
            }

            // ポイントの判定基準
            // - points配列が存在し、typeが"waypoint"でない要素がある
            if (data.points && Array.isArray(data.points)) {
                const hasNonWaypoints = data.points.some(point =>
                    point.type !== 'waypoint' &&
                    (point.id || point.name) &&
                    (point.imageX !== undefined && point.imageY !== undefined)
                );

                if (hasNonWaypoints) {
                    return 'point';
                }
            }

            // エリアの判定基準
            // - areas配列が存在する
            // - areasの要素にvertices配列があり、{x, y}形式の画像座標を持つ
            if (data.areas && Array.isArray(data.areas)) {
                const hasValidAreas = data.areas.some(area =>
                    area.vertices && Array.isArray(area.vertices) && area.vertices.length > 0 &&
                    area.vertices.some(v => v.x !== undefined && v.y !== undefined)
                );
                if (hasValidAreas) {
                    return 'area';
                }
            }

            this.logger.warn('判定不可能なファイルがありました。処理をスキップします。');
            return null;

        } catch (error) {
            return null;
        }
    }

    processRouteData(data, fileName) {
        const routes = [];

        try {
            const route = {
                ...data,
                fileName: fileName,
                routeId: data.id || fileName.replace('.json', ''),
                startPoint: this.extractStartPoint(data),
                endPoint: this.extractEndPoint(data)
            };

            routes.push(route);

        } catch (error) {
            this.logger.error(`ルートデータ処理エラー: ${fileName}`, error);
        }

        return routes;
    }


    processSpotData(data, fileName) {
        const spots = [];

        try {

            if (Array.isArray(data)) {
                data.forEach((item, index) => {
                    const spot = {
                        ...item,
                        fileName: fileName,
                        spotId: item.id || item.name || `${fileName}_spot_${index}`,
                        coordinates: this.extractCoordinates(item)
                    };

                    spots.push(spot);
                });
            } else if (data && typeof data === 'object') {
                if (data.spots && Array.isArray(data.spots)) {
                    data.spots.forEach((spotItem, index) => {
                        const spot = {
                            ...spotItem,
                            fileName: fileName,
                            spotId: spotItem.id || spotItem.name || `${fileName}_spot_${index}`,
                            coordinates: this.extractCoordinates(spotItem)
                        };

                        spots.push(spot);
                    });
                } else if (data.features && Array.isArray(data.features)) {
                    data.features.forEach((feature, index) => {
                        const coords = feature.geometry && feature.geometry.coordinates;
                        const spot = {
                            ...feature.properties,
                            fileName: fileName,
                            spotId: feature.properties?.id || feature.properties?.name || `${fileName}_spot_${index}`,
                            coordinates: coords ? { lat: coords[1], lng: coords[0] } : this.extractCoordinates(feature.properties)
                        };

                        spots.push(spot);
                    });
                } else {
                    const spot = {
                        ...data,
                        fileName: fileName,
                        spotId: data.id || data.name || `${fileName}_spot_0`,
                        coordinates: this.extractCoordinates(data)
                    };

                    spots.push(spot);
                }
            }


        } catch (error) {
            this.logger.error(`スポットデータ処理エラー: ${fileName}`, error);
        }

        return spots;
    }

    extractStartPoint(route) {
        if (route.routeInfo && route.routeInfo.startPoint) {
            return {
                lat: null,
                lng: null,
                name: route.routeInfo.startPoint,
                id: route.routeInfo.startPoint
            };
        }

        if (route.points && Array.isArray(route.points) && route.points.length > 0) {
            const firstPoint = route.points[0];
            return {
                lat: firstPoint.lat || firstPoint.latitude,
                lng: firstPoint.lng || firstPoint.longitude,
                name: firstPoint.name || firstPoint.id || firstPoint.pointId || 'Start',
                id: firstPoint.id || firstPoint.name || firstPoint.pointId || null
            };
        }

        if (route.coordinates && Array.isArray(route.coordinates) && route.coordinates.length > 0) {
            const firstCoord = route.coordinates[0];
            if (Array.isArray(firstCoord) && firstCoord.length >= 2) {
                return {
                    lat: firstCoord[0],
                    lng: firstCoord[1],
                    name: 'Start',
                    id: '座標のみ'
                };
            }
        }

        if (route.geometry && route.geometry.coordinates && Array.isArray(route.geometry.coordinates) && route.geometry.coordinates.length > 0) {
            const firstCoord = route.geometry.coordinates[0];
            if (Array.isArray(firstCoord) && firstCoord.length >= 2) {
                return {
                    lat: firstCoord[1],
                    lng: firstCoord[0],
                    name: 'Start',
                    id: 'GeoJSON'
                };
            }
        }

        return null;
    }

    extractEndPoint(route) {
        if (route.routeInfo && route.routeInfo.endPoint) {
            return {
                lat: null,
                lng: null,
                name: route.routeInfo.endPoint,
                id: route.routeInfo.endPoint
            };
        }

        if (route.points && Array.isArray(route.points) && route.points.length > 0) {
            const lastPoint = route.points[route.points.length - 1];
            return {
                lat: lastPoint.lat || lastPoint.latitude,
                lng: lastPoint.lng || lastPoint.longitude,
                name: lastPoint.name || lastPoint.id || lastPoint.pointId || 'End',
                id: lastPoint.id || lastPoint.name || lastPoint.pointId || null
            };
        }

        if (route.coordinates && Array.isArray(route.coordinates) && route.coordinates.length > 0) {
            const lastCoord = route.coordinates[route.coordinates.length - 1];
            if (Array.isArray(lastCoord) && lastCoord.length >= 2) {
                return {
                    lat: lastCoord[0],
                    lng: lastCoord[1],
                    name: 'End',
                    id: '座標のみ'
                };
            }
        }

        if (route.geometry && route.geometry.coordinates && Array.isArray(route.geometry.coordinates) && route.geometry.coordinates.length > 0) {
            const lastCoord = route.geometry.coordinates[route.geometry.coordinates.length - 1];
            if (Array.isArray(lastCoord) && lastCoord.length >= 2) {
                return {
                    lat: lastCoord[1],
                    lng: lastCoord[0],
                    name: 'End',
                    id: 'GeoJSON'
                };
            }
        }

        return null;
    }

    extractCoordinates(spot) {
        if (spot.lat && spot.lng) {
            return { lat: spot.lat, lng: spot.lng };
        } else if (spot.latitude && spot.longitude) {
            return { lat: spot.latitude, lng: spot.longitude };
        } else if (spot.coordinates && Array.isArray(spot.coordinates)) {
            return { lat: spot.coordinates[1], lng: spot.coordinates[0] };
        } else if (spot.geometry && spot.geometry.coordinates) {
            const coords = spot.geometry.coordinates;
            return { lat: coords[1], lng: coords[0] };
        } else if (spot.imageX !== undefined && spot.imageY !== undefined && this.imageOverlay) {
            // 画像座標からGPS座標に変換
            return this.convertImageCoordsToGps(spot.imageX, spot.imageY);
        }

        return null;
    }

    convertImageCoordsToGps(imageX, imageY) {
        try {
            if (!this.imageOverlay || !this.imageOverlay.imageOverlay) {
                return null;
            }

            const imageBounds = this.imageOverlay.imageOverlay.getBounds();
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;

            if (!imageBounds || !imageWidth || !imageHeight) {
                return null;
            }

            const result = mathUtils.convertImageCoordsToGps(imageX, imageY, imageBounds, imageWidth, imageHeight);
            return result ? { lat: result[0], lng: result[1] } : null;

        } catch (error) {
            return null;
        }
    }

    mergeAndDeduplicate(existingData, newData, type) {
        const merged = [...existingData];
        let addedCount = 0;
        let updatedCount = 0;

        newData.forEach(newItem => {
            let duplicateIndex = -1;

            if (type === 'route') {
                duplicateIndex = merged.findIndex(existing =>
                    this.isSameRoute(existing, newItem)
                );
            } else if (type === 'spot') {
                duplicateIndex = merged.findIndex(existing =>
                    this.isSameSpot(existing, newItem)
                );
            }

            if (duplicateIndex === -1) {
                // 新規追加
                merged.push(newItem);
                addedCount++;
            } else {
                // 既存ルート/スポットを新しいデータで更新
                if (type === 'spot') {
                    // スポットの場合は名前やその他の属性を更新
                    const existingSpot = merged[duplicateIndex];
                    const updatedSpot = {
                        ...existingSpot,
                        ...newItem,
                        // 座標情報は既存のものを保持（変更しない）
                        coordinates: existingSpot.coordinates
                    };
                    merged[duplicateIndex] = updatedSpot;
                } else {
                    // ルートの場合は全体を置き換え
                    merged[duplicateIndex] = newItem;
                }
                updatedCount++;
            }
        });


        return merged;
    }

    isSameRoute(route1, route2) {
        const start1 = route1.startPoint;
        const end1 = route1.endPoint;
        const start2 = route2.startPoint;
        const end2 = route2.endPoint;

        // 座標データがない場合はIDで比較
        if (!start1 || !end1 || !start2 || !end2) {
            return false;
        }

        // ID比較も追加（座標だけでなくIDも考慮）
        const start1Id = start1.id || start1.name;
        const end1Id = end1.id || end1.name;
        const start2Id = start2.id || start2.name;
        const end2Id = end2.id || end2.name;

        // IDによる比較
        if (start1Id && end1Id && start2Id && end2Id) {
            // 正方向の比較（開始ID→終了IDが同じ）
            const sameDirectionById = (start1Id === start2Id && end1Id === end2Id);

            // 逆方向の比較（開始ID→終了IDが逆）
            const reverseDirectionById = (start1Id === end2Id && end1Id === start2Id);


            return sameDirectionById || reverseDirectionById;
        }

        // 座標による比較
        const tolerance = 0.0001;

        if (start1.lat && start1.lng && end1.lat && end1.lng &&
            start2.lat && start2.lng && end2.lat && end2.lng) {

            // 正方向の比較（開始点→終了点が同じ）
            const sameDirection = (
                Math.abs(start1.lat - start2.lat) < tolerance &&
                Math.abs(start1.lng - start2.lng) < tolerance &&
                Math.abs(end1.lat - end2.lat) < tolerance &&
                Math.abs(end1.lng - end2.lng) < tolerance
            );

            // 逆方向の比較（開始点→終了点が逆）
            const reverseDirection = (
                Math.abs(start1.lat - end2.lat) < tolerance &&
                Math.abs(start1.lng - end2.lng) < tolerance &&
                Math.abs(end1.lat - start2.lat) < tolerance &&
                Math.abs(end1.lng - start2.lng) < tolerance
            );


            return sameDirection || reverseDirection;
        }

        return false;
    }

    isSameSpot(spot1, spot2) {
        // imageX, imageYが両方ある場合はそれで比較（優先）
        if (spot1.imageX !== undefined && spot1.imageY !== undefined &&
            spot2.imageX !== undefined && spot2.imageY !== undefined) {

            const imageXMatch = Math.abs(spot1.imageX - spot2.imageX) < 0.1;
            const imageYMatch = Math.abs(spot1.imageY - spot2.imageY) < 0.1;


            return imageXMatch && imageYMatch;
        }

        // GPS座標で比較
        const coord1 = spot1.coordinates;
        const coord2 = spot2.coordinates;

        if (!coord1 || !coord2) {
            return false;
        }

        const tolerance = 0.0001;
        const latMatch = Math.abs(coord1.lat - coord2.lat) < tolerance;
        const lngMatch = Math.abs(coord1.lng - coord2.lng) < tolerance;


        return latMatch && lngMatch;
    }

    async displayRouteSpotOnMap(data, type) {
        try {
            if (!this.mapCore || !this.mapCore.getMap()) {
                throw new Error('地図が初期化されていません。');
            }


            let displayCount = 0;

            data.forEach((item, index) => {

                if (type === 'route') {
                    let latLngs = [];
                    let points = [];

                    if (item.points && Array.isArray(item.points)) {
                        // Firebaseから読み込んだデータかどうかを判定
                        const isFirebaseData = item.fileName === 'firebase';

                        points = item.points
                            .map((point, index) => {
                                const coords = this.extractCoordinates(point);
                                if (coords) {
                                    // 画像座標の有無を確認
                                    const hasImageCoords = point.imageX !== undefined && point.imageY !== undefined;
                                    // Firebaseデータで画像座標がある場合は'firebase'、そうでない場合は'image'または'gps'
                                    let origin;
                                    if (isFirebaseData && hasImageCoords) {
                                        origin = 'firebase';
                                    } else if (hasImageCoords) {
                                        origin = 'image';
                                    } else {
                                        origin = 'gps';
                                    }

                                    return {
                                        lat: coords.lat,
                                        lng: coords.lng,
                                        name: point.name || point.id || point.pointId || `Point-${index + 1}`,
                                        type: point.type || 'waypoint',
                                        // 元データの出自を保持
                                        __origin: origin,
                                        __imageX: point.imageX,
                                        __imageY: point.imageY
                                    };
                                } else {
                                    return null;
                                }
                            })
                            .filter(p => p !== null);
                        latLngs = points.map(p => [p.lat, p.lng]);
                    } else if (item.coordinates && Array.isArray(item.coordinates)) {
                        latLngs = item.coordinates.map(coord => [coord[1], coord[0]]);
                        points = item.coordinates.map((coord, idx) => ({
                            lat: coord[1],
                            lng: coord[0],
                            name: `Point-${idx + 1}`,
                            type: 'waypoint'
                        }));
                    } else if (item.geometry && item.geometry.coordinates) {
                        latLngs = item.geometry.coordinates.map(coord => [coord[1], coord[0]]);
                        points = item.geometry.coordinates.map((coord, idx) => ({
                            lat: coord[1],
                            lng: coord[0],
                            name: `Point-${idx + 1}`,
                            type: 'waypoint'
                        }));
                    }


                    if (latLngs.length > 1) {
                        points.forEach((point, pointIndex) => {
                            let label = 'ポイント';

                            if (pointIndex === 0) {
                                label = '開始点';
                            } else if (pointIndex === points.length - 1) {
                                label = '終了点';
                            } else {
                                label = '中間点';
                            }

                            // ルートのすべてのポイントをダイヤモンド型マーカーで統一
                            let marker = mathUtils.createCustomMarker([point.lat, point.lng], 'wayPoint', this.mapCore).addTo(this.mapCore.getMap());

                            // マーカーに元座標系メタを付与
                            if (marker) {
                                // __originを優先的に使用（上で正しく設定済み）
                                marker.__meta = {
                                    origin: point.__origin || 'gps',
                                    imageX: point.imageX || point.__imageX,
                                    imageY: point.imageY || point.__imageY,
                                    routeId: item.name || item.routeId,
                                    label: label
                                };
                            }

                            const pointInfo = CoordinateDisplay.createRouteWaypointPopupContent(
                                point,
                                item.name || item.routeId,
                                label,
                                pointIndex
                            );
                            marker.bindPopup(pointInfo);

                            if (!this.routeMarkers) this.routeMarkers = [];
                            this.routeMarkers.push(marker);
                        });

                        displayCount++;
                    }
                } else if (type === 'spot') {
                    let latLng = null;

                    if (item.coordinates && typeof item.coordinates === 'object') {
                        if (item.coordinates.lat && item.coordinates.lng) {
                            latLng = [item.coordinates.lat, item.coordinates.lng];
                        } else if (Array.isArray(item.coordinates)) {
                            latLng = [item.coordinates[1], item.coordinates[0]];
                        }
                    } else if (item.lat && item.lng) {
                        latLng = [item.lat, item.lng];
                    } else if (item.geometry && item.geometry.coordinates) {
                        const coords = item.geometry.coordinates;
                        latLng = [coords[1], coords[0]];
                    }


                    if (latLng && latLng[0] && latLng[1]) {
                        const marker = mathUtils.createCustomMarker(latLng, 'spot', this.mapCore).addTo(this.mapCore.getMap());

                        const spotInfo = CoordinateDisplay.createSpotPopupContent(item, latLng);
                        marker.bindPopup(spotInfo);

                        // スポットにも元座標系メタを付与
                        // Firebaseから読み込んだデータかどうかを判定
                        const isFirebase = item.fileName === 'firebase';
                        const hasImageCoords = item.imageX !== undefined && item.imageY !== undefined;
                        let origin;
                        if (isFirebase && hasImageCoords) {
                            origin = 'firebase';
                        } else if (hasImageCoords) {
                            origin = 'image';
                        } else {
                            origin = 'gps';
                        }

                        marker.__meta = {
                            origin: origin,
                            imageX: item.imageX,
                            imageY: item.imageY,
                            spotId: item.name || item.spotId
                        };

                        if (!this.spotMarkers) this.spotMarkers = [];
                        this.spotMarkers.push(marker);
                        displayCount++;
                    }
                }
            });


        } catch (error) {
            this.logger.error('ルート・スポット地図表示エラー', error);
            throw error;
        }
    }

    getPointCount() {
        return Array.isArray(this.pointData) ? this.pointData.length : 0;
    }

    getRouteCount() {
        return Array.isArray(this.routeData) ? this.routeData.length : 0;
    }

    getSpotCount() {
        return Array.isArray(this.spotData) ? this.spotData.length : 0;
    }





    /**
     * GPS座標から画像座標に変換
     * @param {number} lat - 緯度
     * @param {number} lng - 経度
     * @returns {Object|null} {x, y} 画像座標またはnull
     */
    convertGpsToImageCoords(lat, lng) {
        try {
            if (!this.imageOverlay || !this.imageOverlay.imageOverlay) {
                return null;
            }

            const imageBounds = this.imageOverlay.imageOverlay.getBounds();
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;

            if (!imageBounds || !imageWidth || !imageHeight) {
                return null;
            }

            const result = mathUtils.convertGpsToImageCoords(lat, lng, imageBounds, imageWidth, imageHeight);
            return result ? { x: result[0], y: result[1] } : null;

        } catch (error) {
            this.logger.error('GPS→画像座標変換エラー', error);
            return null;
        }
    }

    /**
     * 画像座標からGPS座標に変換
     * @param {number} imageX - 画像X座標
     * @param {number} imageY - 画像Y座標
     * @returns {Object|null} {lat, lng} GPS座標またはnull
     */
    convertImageCoordsToGps(imageX, imageY) {
        try {
            if (!this.imageOverlay || !this.imageOverlay.imageOverlay) {
                this.logger.warn('ImageOverlayが初期化されていません');
                return null;
            }

            const imageBounds = this.imageOverlay.imageOverlay.getBounds();
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;

            if (!imageBounds || !imageWidth || !imageHeight) {
                this.logger.warn('画像境界または画像サイズが不正です');
                return null;
            }

            const sw = imageBounds.getSouthWest();
            const ne = imageBounds.getNorthEast();
            this.logger.info(`🗺️ 画像境界: SW=(${sw.lat.toFixed(6)}, ${sw.lng.toFixed(6)}), NE=(${ne.lat.toFixed(6)}, ${ne.lng.toFixed(6)}), サイズ=${imageWidth}x${imageHeight}`);

            const result = mathUtils.convertImageCoordsToGps(imageX, imageY, imageBounds, imageWidth, imageHeight);
            if (result) {
                this.logger.info(`📍 画像座標(${imageX}, ${imageY}) → GPS座標(${result[0].toFixed(6)}, ${result[1].toFixed(6)})`);
            }
            return result ? { lat: result[0], lng: result[1] } : null;

        } catch (error) {
            this.logger.error('画像座標→GPS座標変換エラー', error);
            return null;
        }
    }

    /**
     * すべてのマーカーをクリア
     */
    clearAllMarkers() {
        // ルートマーカーをクリア
        if (this.routeMarkers && Array.isArray(this.routeMarkers)) {
            this.routeMarkers.forEach(marker => {
                if (marker && this.mapCore && this.mapCore.getMap()) {
                    this.mapCore.getMap().removeLayer(marker);
                }
            });
            this.routeMarkers = [];
        }

        // スポットマーカーをクリア
        if (this.spotMarkers && Array.isArray(this.spotMarkers)) {
            this.spotMarkers.forEach(marker => {
                if (marker && this.mapCore && this.mapCore.getMap()) {
                    this.mapCore.getMap().removeLayer(marker);
                }
            });
            this.spotMarkers = [];
        }

        // ポイントマーカーをクリア
        if (this.pointMarkers && Array.isArray(this.pointMarkers)) {
            this.pointMarkers.forEach(marker => {
                if (marker && this.mapCore && this.mapCore.getMap()) {
                    this.mapCore.getMap().removeLayer(marker);
                }
            });
            this.pointMarkers = [];
        }
    }

    /**
     * ポイントマーカーのみをクリア
     */
    clearPointMarkers() {
        if (this.pointMarkers && Array.isArray(this.pointMarkers)) {
            this.pointMarkers.forEach(marker => {
                if (marker && this.mapCore && this.mapCore.getMap()) {
                    this.mapCore.getMap().removeLayer(marker);
                }
            });
            this.pointMarkers = [];
        }
    }

    /**
     * ポイントを地図に表示（赤いマーカー）
     * @param {Array} points - ポイントデータ配列
     */
    async displayPointsOnMap(points) {
        try {
            if (!points || points.length === 0) {
                this.logger.info('表示するポイントがありません');
                return;
            }

            this.logger.info(`${points.length}個のポイントを地図に表示します`);

            // ポイントマーカー配列を初期化
            if (!this.pointMarkers) {
                this.pointMarkers = [];
            }

            for (const point of points) {
                // GPS座標がnullまたは無効な場合はスキップ
                if (point.lat === null || point.lng === null || !point.lat || !point.lng) {
                    this.logger.warn(`ポイント ${point.id}: GPS座標がありません（画像座標のみ: ${point.imageX}, ${point.imageY}）`);
                    continue;
                }

                // 赤い円形マーカーを作成（pointJSONタイプ）
                const marker = mathUtils.createCustomMarker(
                    [point.lat, point.lng],
                    'pointJSON',
                    this.mapCore
                ).addTo(this.mapCore.getMap());

                // マーカーにメタ情報を付与
                if (marker) {
                    marker.__meta = {
                        origin: 'json',
                        imageX: point.imageX,
                        imageY: point.imageY,
                        pointId: point.pointId,
                        id: point.id
                    };

                    // ポップアップを追加
                    const popupContent = `
                        <div style="font-size: 12px;">
                            <strong>${point.id}</strong><br>
                            緯度: ${point.lat.toFixed(6)}<br>
                            経度: ${point.lng.toFixed(6)}<br>
                            画像座標: (${Math.round(point.imageX)}, ${Math.round(point.imageY)})
                        </div>
                    `;
                    marker.bindPopup(popupContent);

                    this.pointMarkers.push(marker);
                }
            }

            this.logger.info(`${this.pointMarkers.length}個のポイントマーカーを表示しました`);

        } catch (error) {
            this.logger.error('ポイント地図表示エラー', error);
            throw error;
        }
    }
}
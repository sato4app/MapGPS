// GPS データ処理機能を管理するモジュール
// GeoJSONファイル読み込み、Excelファイル読み込み、地図表示機能を提供
import { Logger, errorHandler } from './utils.js';
import { CONFIG } from './constants.js';
import { mathUtils } from './math-utils.js';
import { CoordinateDisplay } from './coordinate-display.js';

export class GPSData {
    constructor() {
        this.logger = new Logger('GPSData');
        this.gpsMarkers = []; // GPSマーカーとデータを保持
        this.gpsPoints = []; // GPSポイントデータ
        this.map = null;
    }

    // GeoJSONファイル読み込み処理
    async loadGeoJsonFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const geoJsonData = JSON.parse(e.target.result);
                    const processedData = this.processGeoJsonData(geoJsonData);
                    this.gpsPoints = processedData;

                    this.logger.info(`GeoJSON読み込み完了: GPSポイント ${processedData.length}件`);
                    resolve(processedData);
                } catch (error) {
                    this.logger.error('GeoJSON処理エラー', error);
                    reject(new Error('GeoJSONデータの処理に失敗しました: ' + error.message));
                }
            };

            reader.onerror = () => {
                const error = new Error('ファイルの読み込みに失敗しました');
                this.logger.error('ファイル読み込みエラー', error);
                reject(error);
            };

            reader.readAsText(file);
        });
    }

    // GeoJSONデータ処理
    processGeoJsonData(geoJsonData) {
        const processedData = [];

        try {
            if (geoJsonData.type === 'FeatureCollection' && geoJsonData.features) {
                // FeatureCollection形式の場合
                geoJsonData.features.forEach((feature, index) => {
                    if (feature.geometry && feature.geometry.type === 'Point') {
                        const coordinates = feature.geometry.coordinates;
                        const properties = feature.properties || {};

                        const point = {
                            pointId: properties.id || properties.name || `Point_${index + 1}`,
                            lat: coordinates[1],
                            lng: coordinates[0],
                            elevation: coordinates[2] || properties.elevation || 0,
                            location: properties.name || properties.location || properties.description || '',
                            gpsElevation: properties.gpsElevation || 0
                        };

                        processedData.push(point);
                    }
                });
            } else if (geoJsonData.type === 'Feature' && geoJsonData.geometry) {
                // 単一Feature形式の場合
                if (geoJsonData.geometry.type === 'Point') {
                    const coordinates = geoJsonData.geometry.coordinates;
                    const properties = geoJsonData.properties || {};

                    const point = {
                        pointId: properties.id || properties.name || 'Point_1',
                        lat: coordinates[1],
                        lng: coordinates[0],
                        elevation: coordinates[2] || properties.elevation || 0,
                        location: properties.name || properties.location || properties.description || '',
                        gpsElevation: properties.gpsElevation || 0
                    };

                    processedData.push(point);
                }
            }

            return processedData;

        } catch (error) {
            this.logger.error('GeoJSONデータ処理エラー', error);
            throw new Error('GeoJSONデータの形式が正しくありません');
        }
    }

    // 地図上にGPSポイントを表示
    displayPointsOnMap(map) {
        try {
            this.map = map;
            this.clearMarkersFromMap();

            if (!this.gpsPoints || this.gpsPoints.length === 0) {
                this.logger.warn('表示するGPSポイントがありません');
                return;
            }

            this.gpsPoints.forEach((point, index) => {
                const marker = mathUtils.createCustomMarker([point.lat, point.lng], 'gps-point').addTo(map);
                marker.options.title = point.pointId;

                // ポップアップを設定
                const popupContent = CoordinateDisplay.createGpsPopupContent(point);
                marker.bindPopup(popupContent);

                // マーカーを保存
                this.gpsMarkers.push({
                    marker: marker,
                    data: point,
                    index: index
                });
            });

        } catch (error) {
            this.logger.error('GPS ポイント表示エラー', error);
            errorHandler.handle(error, 'GPSポイントの表示に失敗しました。', 'GPS ポイント表示');
        }
    }


    // 地図からマーカーを削除
    clearMarkersFromMap() {
        try {
            this.gpsMarkers.forEach(item => {
                if (this.map && item.marker) {
                    this.map.removeLayer(item.marker);
                }
            });
            this.gpsMarkers = [];
        } catch (error) {
            this.logger.error('GPS マーカー削除エラー', error);
        }
    }

    // GPSポイントデータ取得
    getPoints() {
        return this.gpsPoints;
    }

    // Excelデータから変換されたポイントデータを設定
    setPointsFromExcelData(validatedData) {
        try {
            this.gpsPoints = validatedData;
        } catch (error) {
            this.logger.error('Excel GPSポイント設定エラー', error);
            throw error;
        }
    }

    /**
     * 新しいポイントデータを既存データにマージ（重複チェックあり）
     * @param {Array} newPoints - 新しいポイントデータ配列
     * @returns {number} 追加されたポイント数
     */
    mergePoints(newPoints) {
        try {
            let addedCount = 0;
            // 既存データがない場合はそのまま設定
            if (!this.gpsPoints) {
                this.gpsPoints = [];
            }

            const currentPoints = [...this.gpsPoints];
            const EPSILON = 0.0000001; // 座標比較用の許容誤差

            newPoints.forEach(newPoint => {
                // 重複チェック: ポイントID と 座標(lat, lng) が一致する場合
                const isDuplicate = currentPoints.some(existing => {
                    if (existing.pointId !== newPoint.pointId) return false;

                    const latDiff = Math.abs(existing.lat - newPoint.lat);
                    const lngDiff = Math.abs(existing.lng - newPoint.lng);

                    return latDiff < EPSILON && lngDiff < EPSILON;
                });

                if (!isDuplicate) {
                    currentPoints.push(newPoint);
                    addedCount++;
                }
            });

            this.gpsPoints = currentPoints;
            return addedCount;

        } catch (error) {
            this.logger.error('GPSポイントマージエラー', error);
            throw error;
        }
    }

    // ===============================================
}
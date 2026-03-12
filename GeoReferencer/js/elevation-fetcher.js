// ElevationFetcher.js
// 国土地理院APIから標高データを取得するクラス

import { Logger } from './utils.js';

export class ElevationFetcher {
    constructor() {
        this.logger = new Logger('ElevationFetcher');
        this.DELAY_MS = 500; // 0.5秒待機
        this.GSI_API_BASE = 'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php';
    }

    /**
     * 国土地理院APIから標高を取得
     * @param {number} lng - 経度
     * @param {number} lat - 緯度
     * @returns {Promise<number|null>} 標高値（メートル）またはnull
     */
    async fetchElevation(lng, lat) {
        try {
            const url = `${this.GSI_API_BASE}?lon=${lng}&lat=${lat}&outtype=JSON`;
            this.logger.info(`標高取得API呼び出し: lat=${lat}, lng=${lng}`);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // APIレスポンス: {"elevation": 123.4, "hsrc": "5m メッシュ（レーザ）"}
            if (data && typeof data.elevation === 'number') {
                this.logger.info(`標高取得成功: ${data.elevation}m (出典: ${data.hsrc})`);
                return Math.round(data.elevation * 10) / 10; // 小数点1桁に丸め
            } else {
                this.logger.warn('標高データが取得できませんでした', data);
                return null;
            }

        } catch (error) {
            this.logger.error('標高取得エラー', error);
            return null;
        }
    }

    /**
     * 0.5秒待機
     * @param {number} ms - 待機時間（ミリ秒）
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * メモリ上のルートマーカーに標高を設定
     * @param {Array} routeMarkers - ルートマーカー配列
     * @param {Function} onProgress - 進捗コールバック (current, total)
     * @returns {Promise<Object>} {fetched, failed, total}
     */
    async fetchAndSetRouteMarkersElevation(routeMarkers, onProgress) {
        try {
            this.logger.info(`ルートマーカーの標高取得開始: ${routeMarkers.length}件`);

            let fetchedCount = 0;
            let failedCount = 0;
            let currentIndex = 0;
            const total = routeMarkers.length;

            for (const marker of routeMarkers) {
                const latLng = marker.getLatLng();
                const meta = marker.__meta;

                // 既に標高が設定されている場合はスキップ
                if (meta && meta.elevation !== undefined && meta.elevation !== null) {
                    this.logger.info(`標高既設定をスキップ: ${meta.routeId}`);
                    currentIndex++;
                    if (onProgress) {
                        onProgress(currentIndex, total);
                    }
                    continue;
                }

                // 標高を取得
                const elevation = await this.fetchElevation(latLng.lng, latLng.lat);

                if (elevation !== null) {
                    // マーカーのメタデータに標高を設定
                    if (!marker.__meta) {
                        marker.__meta = {};
                    }
                    marker.__meta.elevation = elevation;
                    fetchedCount++;
                    this.logger.info(`標高設定成功: routeId=${meta?.routeId}, elevation=${elevation}m`);
                } else {
                    failedCount++;
                    this.logger.warn(`標高取得失敗: routeId=${meta?.routeId}`);
                }

                // 進捗コールバック呼び出し
                currentIndex++;
                if (onProgress) {
                    onProgress(currentIndex, total);
                }

                // レート制限: 0.5秒待機
                await this.delay(this.DELAY_MS);
            }

            this.logger.info(`ルートマーカーの標高取得完了: 成功=${fetchedCount}, 失敗=${failedCount}, 合計=${total}`);

            return {
                fetched: fetchedCount,
                failed: failedCount,
                total: total
            };

        } catch (error) {
            this.logger.error('ルートマーカーの標高取得エラー', error);
            throw error;
        }
    }

    /**
     * メモリ上のスポットマーカーに標高を設定
     * @param {Array} spotMarkers - スポットマーカー配列
     * @param {Function} onProgress - 進捗コールバック (current, total)
     * @returns {Promise<Object>} {fetched, failed, total}
     */
    async fetchAndSetSpotMarkersElevation(spotMarkers, onProgress) {
        try {
            this.logger.info(`スポットマーカーの標高取得開始: ${spotMarkers.length}件`);

            let fetchedCount = 0;
            let failedCount = 0;
            let currentIndex = 0;
            const total = spotMarkers.length;

            for (const marker of spotMarkers) {
                const latLng = marker.getLatLng();
                const meta = marker.__meta;

                // 既に標高が設定されている場合はスキップ
                if (meta && meta.elevation !== undefined && meta.elevation !== null) {
                    this.logger.info(`標高既設定をスキップ: ${meta.spotId}`);
                    currentIndex++;
                    if (onProgress) {
                        onProgress(currentIndex, total);
                    }
                    continue;
                }

                // 標高を取得
                const elevation = await this.fetchElevation(latLng.lng, latLng.lat);

                if (elevation !== null) {
                    // マーカーのメタデータに標高を設定
                    if (!marker.__meta) {
                        marker.__meta = {};
                    }
                    marker.__meta.elevation = elevation;
                    fetchedCount++;
                    this.logger.info(`標高設定成功: spotId=${meta?.spotId}, elevation=${elevation}m`);
                } else {
                    failedCount++;
                    this.logger.warn(`標高取得失敗: spotId=${meta?.spotId}`);
                }

                // 進捗コールバック呼び出し
                currentIndex++;
                if (onProgress) {
                    onProgress(currentIndex, total);
                }

                // レート制限: 0.5秒待機
                await this.delay(this.DELAY_MS);
            }

            this.logger.info(`スポットマーカーの標高取得完了: 成功=${fetchedCount}, 失敗=${failedCount}, 合計=${total}`);

            return {
                fetched: fetchedCount,
                failed: failedCount,
                total: total
            };

        } catch (error) {
            this.logger.error('スポットマーカーの標高取得エラー', error);
            throw error;
        }
    }

    /**
     * メモリ上のエリア頂点に標高を設定
     * @param {Object} areaHandler - AreaHandlerインスタンス
     * @param {Function} onProgress - 進捗コールバック (current, total)
     * @returns {Promise<Object>} {fetched, failed, total}
     */
    async fetchAndSetAreaVerticesElevation(areaHandler, onProgress) {
        try {
            // エリアの全頂点を取得
            const vertices = areaHandler.getAllVertices();
            this.logger.info(`エリア頂点の標高取得開始: ${vertices.length}件`);

            let fetchedCount = 0;
            let failedCount = 0;
            let currentIndex = 0;
            const total = vertices.length;

            for (const vertex of vertices) {
                // 既に標高が設定されている場合はスキップ
                if (vertex.elevation !== undefined && vertex.elevation !== null) {
                    this.logger.info(`標高既設定をスキップ: area=${vertex.areaName}, index=${vertex.vertexIndex}`);
                    currentIndex++;
                    if (onProgress) {
                        onProgress(currentIndex, total);
                    }
                    continue;
                }

                // 標高を取得
                const elevation = await this.fetchElevation(vertex.lng, vertex.lat);

                if (elevation !== null) {
                    // AreaHandlerに標高を設定
                    areaHandler.setVertexElevation(vertex.areaName, vertex.vertexIndex, elevation);
                    fetchedCount++;
                    this.logger.info(`標高設定成功: area=${vertex.areaName}, index=${vertex.vertexIndex}, elevation=${elevation}m`);
                } else {
                    failedCount++;
                    this.logger.warn(`標高取得失敗: area=${vertex.areaName}, index=${vertex.vertexIndex}`);
                }

                // 進捗コールバック呼び出し
                currentIndex++;
                if (onProgress) {
                    onProgress(currentIndex, total);
                }

                // レート制限: 0.5秒待機
                await this.delay(this.DELAY_MS);
            }

            this.logger.info(`エリア頂点の標高取得完了: 成功=${fetchedCount}, 失敗=${failedCount}, 合計=${total}`);

            return {
                fetched: fetchedCount,
                failed: failedCount,
                total: total
            };

        } catch (error) {
            this.logger.error('エリア頂点の標高取得エラー', error);
            throw error;
        }
    }



    /**
     * ポイント（画像変換）の標高を取得してpointDataに設定
     * @param {Array} pointData - routeSpotHandler.pointData配列
     * @param {Object} georeferencing - Georeferencingインスタンス
     * @param {Function} onProgress - 進捗コールバック (current, total)
     * @returns {Promise<Object>} {fetched, failed, total}
     */
    async fetchAndSetPointsElevation(pointData, georeferencing, onProgress) {
        try {
            this.logger.info(`画像ポイントの標高取得開始: ${pointData.length}件`);

            let fetchedCount = 0;
            let failedCount = 0;
            let currentIndex = 0;
            const total = pointData.length;

            for (const point of pointData) {
                // 既に標高が設定されている場合はスキップ
                if (point.elevation !== undefined && point.elevation !== null) {
                    this.logger.info(`標高既設定をスキップ: pointId=${point.id || point.pointId}`);
                    currentIndex++;
                    if (onProgress) {
                        onProgress(currentIndex, total);
                    }
                    continue;
                }

                // 画像座標をアフィン変換でGPS座標に変換
                const transformedLatLng = georeferencing.transformImageCoordsToGps(point.x, point.y, georeferencing.currentTransformation);

                if (transformedLatLng) {
                    const lat = Array.isArray(transformedLatLng) ? transformedLatLng[0] : transformedLatLng.lat;
                    const lng = Array.isArray(transformedLatLng) ? transformedLatLng[1] : transformedLatLng.lng;

                    // 標高を取得
                    const elevation = await this.fetchElevation(lng, lat);

                    if (elevation !== null) {
                        // pointDataに標高を設定
                        point.elevation = elevation;
                        fetchedCount++;
                        this.logger.info(`標高設定成功: pointId=${point.id || point.pointId}, elevation=${elevation}m`);
                    } else {
                        failedCount++;
                        this.logger.warn(`標高取得失敗: pointId=${point.id || point.pointId}`);
                    }
                } else {
                    failedCount++;
                    this.logger.warn(`座標変換失敗: pointId=${point.id || point.pointId}`);
                }

                // 進捗コールバック呼び出し
                currentIndex++;
                if (onProgress) {
                    onProgress(currentIndex, total);
                }

                // レート制限: 0.5秒待機
                await this.delay(this.DELAY_MS);
            }

            this.logger.info(`画像ポイントの標高取得完了: 成功=${fetchedCount}, 失敗=${failedCount}, 合計=${total}`);

            return {
                fetched: fetchedCount,
                failed: failedCount,
                total: total
            };

        } catch (error) {
            this.logger.error('画像ポイントの標高取得エラー', error);
            throw error;
        }
    }
}

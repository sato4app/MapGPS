// ElevationFetcher.js
// 国土地理院APIから標高データを取得するクラス

import { Logger } from './utils.js';

export class ElevationFetcher {
    constructor(firestoreManager) {
        this.logger = new Logger('ElevationFetcher');
        this.firestoreManager = firestoreManager;
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
     * ルート中間点の標高を取得してFirebaseに更新
     * @param {string} projectId - プロジェクトID
     * @param {Function} onProgress - 進捗コールバック (current, total)
     * @returns {Promise<Object>} {fetched, failed, total}
     */
    async fetchAndUpdateRouteWaypoints(projectId, onProgress) {
        try {
            this.logger.info('ルート中間点の標高取得開始');

            // Firebaseからルートデータを取得
            const gpsRoutes = await this.firestoreManager.getGpsRoutes(projectId);

            let totalWaypoints = 0;
            let fetchedCount = 0;
            let failedCount = 0;
            let currentIndex = 0;

            // 全中間点数をカウント
            for (const route of gpsRoutes) {
                totalWaypoints += (route.waypoints || []).length;
            }

            this.logger.info(`標高未取得のルート中間点: ${totalWaypoints}件`);

            // 各ルートの中間点を処理
            for (const route of gpsRoutes) {
                const waypoints = route.waypoints || [];

                for (let i = 0; i < waypoints.length; i++) {
                    const waypoint = waypoints[i];
                    const coords = waypoint.coordinates;

                    // 標高が未設定（null）の場合のみ取得
                    if (coords && coords.length >= 2 && (coords[2] === null || coords[2] === undefined)) {
                        const [lng, lat] = coords;

                        // 標高を取得
                        const elevation = await this.fetchElevation(lng, lat);

                        if (elevation !== null) {
                            // Firebaseに更新
                            await this.firestoreManager.updateGpsRouteWaypointElevation(
                                projectId,
                                route.firestoreId,
                                i,
                                elevation
                            );
                            fetchedCount++;
                        } else {
                            failedCount++;
                        }

                        // 進捗コールバック呼び出し
                        currentIndex++;
                        if (onProgress) {
                            onProgress(currentIndex, totalWaypoints);
                        }

                        // レート制限: 0.5秒待機
                        await this.delay(this.DELAY_MS);
                    }
                }
            }

            this.logger.info(`ルート中間点の標高取得完了: 成功=${fetchedCount}, 失敗=${failedCount}, 合計=${totalWaypoints}`);

            return {
                fetched: fetchedCount,
                failed: failedCount,
                total: totalWaypoints
            };

        } catch (error) {
            this.logger.error('ルート中間点の標高取得エラー', error);
            throw error;
        }
    }

    /**
     * スポットの標高を取得してFirebaseに更新
     * @param {string} projectId - プロジェクトID
     * @param {Function} onProgress - 進捗コールバック (current, total)
     * @returns {Promise<Object>} {fetched, failed, total}
     */
    async fetchAndUpdateSpots(projectId, onProgress) {
        try {
            this.logger.info('スポットの標高取得開始');

            // Firebaseからスポットデータを取得
            const gpsSpots = await this.firestoreManager.getGpsSpots(projectId);

            let totalSpots = 0;
            let fetchedCount = 0;
            let failedCount = 0;

            // 標高未取得のスポットをカウント
            for (const spot of gpsSpots) {
                const coords = spot.coordinates;
                if (coords && coords.length >= 2 && (coords[2] === null || coords[2] === undefined)) {
                    totalSpots++;
                }
            }

            this.logger.info(`標高未取得のスポット: ${totalSpots}件`);

            let currentIndex = 0;

            // 各スポットを処理
            for (const spot of gpsSpots) {
                const coords = spot.coordinates;

                // 標高が未設定（null）の場合のみ取得
                if (coords && coords.length >= 2 && (coords[2] === null || coords[2] === undefined)) {
                    const [lng, lat] = coords;

                    // 標高を取得
                    const elevation = await this.fetchElevation(lng, lat);

                    if (elevation !== null) {
                        // Firebaseに更新
                        await this.firestoreManager.updateGpsSpotElevation(
                            projectId,
                            spot.firestoreId,
                            elevation
                        );
                        fetchedCount++;
                    } else {
                        failedCount++;
                    }

                    // 進捗コールバック呼び出し
                    currentIndex++;
                    if (onProgress) {
                        onProgress(currentIndex, totalSpots);
                    }

                    // レート制限: 0.5秒待機
                    await this.delay(this.DELAY_MS);
                }
            }

            this.logger.info(`スポットの標高取得完了: 成功=${fetchedCount}, 失敗=${failedCount}, 合計=${totalSpots}`);

            return {
                fetched: fetchedCount,
                failed: failedCount,
                total: totalSpots
            };

        } catch (error) {
            this.logger.error('スポットの標高取得エラー', error);
            throw error;
        }
    }

    /**
     * 標高カウント統計を取得
     * @param {string} projectId - プロジェクトID
     * @returns {Promise<Object>} {routes: {missing, total}, spots: {missing, total}}
     */
    async getElevationStats(projectId) {
        try {
            const stats = {
                routes: { missing: 0, total: 0 },
                spots: { missing: 0, total: 0 }
            };

            // ルート中間点の統計
            const gpsRoutes = await this.firestoreManager.getGpsRoutes(projectId);
            for (const route of gpsRoutes) {
                const waypoints = route.waypoints || [];
                for (const waypoint of waypoints) {
                    stats.routes.total++;
                    const coords = waypoint.coordinates;
                    if (coords && coords.length >= 2 && (coords[2] === null || coords[2] === undefined)) {
                        stats.routes.missing++;
                    }
                }
            }

            // スポットの統計
            const gpsSpots = await this.firestoreManager.getGpsSpots(projectId);
            for (const spot of gpsSpots) {
                stats.spots.total++;
                const coords = spot.coordinates;
                if (coords && coords.length >= 2 && (coords[2] === null || coords[2] === undefined)) {
                    stats.spots.missing++;
                }
            }

            return stats;

        } catch (error) {
            this.logger.error('標高統計取得エラー', error);
            throw error;
        }
    }
}

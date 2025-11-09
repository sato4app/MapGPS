// UIイベントハンドリング機能を管理するモジュール
import { Logger, errorHandler } from './utils.js';

export class UIHandlers {
    constructor() {
        this.logger = new Logger('UIHandlers');
    }

    updateGpsPointCount(gpsData) {
        try {
            const gpsPointCountField = document.getElementById('gpsPointCount');
            if (gpsPointCountField && gpsData) {
                const points = gpsData.getPoints();
                const count = points ? points.length : 0;
                gpsPointCountField.value = count;
            }
        } catch (error) {
            this.logger.error('GPS ポイント数更新エラー', error);
        }
    }

    updatePointCoordCount(pointJsonData) {
        try {
            const pointCountField = document.getElementById('pointCount');
            if (pointCountField && pointJsonData) {
                let count = 0;
                
                if (pointJsonData.points && Array.isArray(pointJsonData.points)) {
                    // type='waypoint'を除外してカウント（ルートの中間点を除く）
                    count = pointJsonData.points.filter(point => 
                        !point.type || point.type !== 'waypoint'
                    ).length;
                } else if (Array.isArray(pointJsonData)) {
                    // type='waypoint'を除外してカウント
                    count = pointJsonData.filter(point => 
                        !point.type || point.type !== 'waypoint'
                    ).length;
                }
                
                pointCountField.value = count;
            }
        } catch (error) {
            this.logger.error('ポイント座標数更新エラー', error);
        }
    }

    updateRouteSpotCount(routeSpotHandler) {
        try {
            const routeCountField = document.getElementById('routeCount');
            const spotCountField = document.getElementById('spotCount');
            
            if (routeCountField) {
                const routeCount = routeSpotHandler.getRouteCount();
                routeCountField.value = routeCount;
            }
            
            if (spotCountField) {
                const spotCount = routeSpotHandler.getSpotCount();
                spotCountField.value = spotCount;
            }
            
        } catch (error) {
            this.logger.error('ルート・スポット数更新エラー', error);
        }
    }

    updateMatchResults(result) {
        try {
            const matchedCountField = document.getElementById('matchedPointCountField');
            const unmatchedPointsField = document.getElementById('unmatchedPointsField');
            
            if (matchedCountField) {
                matchedCountField.value = result.matchedCount || 0;
            }
            
            if (unmatchedPointsField) {
                let displayText = '';
                if (result.unmatchedPoints && result.unmatchedPoints.length > 0) {
                    // 1行のテキストフィールドに複数ポイントを表示する場合はスペース区切りで表示
                    displayText = result.unmatchedPoints.join(' ');
                }
                unmatchedPointsField.value = displayText;
            }
            
            if (result.georeferenceCompleted) {
                this.logger.info('ジオリファレンス詳細結果', {
                    totalGpsPoints: result.totalPoints,
                    totalPointJsons: result.totalPointJsons || 0,
                    matchedPairs: result.matchedCount,
                    unmatchedPointJsonCount: result.unmatchedPoints ? result.unmatchedPoints.length : 0,
                    matchPercentage: result.totalPointJsons > 0 ? 
                        Math.round((result.matchedCount / result.totalPointJsons) * 100) : 0
                });
            }
            
        } catch (error) {
            this.logger.error('マッチング結果表示エラー', error);
        }
    }

}
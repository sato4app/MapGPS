/**
 * マップ上のオブジェクト検出を行うユーティリティクラス
 */
export class ObjectDetector {
    /**
     * 指定座標上のオブジェクト（ポイント/スポット/ルート中間点）を検出
     * @param {number} x - X座標（キャンバス座標）
     * @param {number} y - Y座標（キャンバス座標）
     * @param {Object} managers - { pointManager, spotManager, routeManager }
     * @param {string} mode - 編集モード ('point' | 'spot' | 'route')
     * @returns {{type: string, index: number, object: Object} | null} 検出されたオブジェクト情報
     */
    static findObjectAt(x, y, managers, mode = null) {
        const { pointManager, spotManager, routeManager } = managers;

        // ルート編集モード時は中間点を優先チェック
        if (mode === 'route' && routeManager) {
            const routePointInfo = routeManager.findRoutePointAt(x, y, 10);
            if (routePointInfo) {
                return {
                    type: 'routePoint',
                    index: routePointInfo.index,
                    object: routePointInfo.point
                };
            }
        }

        // スポットを次にチェック（ポイントより大きいため）
        if (spotManager) {
            const spotIndex = spotManager.findSpotAt(x, y, 10);
            if (spotIndex !== -1) {
                const spots = spotManager.getSpots();
                return {
                    type: 'spot',
                    index: spotIndex,
                    object: spots[spotIndex]
                };
            }
        }

        // ポイントをチェック
        if (pointManager) {
            const pointIndex = this.findPointAt(x, y, pointManager.getPoints(), 8);
            if (pointIndex !== -1) {
                const points = pointManager.getPoints();
                return {
                    type: 'point',
                    index: pointIndex,
                    object: points[pointIndex]
                };
            }
        }

        return null;
    }

    /**
     * 指定座標上のポイントを検索
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {Array} points - ポイント配列
     * @param {number} threshold - 検出閾値（デフォルト: 8px）
     * @returns {number} ポイントのインデックス、見つからない場合は-1
     */
    static findPointAt(x, y, points, threshold = 8) {
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const distance = this.calculateDistance(x, y, point.x, point.y);
            if (distance <= threshold) {
                return i;
            }
        }
        return -1;
    }

    /**
     * 2点間の距離を計算
     * @param {number} x1 - 点1のX座標
     * @param {number} y1 - 点1のY座標
     * @param {number} x2 - 点2のX座標
     * @param {number} y2 - 点2のY座標
     * @returns {number} 2点間の距離
     */
    static calculateDistance(x1, y1, x2, y2) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

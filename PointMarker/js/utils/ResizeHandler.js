/**
 * ウィンドウリサイズ処理を管理するクラス
 */
export class ResizeHandler {
    constructor() {
        this.resizeTimeout = null;
    }

    /**
     * ウィンドウリサイズ処理
     * @param {HTMLImageElement} currentImage - 現在の画像
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     * @param {Object} canvasRenderer - CanvasRendererインスタンス
     * @param {Object} layoutManager - LayoutManagerインスタンス
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {Object} routeManager - RouteManagerインスタンス
     * @param {Object} spotManager - SpotManagerインスタンス
     * @param {Object} viewportManager - ViewportManagerインスタンス（オプション）
     * @param {Function} redrawCallback - 再描画コールバック
     */
    handleResize(currentImage, canvas, canvasRenderer, layoutManager,
                 pointManager, routeManager, spotManager, viewportManager, redrawCallback, areaManager = null) {
        if (!currentImage) return;

        // ベースサイズ（ズーム前のサイズ）を旧サイズとして記録する。
        // canvas.width/height はズーム中は scale 倍になっているため使用しない。
        const oldWidth = canvasRenderer.baseWidth;
        const oldHeight = canvasRenderer.baseHeight;

        canvasRenderer.setupCanvas(layoutManager.getCurrentLayout());

        const newWidth = canvasRenderer.baseWidth;
        const newHeight = canvasRenderer.baseHeight;

        if (oldWidth > 0 && oldHeight > 0 && (oldWidth !== newWidth || oldHeight !== newHeight)) {
            this.scaleCoordinates(oldWidth, oldHeight, newWidth, newHeight,
                                pointManager, routeManager, spotManager, areaManager);
        }

        // ポップアップ位置を更新
        if (viewportManager) {
            viewportManager.updatePopupPositions();
        }

        redrawCallback();
    }

    /**
     * 座標をスケーリング
     * @param {number} oldWidth - 古い幅
     * @param {number} oldHeight - 古い高さ
     * @param {number} newWidth - 新しい幅
     * @param {number} newHeight - 新しい高さ
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {Object} routeManager - RouteManagerインスタンス
     * @param {Object} spotManager - SpotManagerインスタンス
     */
    scaleCoordinates(oldWidth, oldHeight, newWidth, newHeight,
                    pointManager, routeManager, spotManager, areaManager = null) {
        const scaleX = newWidth / oldWidth;
        const scaleY = newHeight / oldHeight;

        // ポイント座標のスケーリング
        pointManager.getPoints().forEach(point => {
            point.x = Math.round(point.x * scaleX);
            point.y = Math.round(point.y * scaleY);
        });

        // 全ルートの中間点座標をスケーリング
        const allRoutes = routeManager.getAllRoutes();
        allRoutes.forEach(route => {
            if (route.routePoints) {
                route.routePoints.forEach(point => {
                    point.x = Math.round(point.x * scaleX);
                    point.y = Math.round(point.y * scaleY);
                });
            }
        });

        // スポット座標のスケーリング
        spotManager.getSpots().forEach(spot => {
            spot.x = Math.round(spot.x * scaleX);
            spot.y = Math.round(spot.y * scaleY);
        });

        // エリア頂点座標のスケーリング
        if (areaManager) {
            areaManager.getAllAreas().forEach(area => {
                if (area.vertices) {
                    area.vertices.forEach(vertex => {
                        vertex.x = Math.round(vertex.x * scaleX);
                        vertex.y = Math.round(vertex.y * scaleY);
                    });
                }
            });
        }
    }

    /**
     * 遅延付きリサイズ処理
     * @param {Function} resizeFunction - リサイズ処理関数
     * @param {number} delay - 遅延時間（ミリ秒）
     */
    debounceResize(resizeFunction, delay = 100) {
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
        this.resizeTimeout = setTimeout(resizeFunction, delay);
    }
}
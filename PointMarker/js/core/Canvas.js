/**
 * キャンバス描画を管理するクラス
 */
export class CanvasRenderer {
    /**
     * コンストラクタ
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.currentImage = null;

        // devicePixelRatio による補正係数（Windowsの拡大/縮小設定に対応）
        // 100%: 1.0, 125%: 1.25, 150%: 1.5, 175%: 1.75, 200%: 2.0
        this.dpr = window.devicePixelRatio || 1.0;

        // ズーム・パン用の状態管理
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.minScale = 1.0;  // 最小倍率を1.0倍に設定
        this.maxScale = 5.0;
        this.zoomStep = 0.2;
        this.panStep = 50;  // ピクセル単位での移動量

        // マーカーサイズ設定（デフォルト値）
        this.markerSizes = {
            point: 6,
            selectedWaypoint: 6,
            unselectedWaypoint: 4,
            spot: 12
        };
    }

    /**
     * マーカーサイズを設定
     * @param {Object} sizes - マーカーサイズのオブジェクト
     */
    setMarkerSizes(sizes) {
        this.markerSizes = { ...sizes };
    }

    /**
     * 現在の画像を設定
     * @param {HTMLImageElement} image - 設定する画像
     */
    setImage(image) {
        this.currentImage = image;
    }

    /**
     * devicePixelRatioとズームスケールによる補正を適用
     * @param {number} value - 補正する値
     * @param {number} canvasScale - キャンバスのスケール値
     * @returns {number} 補正後の値
     */
    applyDevicePixelRatioCorrection(value, canvasScale = 1.0) {
        return value / this.dpr / canvasScale;
    }

    /**
     * キャンバスをクリアして画像を描画
     */
    drawImage() {
        if (!this.currentImage) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 変換を適用（ズーム・パン）
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);

        // キャンバスサイズに合わせて画像を描画
        this.ctx.drawImage(this.currentImage, 0, 0, this.canvas.width, this.canvas.height);

        this.ctx.restore();
    }

    /**
     * 単一ポイントを指定色・サイズで描画
     * @param {Object} point - ポイントオブジェクト {x, y}
     * @param {string} color - 描画色 (デフォルト: '#ff0000')
     * @param {number} radius - 半径 (デフォルト: 4)
     * @param {number} strokeWidth - 線の太さ (デフォルト: 1.5)
     * @param {number} canvasScale - キャンバスのスケール値 (デフォルト: 1.0)
     */
    drawPoint(point, color = '#ff0000', radius = 6, strokeWidth = 1.5, canvasScale = 1.0) {
        // devicePixelRatio で補正（ディスプレイ設定によらず一貫したサイズ）
        // + canvasScale の逆数で補正（ズーム時もマーカーサイズ固定）
        const adjustedRadius = this.applyDevicePixelRatioCorrection(radius, canvasScale);
        const adjustedStrokeWidth = this.applyDevicePixelRatioCorrection(strokeWidth, canvasScale);

        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = adjustedStrokeWidth;

        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, adjustedRadius, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();
    }

    /**
     * 複数のポイントを一括描画
     * @param {Array} points - ポイント配列
     * @param {Object} options - 描画オプション
     * @param {number} canvasScale - キャンバスのスケール値 (デフォルト: 1.0)
     */
    drawPoints(points, options = {}, canvasScale = 1.0) {
        const {
            defaultColor = '#ff0000'
        } = options;

        points.forEach((point) => {
            let color = defaultColor;
            let radius = this.markerSizes.point;  // マーカーサイズ設定を使用
            let strokeWidth = 1.5;

            this.drawPoint(point, color, radius, strokeWidth, canvasScale);
        });
    }

    /**
     * 菱形を描画
     * @param {number} cx - 中心X座標
     * @param {number} cy - 中心Y座標
     * @param {number} radius - 半径
     * @param {string} fillColor - 塗りつぶし色
     * @param {string} strokeColor - 枠線色
     * @param {number} strokeWidth - 枠線の太さ
     * @param {number} canvasScale - キャンバスのスケール値 (デフォルト: 1.0)
     */
    drawDiamond(cx, cy, radius, fillColor = '#ff0000', strokeColor = '#ffffff', strokeWidth = 1, canvasScale = 1.0) {
        // devicePixelRatio で補正（ディスプレイ設定によらず一貫したサイズ）
        // + canvasScale の逆数で補正（ズーム時もマーカーサイズ固定）
        const adjustedRadius = this.applyDevicePixelRatioCorrection(radius, canvasScale);
        const adjustedStrokeWidth = this.applyDevicePixelRatioCorrection(strokeWidth, canvasScale);

        this.ctx.fillStyle = fillColor;
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = adjustedStrokeWidth;

        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy - adjustedRadius);  // 上
        this.ctx.lineTo(cx + adjustedRadius, cy);  // 右
        this.ctx.lineTo(cx, cy + adjustedRadius);  // 下
        this.ctx.lineTo(cx - adjustedRadius, cy);  // 左
        this.ctx.closePath();

        this.ctx.fill();
        this.ctx.stroke();
    }

    /**
     * ルートポイント（中間点）を描画
     * @param {Array} routePoints - ルートポイント配列（選択中のルート）
     * @param {number} canvasScale - キャンバスのスケール値 (デフォルト: 1.0)
     * @param {number} radius - 菱形の半径（デフォルト: 5）
     */
    drawRoutePoints(routePoints, canvasScale = 1.0, radius = 5) {
        routePoints.forEach(point => {
            this.drawDiamond(point.x, point.y, radius, '#ff9500', '#ffffff', 1, canvasScale);
        });
    }

    /**
     * 複数ルートの中間点を一括描画（未選択ルートは菱形で小さく）
     * @param {Array} allRoutes - 全ルート配列
     * @param {number} selectedRouteIndex - 選択中のルートインデックス（-1 = 未選択）
     * @param {number} canvasScale - キャンバスのスケール値 (デフォルト: 1.0)
     */
    drawAllRoutesWaypoints(allRoutes, selectedRouteIndex, canvasScale = 1.0) {
        allRoutes.forEach((route, index) => {
            const waypoints = route.routePoints || [];
            if (index === selectedRouteIndex) {
                // 選択中のルート: 菱形、通常サイズ（マーカーサイズ設定を使用）
                this.drawRoutePoints(waypoints, canvasScale, this.markerSizes.selectedWaypoint);
            } else {
                // 未選択ルート: 菱形、小さいサイズ（マーカーサイズ設定を使用）
                waypoints.forEach(point => {
                    this.drawDiamond(point.x, point.y, this.markerSizes.unselectedWaypoint, '#ff9500', '#ffffff', 1, canvasScale);
                });
            }
        });
    }


    /**
     * 正四角形を描画
     * @param {number} cx - 中心X座標
     * @param {number} cy - 中心Y座標
     * @param {number} size - 正方形のサイズ（一辺の長さ）
     * @param {string} fillColor - 塗りつぶし色
     * @param {string} strokeColor - 枠線色
     * @param {number} strokeWidth - 枠線の太さ
     * @param {number} canvasScale - キャンバスのスケール値 (デフォルト: 1.0)
     */
    drawSquare(cx, cy, size, fillColor = '#ff9500', strokeColor = '#ffffff', strokeWidth = 1, canvasScale = 1.0) {
        // devicePixelRatio で補正（ディスプレイ設定によらず一貫したサイズ）
        // + canvasScale の逆数で補正（ズーム時もマーカーサイズ固定）
        const adjustedSize = this.applyDevicePixelRatioCorrection(size, canvasScale);
        const adjustedStrokeWidth = this.applyDevicePixelRatioCorrection(strokeWidth, canvasScale);
        const halfSize = adjustedSize / 2;

        this.ctx.fillStyle = fillColor;
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = adjustedStrokeWidth;

        this.ctx.fillRect(cx - halfSize, cy - halfSize, adjustedSize, adjustedSize);
        this.ctx.strokeRect(cx - halfSize, cy - halfSize, adjustedSize, adjustedSize);
    }

    /**
     * スポット（正四角形マーカー）を描画
     * @param {Array} spots - スポット配列
     * @param {Object} options - 描画オプション
     * @param {number} canvasScale - キャンバスのスケール値 (デフォルト: 1.0)
     */
    drawSpots(spots, options = {}, canvasScale = 1.0) {
        const {
            fillColor = '#0066ff',    // 青色
            strokeColor = '#ffffff',   // 白色の枠線
            size = this.markerSizes.spot,  // マーカーサイズ設定を使用
            strokeWidth = 1
        } = options;

        spots.forEach(spot => {
            this.drawSquare(spot.x, spot.y, size, fillColor, strokeColor, strokeWidth, canvasScale);
        });
    }

    /**
     * 画像とすべてのポイントを再描画
     * @param {Array} points - 通常ポイント配列
     * @param {Array} routePoints - ルートポイント配列（選択中のルートのみ、後方互換性のため残す）
     * @param {Array} spots - スポット配列
     * @param {Object} options - 描画オプション
     *   - showRouteMode: ルート編集モードかどうか
     *   - allRoutes: 全ルート配列（複数ルート対応）
     *   - selectedRouteIndex: 選択中のルートインデックス
     */
    redraw(points = [], routePoints = [], spots = [], options = {}) {
        this.drawImage();

        // マーカー描画時にズーム・パン変換を適用
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);

        // 現在のスケール値をマーカー描画メソッドに渡す
        this.drawPoints(points, options, this.scale);

        // ルート中間点の描画（複数ルート対応）
        if (options.allRoutes && Array.isArray(options.allRoutes) && options.allRoutes.length > 0) {
            // 複数ルート対応: 選択中のルートは通常サイズ（radius=6）、未選択は小さく（radius=4）
            this.drawAllRoutesWaypoints(options.allRoutes, options.selectedRouteIndex !== undefined ? options.selectedRouteIndex : -1, this.scale);
        } else if (routePoints && routePoints.length > 0) {
            // 後方互換性: 従来の方式（選択中のルートのみ）
            this.drawRoutePoints(routePoints, this.scale);
        }

        this.drawSpots(spots, options, this.scale);

        this.ctx.restore();
    }

    /**
     * キャンバスサイズを画像に応じて設定
     * @param {string} layout - レイアウトモード ('sidebar' | 'overlay')
     */
    setupCanvas(layout = 'sidebar') {
        if (!this.currentImage) return;

        const container = this.canvas.parentElement;
        const containerRect = container.getBoundingClientRect();

        let availableWidth, availableHeight;

        if (layout === 'sidebar') {
            availableWidth = containerRect.width - 20;
            availableHeight = window.innerHeight - 100;
        } else {
            availableWidth = window.innerWidth - 20;
            availableHeight = window.innerHeight - 100;
        }

        const imageAspectRatio = this.currentImage.height / this.currentImage.width;

        let canvasWidth = availableWidth;
        let canvasHeight = canvasWidth * imageAspectRatio;

        if (canvasHeight > availableHeight) {
            canvasHeight = availableHeight;
            canvasWidth = canvasHeight / imageAspectRatio;
        }

        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        this.canvas.style.width = canvasWidth + 'px';
        this.canvas.style.height = canvasHeight + 'px';
        this.canvas.style.display = 'block';
        this.canvas.style.visibility = 'visible';

        // ズーム・パン状態をリセット
        this.resetTransform();
    }

    /**
     * ズームイン
     */
    zoomIn() {
        this.scale = Math.min(this.scale + this.zoomStep, this.maxScale);
    }

    /**
     * ズームアウト
     */
    zoomOut() {
        this.scale = Math.max(this.scale - this.zoomStep, this.minScale);
    }

    /**
     * 上に移動
     */
    panUp() {
        this.offsetY += this.panStep;
    }

    /**
     * 下に移動
     */
    panDown() {
        this.offsetY -= this.panStep;
    }

    /**
     * 左に移動
     */
    panLeft() {
        this.offsetX += this.panStep;
    }

    /**
     * 右に移動
     */
    panRight() {
        this.offsetX -= this.panStep;
    }

    /**
     * 変換をリセット
     */
    resetTransform() {
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
    }

    /**
     * 削除範囲指定用の長方形を描画（薄いピンク色）
     * @param {number} x1 - 開始点X座標
     * @param {number} y1 - 開始点Y座標
     * @param {number} x2 - 終了点X座標
     * @param {number} y2 - 終了点Y座標
     */
    drawDeletionRectangle(x1, y1, x2, y2) {
        const ctx = this.ctx;
        const canvasScale = this.scale;

        ctx.save();

        // 変換を適用
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(canvasScale, canvasScale);

        // 左上座標と幅・高さを計算
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);

        // 薄いピンク色の塗りつぶし長方形
        ctx.fillStyle = 'rgba(255, 182, 193, 0.3)'; // lightpink with 30% opacity
        ctx.fillRect(left, top, width, height);

        // ピンク色の縁
        ctx.strokeStyle = 'rgba(255, 105, 180, 0.8)'; // hotpink with 80% opacity
        ctx.lineWidth = 2 / this.dpr / canvasScale;
        ctx.strokeRect(left, top, width, height);

        ctx.restore();
    }

    /**
     * 現在のスケールを取得
     */
    getScale() {
        return this.scale;
    }

    /**
     * 現在のオフセットを取得
     */
    getOffset() {
        return { x: this.offsetX, y: this.offsetY };
    }
}
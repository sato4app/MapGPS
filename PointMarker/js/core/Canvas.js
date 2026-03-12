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
            unselectedWaypoint: 4,
            unselectedWaypoint: 4,
            spot: 12,
            areaVertex: 6
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
     * 汎用マーカー描画メソッド
     * @param {string} type - 'circle' | 'square' | 'diamond'
     * @param {number} x - 中心X座標
     * @param {number} y - 中心Y座標
     * @param {number} size - サイズ（半径または一辺の長さ）
     * @param {string} fillColor - 塗りつぶし色
     * @param {string} strokeColor - 枠線色
     * @param {number} strokeWidth - 枠線の太さ
     * @param {number} canvasScale - キャンバスのスケール値
     */
    drawMarker(type, x, y, size, fillColor, strokeColor, strokeWidth, canvasScale) {
        // devicePixelRatio で補正（ディスプレイ設定によらず一貫したサイズ）
        // + canvasScale の逆数で補正（ズーム時もマーカーサイズ固定）
        const adjustedSize = this.applyDevicePixelRatioCorrection(size, canvasScale);
        const adjustedStrokeWidth = this.applyDevicePixelRatioCorrection(strokeWidth, canvasScale);

        this.ctx.fillStyle = fillColor;
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = adjustedStrokeWidth;
        this.ctx.beginPath();

        if (type === 'circle') {
            this.ctx.arc(x, y, adjustedSize, 0, 2 * Math.PI);
        } else if (type === 'square') {
            const halfSize = adjustedSize / 2;
            this.ctx.rect(x - halfSize, y - halfSize, adjustedSize, adjustedSize);
        } else if (type === 'diamond') {
            this.ctx.moveTo(x, y - adjustedSize);  // 上
            this.ctx.lineTo(x + adjustedSize, y);  // 右
            this.ctx.lineTo(x, y + adjustedSize);  // 下
            this.ctx.lineTo(x - adjustedSize, y);  // 左
            this.ctx.closePath();
        }

        this.ctx.fill();
        this.ctx.stroke();
    }

    /**
     * 単一ポイントを指定色・サイズで描画
     */
    drawPoint(point, color = '#ff0000', radius = 6, strokeWidth = 1.5, canvasScale = 1.0) {
        this.drawMarker('circle', point.x, point.y, radius, color, '#ffffff', strokeWidth, canvasScale);
    }

    /**
     * 複数のポイントを一括描画
     */
    drawPoints(points, options = {}, canvasScale = 1.0) {
        const { defaultColor = '#ff0000' } = options;
        const radius = this.markerSizes.point;

        points.forEach((point) => {
            let fillColor = defaultColor;
            let strokeColor = '#ffffff';
            let strokeWidth = 1.5;

            // ルート編集モードで開始点・終了点の場合は白抜きにする
            if (options.showRouteMode && (point.id === options.startPointId || point.id === options.endPointId)) {
                fillColor = '#ffffff';
                strokeColor = defaultColor;
                strokeWidth = 2.0;
            }

            this.drawMarker('circle', point.x, point.y, radius, fillColor, strokeColor, strokeWidth, canvasScale);
        });
    }

    /**
     * 菱形を描画
     */
    drawDiamond(cx, cy, radius, fillColor = '#ff0000', strokeColor = '#ffffff', strokeWidth = 1, canvasScale = 1.0) {
        this.drawMarker('diamond', cx, cy, radius, fillColor, strokeColor, strokeWidth, canvasScale);
    }

    /**
     * ルートポイント（中間点）を描画
     */
    drawRoutePoints(routePoints, canvasScale = 1.0, radius = 5) {
        routePoints.forEach(point => {
            this.drawMarker('diamond', point.x, point.y, radius, '#ff9500', '#ffffff', 1, canvasScale);
        });
    }

    /**
     * 複数ルートの中間点を一括描画（未選択ルートは菱形で小さく）
     */
    drawAllRoutesWaypoints(allRoutes, selectedRouteIndex, canvasScale = 1.0) {
        allRoutes.forEach((route, index) => {
            const waypoints = route.routePoints || [];
            const size = (index === selectedRouteIndex) ? this.markerSizes.selectedWaypoint : this.markerSizes.unselectedWaypoint;

            waypoints.forEach(point => {
                this.drawMarker('diamond', point.x, point.y, size, '#ff9500', '#ffffff', 1, canvasScale);
            });
        });
    }

    /**
     * 正四角形を描画
     */
    drawSquare(cx, cy, size, fillColor = '#ff9500', strokeColor = '#ffffff', strokeWidth = 1, canvasScale = 1.0) {
        this.drawMarker('square', cx, cy, size, fillColor, strokeColor, strokeWidth, canvasScale);
    }

    /**
     * スポット（正四角形マーカー）を描画
     */
    drawSpots(spots, options = {}, canvasScale = 1.0) {
        const {
            fillColor = '#0066ff',
            strokeColor = '#ffffff',
            size = this.markerSizes.spot,
            strokeWidth = 1
        } = options;

        spots.forEach(spot => {
            let currentFillColor = fillColor;
            let currentStrokeColor = strokeColor;
            let currentStrokeWidth = strokeWidth;

            // ルート編集モードで開始点・終了点の場合は白抜きにする
            if (options.showRouteMode && (spot.name === options.startPointId || spot.name === options.endPointId)) {
                currentFillColor = '#ffffff';
                currentStrokeColor = fillColor;
                currentStrokeWidth = 2.0;
            }

            this.drawMarker('square', spot.x, spot.y, size, currentFillColor, currentStrokeColor, currentStrokeWidth, canvasScale);
        });
    }

    /**
     * 多角形エリアを描画
     */
    drawArea(vertices, fillColor = 'rgba(255, 149, 0, 0.3)', strokeColor = '#ff9500', strokeWidth = 2, canvasScale = 1.0, areaName = null, vertexSize = 4, vertexColor = null, isAreaEditMode = false) {
        if (!vertices || vertices.length < 3) return;

        const actualVertexColor = vertexColor || strokeColor;
        const adjustedStrokeWidth = this.applyDevicePixelRatioCorrection(strokeWidth, canvasScale);

        this.ctx.fillStyle = fillColor;
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = adjustedStrokeWidth;

        this.ctx.beginPath();
        this.ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // 頂点の描画（小さな菱形）
        vertices.forEach(vertex => {
            this.drawMarker('diamond', vertex.x, vertex.y, vertexSize, actualVertexColor, '#ffffff', 1, canvasScale);
        });

        if (areaName) {
            this.drawAreaLabel(vertices, areaName, canvasScale, isAreaEditMode);
        }
    }

    /**
     * エリア名を描画（重心に表示）
     * @param {Array} vertices - 頂点配列
     * @param {string} name - エリア名
     * @param {number} canvasScale - キャンバスのスケール値
     * @param {boolean} isAreaEditMode - エリア編集モードかどうか
     */
    drawAreaLabel(vertices, name, canvasScale, isAreaEditMode = false) {
        if (!vertices || vertices.length === 0 || !name) return;

        // 重心を計算
        let cx = 0, cy = 0;
        vertices.forEach(v => {
            cx += v.x;
            cy += v.y;
        });
        cx /= vertices.length;
        cy /= vertices.length;

        const fontSize = this.applyDevicePixelRatioCorrection(12, canvasScale);

        this.ctx.font = `bold ${Math.max(10, fontSize)}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // 文字の背景（読みやすくするため）
        const metrics = this.ctx.measureText(name);
        const padding = 4 / canvasScale;
        const textHeight = Math.max(10, fontSize);

        // 背景色: エリア編集モードは白、それ以外はグレー
        this.ctx.fillStyle = isAreaEditMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(224, 224, 224, 0.8)';
        this.ctx.fillRect(
            cx - metrics.width / 2 - padding,
            cy - textHeight / 2 - padding,
            metrics.width + padding * 2,
            textHeight + padding * 2
        );

        this.ctx.fillStyle = '#000000';
        this.ctx.fillText(name, cx, cy);
    }

    /**
     * すべてのエリアを描画
     * @param {Array} areas - エリア配列
     * @param {number} selectedAreaIndex - 選択中のエリアインデックス
     * @param {number} canvasScale - キャンバスのスケール値
     * @param {boolean} isAreaEditMode - エリア編集モードかどうか
     */
    drawAllAreas(areas, selectedAreaIndex, canvasScale = 1.0, isAreaEditMode = false) {
        if (!areas) return;

        areas.forEach((area, index) => {
            // エリア編集モードでない場合は、すべてのエリアを未選択として描画
            const isSelected = isAreaEditMode && (index == selectedAreaIndex);

            // 色設定
            // 選択中: ピンク (Fill: HotPink 40%, Stroke: DeepPink)
            // 未選択: 薄いピンク (Fill: Pink 20%, Stroke: DeepPink)
            const fillColor = isSelected ? 'rgba(255, 105, 180, 0.4)' : 'rgba(255, 182, 193, 0.4)'; // HotPink vs LightPink
            const strokeColor = isSelected ? '#ff1493' : '#ff69b4'; // DeepPink vs HotPink
            // 頂点の色は常にDeepPink (#ff1493)
            const vertexColor = '#ff1493';
            const strokeWidth = isSelected ? 3 : 2;

            // 頂点サイズ (選択中・未選択にかかわらず設定値を使用)
            const vertexSize = this.markerSizes.areaVertex || 6;

            if (area.vertices && area.vertices.length >= 0) {
                // 3点未満の場合の処理（頂点のみ描画）
                if (area.vertices.length < 3) {
                    area.vertices.forEach(vertex => {
                        this.drawDiamond(vertex.x, vertex.y, vertexSize, vertexColor, '#ffffff', 1, canvasScale);
                    });
                    // 線も引く（閉じてないパス）
                    if (area.vertices.length > 1) {
                        const adjustedStrokeWidth = this.applyDevicePixelRatioCorrection(strokeWidth, canvasScale);
                        this.ctx.strokeStyle = strokeColor;
                        this.ctx.lineWidth = adjustedStrokeWidth;
                        this.ctx.beginPath();
                        this.ctx.moveTo(area.vertices[0].x, area.vertices[0].y);
                        for (let i = 1; i < area.vertices.length; i++) {
                            this.ctx.lineTo(area.vertices[i].x, area.vertices[i].y);
                        }
                        this.ctx.stroke();
                    }

                } else {
                    // drawAreaメソッドに isAreaEditMode を渡す
                    this.drawArea(area.vertices, fillColor, strokeColor, strokeWidth, canvasScale, area.areaName, vertexSize, vertexColor, isAreaEditMode);
                }
            }
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
    /**
     * 画像とすべてのポイントを再描画
     * @param {Array} points - 通常ポイント配列
     * @param {Array} routePoints - ルートポイント配列（選択中のルートのみ、後方互換性のため残す）
     * @param {Array} spots - スポット配列
     * @param {Array} areas - エリア配列
     * @param {Object} options - 描画オプション
     *   - showRouteMode: ルート編集モードかどうか
     *   - allRoutes: 全ルート配列（複数ルート対応）
     *   - selectedRouteIndex: 選択中のルートインデックス
     *   - selectedAreaIndex: 選択中のエリアインデックス
     *   - showAreaEditMode: エリア編集モードかどうか
     */
    redraw(points = [], routePoints = [], spots = [], areas = [], options = {}) {
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

        // エリアの描画
        const selectedAreaIndex = options.selectedAreaIndex !== undefined ? options.selectedAreaIndex : -1;
        const isAreaEditMode = options.showAreaEditMode === true;
        this.drawAllAreas(areas, selectedAreaIndex, this.scale, isAreaEditMode);

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
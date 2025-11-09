import { CanvasRenderer } from './core/Canvas.js';
import { PointManager } from './data/PointManager.js';
import { RouteManager } from './data/RouteManager.js';
import { SpotManager } from './data/SpotManager.js';
import { FileHandler } from './data/FileHandler.js';
import { InputManager } from './ui/InputManager.js';
import { LayoutManager } from './ui/LayoutManager.js';
import { UIHelper } from './ui/UIHelper.js';
import { ValidationManager } from './ui/ValidationManager.js';
import { CoordinateUtils } from './utils/Coordinates.js';
import { Validators } from './utils/Validators.js';
import { DragDropHandler } from './utils/DragDropHandler.js';
import { ResizeHandler } from './utils/ResizeHandler.js';

/**
 * PointMarkerアプリケーションのメインクラス
 */
export class PointMarkerApp {
    constructor() {
        // DOM要素の初期化
        this.canvas = document.getElementById('mapCanvas');
        
        // コアコンポーネントの初期化
        this.canvasRenderer = new CanvasRenderer(this.canvas);
        this.pointManager = new PointManager();
        this.routeManager = new RouteManager();
        this.spotManager = new SpotManager();
        this.fileHandler = new FileHandler();
        this.inputManager = new InputManager(this.canvas);
        this.layoutManager = new LayoutManager();
        this.dragDropHandler = new DragDropHandler();
        this.resizeHandler = new ResizeHandler();

        // 現在の画像情報
        this.currentImage = null;

        // ホバー状態管理
        this.isHoveringPoint = false;

        // ルート編集用の編集前ポイントID保存
        this.previousStartPoint = '';
        this.previousEndPoint = '';

        this.initializeCallbacks();
        this.initializeEventListeners();
        this.enableBasicControls();
    }

    /**
     * コンポーネント間のコールバックを設定
     */
    initializeCallbacks() {
        // ポイント管理のコールバック
        this.pointManager.setCallback('onChange', (points, skipRedrawInput = false) => {
            this.redrawCanvas();
            if (!skipRedrawInput) {
                this.inputManager.redrawInputBoxes(points);
            }
        });
        
        this.pointManager.setCallback('onCountChange', (count) => {
            document.getElementById('pointCount').textContent = count;
        });

        // ルート管理のコールバック
        this.routeManager.setCallback('onChange', () => {
            this.redrawCanvas();
        });
        
        this.routeManager.setCallback('onCountChange', (count) => {
            document.getElementById('waypointCount').textContent = count;
        });
        
        this.routeManager.setCallback('onStartEndChange', (data) => {
            document.getElementById('startPointInput').value = data.start;
            document.getElementById('endPointInput').value = data.end;

            // InputManagerに開始・終了ポイントの強調表示を更新
            const highlightIds = [];
            const highlightSpotNames = [];
            const registeredIds = this.pointManager.getRegisteredIds();

            // 開始ポイント
            if (data.start && data.start.trim()) {
                if (registeredIds.includes(data.start)) {
                    highlightIds.push(data.start);
                } else {
                    // ポイントIDとして存在しない場合、スポット名として扱う
                    highlightSpotNames.push(data.start);
                }
            }

            // 終了ポイント
            if (data.end && data.end.trim()) {
                if (registeredIds.includes(data.end)) {
                    highlightIds.push(data.end);
                } else {
                    // ポイントIDとして存在しない場合、スポット名として扱う
                    highlightSpotNames.push(data.end);
                }
            }

            this.inputManager.setHighlightedPoints(highlightIds);
            this.inputManager.setHighlightedSpotNames(highlightSpotNames);

            this.redrawCanvas();
        });

        // スポット管理のコールバック
        this.spotManager.setCallback('onChange', (spots, skipRedrawInput = false) => {
            this.redrawCanvas();
            if (!skipRedrawInput) {
                this.inputManager.redrawSpotInputBoxes(spots || this.spotManager.getSpots());
            }
        });
        
        this.spotManager.setCallback('onCountChange', (count) => {
            document.getElementById('spotCount').textContent = count;
        });

        // キャンバスのみの再描画用コールバック（入力ボックス再生成なし）
        this.spotManager.setCallback('onCanvasRedraw', () => {
            this.redrawCanvas();
        });

        // 入力管理のコールバック
        this.inputManager.setCallback('onPointIdChange', (data) => {
            // まずフォーマット処理を実行（blur時もinput時も）
            this.pointManager.updatePointId(data.index, data.id, data.skipFormatting, true);

            // blur時のみ、フォーマット後のIDで重複チェックを実行
            if (!data.skipFormatting && data.id.trim() !== '') {
                // フォーマット後のIDを取得
                const point = this.pointManager.getPoints()[data.index];
                const formattedId = point ? point.id : data.id;

                const registeredIds = this.pointManager.getRegisteredIds();

                // 自分以外で同じIDが存在するかチェック
                const hasDuplicate = registeredIds.some((id, idx) => {
                    return id === formattedId && idx !== data.index;
                });

                if (hasDuplicate) {
                    // 重複エラーを表示
                    const inputElement = document.querySelector(`input[data-point-index="${data.index}"]`);
                    if (inputElement) {
                        inputElement.style.backgroundColor = '#ffebee'; // ピンク背景
                        inputElement.style.borderColor = '#f44336'; // 赤枠
                        inputElement.style.borderWidth = '2px';
                        inputElement.title = `ポイントID "${formattedId}" は既に使用されています`;
                    }
                    UIHelper.showError(`ポイントID "${formattedId}" は既に使用されています。別のIDを入力してください。`);
                } else {
                    // 重複がない場合はエラー表示をクリア
                    const inputElement = document.querySelector(`input[data-point-index="${data.index}"]`);
                    if (inputElement) {
                        inputElement.style.backgroundColor = '';
                        inputElement.style.borderColor = '';
                        inputElement.style.borderWidth = '';
                        inputElement.title = '';
                    }
                }
            }

            // 入力中の場合は表示更新をスキップ（入力ボックスの値はそのまま維持）
            if (!data.skipDisplay) {
                // フォーマット処理後の値を取得して表示
                const point = this.pointManager.getPoints()[data.index];
                if (point) {
                    this.inputManager.updatePointIdDisplay(data.index, point.id);
                }
            }
        });
        
        this.inputManager.setCallback('onPointRemove', (data) => {
            if (this.layoutManager.getCurrentEditingMode() === 'point') {
                this.pointManager.removePoint(data.index);
            }
        });
        
        // スポット名変更のコールバック
        this.inputManager.setCallback('onSpotNameChange', (data) => {
            // フォーマット処理を実行（blur時のみ、input時はスキップ）
            this.spotManager.updateSpotName(data.index, data.name, !!data.skipFormatting, !!data.skipDisplay);
            // 入力中の場合は表示更新をスキップ（入力ボックスの値はそのまま維持）
            if (!data.skipDisplay) {
                // フォーマット処理後の値を取得して表示
                const spot = this.spotManager.getSpots()[data.index];
                if (spot) {
                    this.inputManager.updateSpotNameDisplay(data.index, spot.name);
                }
            }
        });
        
        this.inputManager.setCallback('onSpotRemove', (data) => {
            if (this.layoutManager.getCurrentEditingMode() === 'spot') {
                this.spotManager.removeSpot(data.index);
            }
        });

        // レイアウト管理のコールバック
        this.layoutManager.setCallback('onLayoutChange', (layout) => {
            if (this.currentImage) {
                this.resizeHandler.debounceResize(() => {
                    this.handleWindowResize();
                }, 300);
            }
        });
        
        this.layoutManager.setCallback('onModeChange', (mode) => {
            this.inputManager.setEditMode(mode);
            const pointIdCheckbox = document.getElementById('showPointIdsCheckbox');
            const spotNameCheckbox = document.getElementById('showSpotNamesCheckbox');

            if (mode === 'route') {
                // ルート編集モードに切り替えた時、既存の開始・終了ポイントを強調表示
                const startEndPoints = this.routeManager.getStartEndPoints();
                const highlightIds = [];
                if (startEndPoints.start && startEndPoints.start.trim()) highlightIds.push(startEndPoints.start);
                if (startEndPoints.end && startEndPoints.end.trim()) highlightIds.push(startEndPoints.end);
                this.inputManager.setHighlightedPoints(highlightIds);

                // チェックボックスをオンにしてポイントIDを表示
                if (pointIdCheckbox) {
                    pointIdCheckbox.checked = true;
                    this.handlePointIdVisibilityChange(true);
                }

                // スポット名表示チェックボックスをOFFにする
                if (spotNameCheckbox && spotNameCheckbox.checked) {
                    spotNameCheckbox.checked = false;
                    this.handleSpotNameVisibilityChange(false);
                }
            } else if (mode === 'spot') {
                // スポット編集モードに切り替えた時、スポット入力ボックスを表示
                this.inputManager.redrawSpotInputBoxes(this.spotManager.getSpots());

                // ポイントIDポップアップを非表示
                this.handlePointIdVisibilityChange(false);
            } else if (mode === 'point') {
                // ポイント編集モードに切り替えた時、チェックボックスをオンにする
                if (pointIdCheckbox && !pointIdCheckbox.checked) {
                    pointIdCheckbox.checked = true;
                    this.handlePointIdVisibilityChange(true);
                }

                // スポット名表示チェックボックスをOFFにする
                if (spotNameCheckbox && spotNameCheckbox.checked) {
                    spotNameCheckbox.checked = false;
                    this.handleSpotNameVisibilityChange(false);
                }
            }

            this.redrawCanvas();
        });
    }

    /**
     * イベントリスナーを設定
     */
    initializeEventListeners() {
        // 画像選択
        const imageInputLabel = document.querySelector('label[for="imageInput"]');
        imageInputLabel.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleImageSelection();
        });

        // キャンバスクリック
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        // マウス移動（ホバー検出・ドラッグ処理）
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
        

        // ポイント編集コントロール
        document.getElementById('clearBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.clearPoints();
        });

        document.getElementById('exportBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.exportPoints();
        });
        
        document.getElementById('jsonInput').addEventListener('change', (e) => this.handlePointJSONLoad(e));

        // ルート編集コントロール
        document.getElementById('clearRouteBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.clearRoute();
        });
        
        document.getElementById('exportRouteBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.exportRoute();
        });
        
        document.getElementById('routeJsonInput').addEventListener('change', (e) => this.handleRouteJSONLoad(e));

        // スポット編集コントロール
        document.getElementById('clearSpotBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.clearSpots();
        });
        
        document.getElementById('exportSpotBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.exportSpots();
        });
        
        document.getElementById('spotJsonInput').addEventListener('change', (e) => this.handleSpotJSONLoad(e));

        // ズーム・パンコントロール
        document.getElementById('zoomInBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleZoomIn();
        });

        document.getElementById('zoomOutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleZoomOut();
        });

        document.getElementById('panUpBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handlePanUp();
        });

        document.getElementById('panDownBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handlePanDown();
        });

        document.getElementById('panLeftBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handlePanLeft();
        });

        document.getElementById('panRightBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handlePanRight();
        });

        document.getElementById('resetViewBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleResetView();
        });

        // 開始・終了ポイント入力
        const startPointInput = document.getElementById('startPointInput');
        const endPointInput = document.getElementById('endPointInput');

        // focus時に編集前の値を保存
        startPointInput.addEventListener('focus', (e) => {
            this.previousStartPoint = e.target.value.trim();
        });

        endPointInput.addEventListener('focus', (e) => {
            this.previousEndPoint = e.target.value.trim();
        });

        // blur時に半角・大文字変換とX-nn形式のフォーマット処理を実行
        startPointInput.addEventListener('blur', (e) => {
            const inputValue = e.target.value.trim();
            const newValue = this.handleRoutePointBlur(inputValue, 'start', this.previousStartPoint);
            e.target.value = newValue;
        });

        endPointInput.addEventListener('blur', (e) => {
            const inputValue = e.target.value.trim();
            const newValue = this.handleRoutePointBlur(inputValue, 'end', this.previousEndPoint);
            e.target.value = newValue;
        });

        // ポイントID表示切り替えチェックボックス
        document.getElementById('showPointIdsCheckbox').addEventListener('change', (e) => {
            this.handlePointIdVisibilityChange(e.target.checked);
        });

        // スポット名表示切り替えチェックボックス
        document.getElementById('showSpotNamesCheckbox').addEventListener('change', (e) => {
            this.handleSpotNameVisibilityChange(e.target.checked);
        });

        // ウィンドウリサイズ
        window.addEventListener('resize', () => {
            if (this.currentImage) {
                this.resizeHandler.debounceResize(() => {
                    this.handleWindowResize();
                }, 100);
            }
        });
    }

    /**
     * 基本コントロールを有効化
     */
    enableBasicControls() {
        // 初期状態では画像読み込み前なので無効化
    }

    /**
     * 画像読み込み後のコントロールを有効化
     */
    enableImageControls() {
        document.getElementById('clearBtn').disabled = false;
        document.getElementById('exportBtn').disabled = false;

        // ズーム・パンボタンを有効化
        document.getElementById('zoomInBtn').disabled = false;
        // ズームアウトは初期状態（1.0倍）では無効
        document.getElementById('zoomOutBtn').disabled = true;
        document.getElementById('panUpBtn').disabled = false;
        document.getElementById('panDownBtn').disabled = false;
        document.getElementById('panLeftBtn').disabled = false;
        document.getElementById('panRightBtn').disabled = false;
        document.getElementById('resetViewBtn').disabled = false;
    }

    /**
     * 画像選択処理
     */
    async handleImageSelection() {
        try {
            const result = await this.fileHandler.selectImage();
            await this.processLoadedImage(result.image, result.fileName);
        } catch (error) {
            if (error.message !== 'ファイル選択がキャンセルされました') {
                console.error('画像選択エラー:', error);
                alert('画像選択中にエラーが発生しました: ' + error.message);
            }
        }
    }

    /**
     * 読み込まれた画像を処理
     * @param {HTMLImageElement} image - 読み込まれた画像
     * @param {string} fileName - ファイル名
     */
    async processLoadedImage(image, fileName) {
        this.currentImage = image;
        this.canvasRenderer.setImage(image);
        this.canvasRenderer.setupCanvas(this.layoutManager.getCurrentLayout());
        this.canvasRenderer.drawImage();
        this.enableImageControls();
        this.layoutManager.setDefaultPointMode();
        UIHelper.showMessage(`画像「${fileName}」を読み込みました`);
    }

    /**
     * 指定座標上のオブジェクト（ポイント/スポット）を検出
     * @param {number} mouseX - マウスX座標
     * @param {number} mouseY - マウスY座標
     * @returns {{type: string, index: number} | null} 検出されたオブジェクト情報
     */
    findObjectAtMouse(mouseX, mouseY) {
        // スポットを先にチェック（ポイントより大きいため）
        const spotIndex = this.spotManager.findSpotAt(mouseX, mouseY, 10);
        if (spotIndex !== -1) {
            return { type: 'spot', index: spotIndex };
        }

        // ポイントをチェック
        const points = this.pointManager.getPoints();
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const dx = mouseX - point.x;
            const dy = mouseY - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= 8) {
                return { type: 'point', index: i };
            }
        }

        return null;
    }



    /**
     * キャンバスマウス移動処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasMouseMove(event) {
        if (!this.currentImage) return;

        // ズーム・パン情報を取得
        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();

        // マウス座標をキャンバス座標に変換（ズーム・パン逆変換適用）
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);

        // ドラッグ中の処理
        if (this.dragDropHandler.updateDrag(coords.x, coords.y, this.pointManager, this.spotManager, this.routeManager)) {
            this.redrawCanvas();
            return;
        }

        // ホバー処理
        const mode = this.layoutManager.getCurrentEditingMode();
        let hasObject = this.findObjectAtMouse(coords.x, coords.y) !== null;

        // ルート編集モード時は中間点もホバー対象
        if (mode === 'route' && !hasObject) {
            hasObject = this.routeManager.findRoutePointAt(coords.x, coords.y) !== null;
        }

        this.updateCursor(hasObject);
    }

    /**
     * カーソル状態を更新
     * @param {boolean} hasObject - オブジェクト上にマウスがあるか
     */
    updateCursor(hasObject) {
        if (hasObject !== this.isHoveringPoint) {
            this.canvas.style.cursor = 'crosshair';
            this.isHoveringPoint = hasObject;
        }
    }

    /**
     * キャンバスマウスダウン処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasMouseDown(event) {
        if (!this.currentImage) return;

        // ズーム・パン情報を取得
        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();

        // マウス座標をキャンバス座標に変換（ズーム・パン逆変換適用）
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);
        const mode = this.layoutManager.getCurrentEditingMode();

        // ルート編集モードの場合、中間点ドラッグを優先チェック
        if (mode === 'route') {
            const routePointInfo = this.routeManager.findRoutePointAt(coords.x, coords.y);
            if (routePointInfo) {
                this.dragDropHandler.startDrag(
                    'routePoint',
                    routePointInfo.index,
                    coords.x,
                    coords.y,
                    routePointInfo.point
                );
                event.preventDefault();
                return;
            }
        }

        // ポイント・スポットのドラッグ処理
        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);
        if (!objectInfo) return;

        // 適切なモードでのドラッグ開始をチェック
        const canDrag = (objectInfo.type === 'point' && mode === 'point') ||
                        (objectInfo.type === 'spot' && mode === 'spot');

        if (canDrag) {
            const object = objectInfo.type === 'point'
                ? this.pointManager.getPoints()[objectInfo.index]
                : this.spotManager.getSpots()[objectInfo.index];

            this.dragDropHandler.startDrag(
                objectInfo.type,
                objectInfo.index,
                coords.x,
                coords.y,
                object
            );

            event.preventDefault();
        }
    }

    /**
     * キャンバスマウスアップ処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasMouseUp(event) {
        this.dragDropHandler.endDrag(this.inputManager, this.pointManager);
    }

    /**
     * キャンバスクリック処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasClick(event) {
        if (!this.currentImage || this.dragDropHandler.isDraggingObject()) return;

        // ズーム・パン情報を取得
        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();

        // マウス座標をキャンバス座標に変換（ズーム・パン逆変換適用）
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);
        const mode = this.layoutManager.getCurrentEditingMode();

        // ルート編集モードの場合、中間点上のクリックは無視（ドラッグ専用）
        if (mode === 'route') {
            const routePointInfo = this.routeManager.findRoutePointAt(coords.x, coords.y);
            if (routePointInfo) {
                return;
            }
        }

        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);

        // 既存オブジェクトクリック時の処理
        if (objectInfo) {
            this.handleExistingObjectClick(objectInfo, mode);
            return;
        }

        // 新規オブジェクト作成
        this.handleNewObjectCreation(coords, mode);
    }

    /**
     * 既存オブジェクトクリック時の処理
     * @param {Object} objectInfo - オブジェクト情報
     * @param {string} mode - 編集モード
     */
    handleExistingObjectClick(objectInfo, mode) {
        if (objectInfo.type === 'point' && mode === 'point') {
            UIHelper.focusInputForPoint(objectInfo.index);
        } else if (objectInfo.type === 'spot' && mode === 'spot') {
            UIHelper.focusInputForSpot(objectInfo.index);
        }
    }

    /**
     * 新規オブジェクト作成処理
     * @param {Object} coords - 座標
     * @param {string} mode - 編集モード
     */
    handleNewObjectCreation(coords, mode) {
        switch (mode) {
            case 'route':
                this.routeManager.addRoutePoint(coords.x, coords.y);
                break;
            case 'point':
                this.createNewPoint(coords);
                break;
            case 'spot':
                this.createNewSpot(coords);
                break;
        }
    }

    /**
     * 新規ポイント作成
     * @param {Object} coords - 座標
     */
    createNewPoint(coords) {
        this.pointManager.removeTrailingEmptyUserPoints();
        this.pointManager.addPoint(coords.x, coords.y);
        const newIndex = this.pointManager.getPoints().length - 1;
        setTimeout(() => UIHelper.focusInputForPoint(newIndex), 30);
    }

    /**
     * 新規スポット作成
     * @param {Object} coords - 座標
     */
    createNewSpot(coords) {
        this.spotManager.removeTrailingEmptySpots();
        this.spotManager.addSpot(coords.x, coords.y);
        const newIndex = this.spotManager.getSpots().length - 1;
        setTimeout(() => UIHelper.focusInputForSpot(newIndex), 30);
    }

    /**
     * キャンバスを再描画
     */
    redrawCanvas() {
        const mode = this.layoutManager.getCurrentEditingMode();
        const routePoints = this.routeManager.getStartEndPoints();
        
        this.canvasRenderer.redraw(
            this.pointManager.getPoints(),
            this.routeManager.getRoutePoints(),
            this.spotManager.getSpots(),
            {
                showRouteMode: mode === 'route',
                startPointId: routePoints.start,
                endPointId: routePoints.end
            }
        );
    }

    /**
     * ルートポイント（開始・終了）のblur処理を統合処理
     * @param {string} inputValue - 入力値
     * @param {string} pointType - ポイントタイプ ('start' or 'end')
     * @param {string} previousValue - 前回の値
     * @returns {string} 設定された値
     */
    handleRoutePointBlur(inputValue, pointType, previousValue) {
        const isStartPoint = pointType === 'start';
        const setPointMethod = isStartPoint ? 'setStartPoint' : 'setEndPoint';
        const pointLabel = isStartPoint ? '開始ポイント' : '終了ポイント';

        // 入力値が空でない場合のみ処理
        if (inputValue !== '') {
            // まず元の入力値でスポット名の部分一致検索
            const matchingSpots = this.spotManager.findSpotsByPartialName(inputValue);

            if (matchingSpots.length === 1) {
                // 1件のみ該当する場合、そのスポット名を設定（フォーマット処理も適用）
                const formattedSpotName = Validators.formatPointId(matchingSpots[0].name);
                this.routeManager[setPointMethod](formattedSpotName);
            } else if (matchingSpots.length > 1) {
                // 複数件該当する場合、ポイントIDとしてフォーマット処理を試みる
                // （警告は表示せず、バリデーション時にピンク背景で表示）
                this.routeManager[setPointMethod](inputValue);
            } else {
                // スポット名が該当しない場合、ポイントIDとしてフォーマット処理
                this.routeManager[setPointMethod](inputValue);
            }
        } else {
            // 空の場合はそのまま設定
            this.routeManager[setPointMethod](inputValue);
        }

        const newValue = isStartPoint
            ? this.routeManager.getStartEndPoints().start
            : this.routeManager.getStartEndPoints().end;

        // 開始・終了ポイント両方の検証フィードバック（複数一致したスポット名を取得）
        const matchingSpots = ValidationManager.updateBothRoutePointsValidation(this.routeManager, this.pointManager, this.spotManager);

        // 複数一致したスポット名をエラー状態として設定
        const allMatchingSpotNames = [...matchingSpots.start, ...matchingSpots.end];
        this.inputManager.setErrorSpotNames(allMatchingSpotNames);

        // 値が変更された場合の処理（ブランクも含む）
        if (previousValue !== newValue) {
            this.checkRoutePointChange(previousValue, newValue, pointLabel);
            // ポイントID表示チェックボックスをオンにする
            const checkbox = document.getElementById('showPointIdsCheckbox');
            if (!checkbox.checked) {
                checkbox.checked = true;
                this.handlePointIdVisibilityChange(true);
            }
        }

        return newValue;
    }

    /**
     * ポイントをクリア
     */
    clearPoints() {
        const pointCount = this.pointManager.getPoints().length;
        this.pointManager.clearPoints();
        this.inputManager.clearInputBoxes();
        UIHelper.showMessage(`${pointCount}個のポイントをクリアしました`);
    }

    /**
     * ルートをクリア
     */
    clearRoute() {
        const waypointCount = this.routeManager.getRoutePoints().length;
        this.routeManager.clearRoute();
        UIHelper.showMessage(`${waypointCount}個の中間点をクリアしました`);
    }

    /**
     * ルートポイント変更チェック
     * @param {string} previousValue - 編集前の値
     * @param {string} newValue - 編集後の値
     * @param {string} pointType - ポイントタイプ（'開始ポイント' or '終了ポイント'）
     */
    checkRoutePointChange(previousValue, newValue, pointType) {
        // 値が変更され、かつ中間点が存在する場合
        if (previousValue !== newValue && this.routeManager.getRoutePoints().length > 0) {
            const waypointCount = this.routeManager.getRoutePoints().length;
            const message = `${pointType}が変更されました（${previousValue || '(空)'} → ${newValue || '(空)'}）。\n\n` +
                `ルート上の中間点（${waypointCount}個）をクリアしますか？`;

            if (confirm(message)) {
                this.routeManager.clearRoutePoints();
                UIHelper.showMessage(`${waypointCount}個の中間点をクリアしました`);
            }
        }
    }

    /**
     * スポットをクリア
     */
    clearSpots() {
        const spotCount = this.spotManager.getSpots().length;
        this.spotManager.clearSpots();
        this.inputManager.clearSpotInputBoxes();
        UIHelper.showMessage(`${spotCount}個のスポットをクリアしました`);
    }

    /**
     * ポイントID表示/非表示切り替え処理
     * @param {boolean} visible - 表示するかどうか
     */
    handlePointIdVisibilityChange(visible) {
        this.inputManager.setPointIdVisibility(visible);
    }

    /**
     * スポット名表示/非表示切り替え処理
     * @param {boolean} visible - 表示するかどうか
     */
    handleSpotNameVisibilityChange(visible) {
        // スポットデータを取得して渡す
        const spots = this.spotManager.getSpots();
        this.inputManager.setSpotNameVisibility(visible, spots);
    }


    /**
     * ポイントをJSON出力
     */
    async exportPoints() {
        const points = this.pointManager.getPoints();
        if (points.length === 0) {
            alert('ポイントが選択されていません');
            return;
        }

        // ポイントID名の重複チェック
        const duplicateCheck = ValidationManager.checkDuplicatePointIds(points);
        if (!duplicateCheck.isValid) {
            alert(duplicateCheck.message);
            return;
        }

        try {
            const filename = `${this.fileHandler.getCurrentImageFileName()}_points.json`;
            await this.fileHandler.exportPointData(
                this.pointManager,
                this.fileHandler.getCurrentImageFileName() + '.png',
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height,
                filename
            );
            UIHelper.showMessage(`ポイントデータを「${filename}」に出力しました`);
        } catch (error) {
            console.error('エクスポートエラー:', error);
            UIHelper.showError('エクスポート中にエラーが発生しました');
        }
    }

    /**
     * ルートをJSON出力
     */
    async exportRoute() {
        const routePoints = this.routeManager.getRoutePoints();
        if (routePoints.length === 0) {
            alert('ルート中間点が設定されていません');
            return;
        }

        const validation = this.routeManager.validateStartEndPoints(
            this.pointManager.getRegisteredIds(),
            this.spotManager
        );
        
        if (!validation.isValid) {
            alert(validation.message);
            return;
        }

        try {
            const filename = this.routeManager.generateRouteFilename(
                this.fileHandler.getCurrentImageFileName()
            );

            const saved = await this.fileHandler.exportRouteData(
                this.routeManager,
                this.fileHandler.getCurrentImageFileName() + '.png',
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height,
                filename
            );
            if (saved) {
                UIHelper.showMessage(`ルートデータを「${filename}」に出力しました`);
            }
        } catch (error) {
            console.error('エクスポートエラー:', error);
            UIHelper.showError('エクスポート中にエラーが発生しました');
        }
    }

    /**
     * ポイントJSONファイル読み込み処理
     * @param {Event} event - ファイル選択イベント
     */
    async handlePointJSONLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!this.currentImage) {
            alert('先に画像を読み込んでください');
            return;
        }

        try {
            await this.fileHandler.importPointData(
                this.pointManager,
                file,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );
            const pointCount = this.pointManager.getPoints().length;
            UIHelper.showMessage(`ポイントJSONファイルを読み込みました（${pointCount}個のポイント）`);
        } catch (error) {
            console.error('JSON読み込みエラー:', error);
            UIHelper.showError('JSON読み込み中にエラーが発生しました: ' + error.message);
        } finally {
            event.target.value = '';
        }
    }

    /**
     * ルートJSONファイル読み込み処理
     * @param {Event} event - ファイル選択イベント
     */
    async handleRouteJSONLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!this.currentImage) {
            alert('先に画像を読み込んでください');
            return;
        }

        try {
            await this.fileHandler.importRouteData(
                this.routeManager,
                file,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );
            const waypointCount = this.routeManager.getRoutePoints().length;
            UIHelper.showMessage(`ルートJSONファイルを読み込みました（${waypointCount}個の中間点）`);

            // ポイントID表示チェックボックスをオンにする
            const checkbox = document.getElementById('showPointIdsCheckbox');
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                this.handlePointIdVisibilityChange(true);
            }
        } catch (error) {
            console.error('ルートJSON読み込みエラー:', error);
            UIHelper.showError('ルートJSON読み込み中にエラーが発生しました: ' + error.message);
        } finally {
            event.target.value = '';
        }
    }





    /**
     * スポットをJSON出力
     */
    async exportSpots() {
        const spots = this.spotManager.getSpots();
        if (spots.length === 0) {
            alert('スポットが選択されていません');
            return;
        }

        try {
            const filename = this.spotManager.generateSpotFilename(
                this.fileHandler.getCurrentImageFileName()
            );

            await this.fileHandler.exportSpotData(
                this.spotManager,
                this.fileHandler.getCurrentImageFileName() + '.png',
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height,
                filename
            );
            UIHelper.showMessage(`スポットデータを「${filename}」に出力しました`);
        } catch (error) {
            console.error('スポットエクスポートエラー:', error);
            UIHelper.showError('スポットエクスポート中にエラーが発生しました');
        }
    }

    /**
     * スポットJSONファイル読み込み処理
     * @param {Event} event - ファイル選択イベント
     */
    async handleSpotJSONLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!this.currentImage) {
            alert('先に画像を読み込んでください');
            return;
        }

        try {
            await this.fileHandler.importSpotData(
                this.spotManager,
                file,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );
            const spotCount = this.spotManager.getSpots().length;
            UIHelper.showMessage(`スポットJSONファイルを読み込みました（${spotCount}個のスポット）`);
        } catch (error) {
            console.error('スポットJSON読み込みエラー:', error);
            UIHelper.showError('スポットJSON読み込み中にエラーが発生しました: ' + error.message);
        } finally {
            event.target.value = '';
        }
    }

    /**
     * ウィンドウリサイズ処理
     */
    handleWindowResize() {
        this.resizeHandler.handleResize(
            this.currentImage,
            this.canvas,
            this.canvasRenderer,
            this.layoutManager,
            this.pointManager,
            this.routeManager,
            this.spotManager,
            () => this.redrawCanvas()
        );
    }

    /**
     * ズーム処理（汎用）
     * @param {string} direction - 方向 ('in' or 'out')
     */
    handleZoom(direction) {
        if (direction === 'in') {
            this.canvasRenderer.zoomIn();
        } else if (direction === 'out') {
            this.canvasRenderer.zoomOut();
        }
        this.updateZoomButtonStates();
        this.updatePopupPositions();
        this.redrawCanvas();
    }

    /**
     * ズームイン処理
     */
    handleZoomIn() {
        this.handleZoom('in');
    }

    /**
     * ズームアウト処理
     */
    handleZoomOut() {
        this.handleZoom('out');
    }

    /**
     * ポップアップ位置を更新
     */
    updatePopupPositions() {
        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();
        const points = this.pointManager.getPoints();
        const spots = this.spotManager.getSpots();

        this.inputManager.updateTransform(scale, offset.x, offset.y, points, spots);

        // チェックボックスの状態を反映（ポイントID）
        const checkbox = document.getElementById('showPointIdsCheckbox');
        if (checkbox && !checkbox.checked) {
            this.inputManager.setPointIdVisibility(false);
        }

        // スポット名の状態を再適用（強調表示とエラー状態を復元）
        this.inputManager.updateSpotInputsState();
    }

    /**
     * ズームボタンの状態を更新
     */
    updateZoomButtonStates() {
        const scale = this.canvasRenderer.getScale();
        const minScale = this.canvasRenderer.minScale;

        // 表示倍率が1.0倍（最小値）の時、ズームアウトボタンを無効化
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        if (scale <= minScale) {
            zoomOutBtn.disabled = true;
        } else {
            zoomOutBtn.disabled = false;
        }
    }

    /**
     * パン処理（汎用）
     * @param {string} direction - 方向 ('up', 'down', 'left', 'right')
     */
    handlePan(direction) {
        const panMethods = {
            'up': () => this.canvasRenderer.panUp(),
            'down': () => this.canvasRenderer.panDown(),
            'left': () => this.canvasRenderer.panLeft(),
            'right': () => this.canvasRenderer.panRight()
        };

        if (panMethods[direction]) {
            panMethods[direction]();
            this.updatePopupPositions();
            this.redrawCanvas();
        }
    }

    // 後方互換性のための個別メソッド
    handlePanUp() { this.handlePan('up'); }
    handlePanDown() { this.handlePan('down'); }
    handlePanLeft() { this.handlePan('left'); }
    handlePanRight() { this.handlePan('right'); }

    /**
     * 表示リセット処理
     */
    handleResetView() {
        this.canvasRenderer.resetTransform();
        this.updateZoomButtonStates();
        this.updatePopupPositions();
        this.redrawCanvas();
    }

}

// DOM読み込み完了後にアプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    new PointMarkerApp();
});
import { CanvasRenderer } from './core/Canvas.js';
import { PointManager } from './data/PointManager.js';
import { RouteManager } from './data/RouteManager.js';
import { SpotManager } from './data/SpotManager.js';
import { FileHandler } from './data/FileHandler.js';
import { InputManager } from './ui/InputManager.js';
import { LayoutManager } from './ui/LayoutManager.js';
import { UIHelper } from './ui/UIHelper.js';
import { ValidationManager } from './ui/ValidationManager.js';
import { ViewportManager } from './ui/ViewportManager.js';
import { MarkerSettingsManager } from './ui/MarkerSettingsManager.js';
import { CoordinateUtils } from './utils/Coordinates.js';
import { Validators } from './utils/Validators.js';
import { ObjectDetector } from './utils/ObjectDetector.js';
import { DragDropHandler } from './utils/DragDropHandler.js';
import { ResizeHandler } from './utils/ResizeHandler.js';
import { FirebaseSyncManager } from './firebase/FirebaseSyncManager.js';

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
        this.validationManager = new ValidationManager();
        this.dragDropHandler = new DragDropHandler();
        this.resizeHandler = new ResizeHandler();
        this.markerSettingsManager = new MarkerSettingsManager();

        // ビューポート管理とFirebase同期の初期化
        this.viewportManager = new ViewportManager(
            this.canvasRenderer,
            this.inputManager,
            this.pointManager,
            this.spotManager
        );
        this.firebaseSyncManager = new FirebaseSyncManager(
            this.pointManager,
            this.spotManager,
            this.routeManager,
            this.fileHandler
        );

        // Firebase関連（グローバルスコープから取得）
        this.firebaseClient = window.firebaseClient || null;
        this.authManager = window.authManager || null;
        this.firestoreManager = window.firestoreManager || null;

        // プロジェクトID（画像ファイル名ベース）
        this.currentProjectId = null;

        // 現在の画像情報
        this.currentImage = null;

        // ファイルピッカーのアクティブ状態管理（重複呼び出し防止）
        this.isFilePickerActive = false;

        // スポットドラッグ開始時の座標保存（Firebase更新用）
        this.spotDragStartCoords = null;

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

        // ルート一覧変更時のコールバック
        this.routeManager.setCallback('onRouteListChange', (routes) => {
            this.updateRouteDropdown(routes);
        });

        // ルート選択変更時のコールバック
        this.routeManager.setCallback('onSelectionChange', (index) => {
            // ドロップダウンの選択を更新
            const dropdown = document.getElementById('routeSelectDropdown');
            if (dropdown) {
                dropdown.value = index >= 0 ? index.toString() : '';
            }
            // 開始・終了ポイントがスポット名の場合、常に表示するように設定
            this.updateAlwaysVisibleSpotNames();
        });

        // ルート更新状態変更時のコールバック
        this.routeManager.setCallback('onModifiedStateChange', (data) => {
            this.updateRouteDropdown(this.routeManager.getAllRoutes());
        });

        // ルート未選択時のコールバック
        this.routeManager.setCallback('onNoRouteSelected', (message) => {
            UIHelper.showMessage(message);
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

        // マーカー設定のコールバック
        this.markerSettingsManager.setCallback((sizes) => {
            // Canvas Rendererにマーカーサイズを設定
            this.canvasRenderer.setMarkerSizes(sizes);
            // キャンバスを再描画
            this.redrawCanvas();
            console.log('マーカーサイズが更新されました:', sizes);
        });

        // 初期設定を読み込み
        const initialSizes = this.markerSettingsManager.getSizes();
        this.canvasRenderer.setMarkerSizes(initialSizes);

        // 入力管理のコールバック
        this.inputManager.setCallback('onPointIdChange', (data) => {
            // blur時にIDが空白の場合はポイントを削除
            if (!data.skipFormatting && data.id.trim() === '') {
                // Firebaseからも削除するため、削除前に座標を取得
                const points = this.pointManager.getPoints();
                if (data.index >= 0 && data.index < points.length) {
                    const point = points[data.index];
                    // Firebase削除処理（非同期だが待たない）
                    this.firebaseSyncManager.deletePointFromFirebase(point.x, point.y);
                }
                // 画面から削除
                this.pointManager.removePoint(data.index);
                return;
            }

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

                    // 【リアルタイムFirebase更新】blur時、重複がなく、空白でない場合にFirebase更新
                    this.firebaseSyncManager.updatePointToFirebase(data.index);
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
            // blur時にスポット名が空白の場合はスポットを削除
            if (!data.skipFormatting && data.name.trim() === '') {
                // Firebaseからも削除するため、削除前に座標を取得
                const spots = this.spotManager.getSpots();
                if (data.index >= 0 && data.index < spots.length) {
                    const spot = spots[data.index];
                    // Firebase削除処理（非同期だが待たない）
                    this.firebaseSyncManager.deleteSpotFromFirebase(spot.x, spot.y);
                }
                // 画面から削除
                this.spotManager.removeSpot(data.index);
                return;
            }

            // フォーマット処理を実行（blur時のみ、input時はスキップ）
            this.spotManager.updateSpotName(data.index, data.name, !!data.skipFormatting, !!data.skipDisplay);

            // blur時のみ、フォーマット後のスポット名でFirebase更新
            if (!data.skipFormatting && data.name.trim() !== '') {
                // 【リアルタイムFirebase更新】スポット名変更完了時にFirebase更新
                this.firebaseSyncManager.updateSpotToFirebase(data.index);
            }

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
                // Firebaseからも削除するため、削除前に座標を取得
                const spots = this.spotManager.getSpots();
                if (data.index >= 0 && data.index < spots.length) {
                    const spot = spots[data.index];
                    // Firebase削除処理（非同期だが待たない）
                    this.firebaseSyncManager.deleteSpotFromFirebase(spot.x, spot.y);
                }
                // 画面から削除
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
                const highlightSpotNames = [];

                if (startEndPoints.start && startEndPoints.start.trim()) {
                    highlightIds.push(startEndPoints.start);
                    // 開始ポイントがスポット名かチェック
                    const spot = this.spotManager.findSpotByName(startEndPoints.start);
                    if (spot) {
                        highlightSpotNames.push(startEndPoints.start);
                    }
                }

                if (startEndPoints.end && startEndPoints.end.trim()) {
                    highlightIds.push(startEndPoints.end);
                    // 終了ポイントがスポット名かチェック
                    const spot = this.spotManager.findSpotByName(startEndPoints.end);
                    if (spot) {
                        highlightSpotNames.push(startEndPoints.end);
                    }
                }

                this.inputManager.setHighlightedPoints(highlightIds);
                this.inputManager.setHighlightedSpotNames(highlightSpotNames);

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

                // 開始・終了ポイントがスポット名の場合、常に表示するように設定
                this.updateAlwaysVisibleSpotNames();
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
        const imageInputBtn = document.getElementById('imageInputBtn');
        imageInputBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleImageSelection();
        });

        // キャンバスクリック
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        // マウス移動（ホバー検出・ドラッグ処理）
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
        


        // ズーム・パンコントロール
        document.getElementById('zoomInBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handleZoom('in', () => {
                this.viewportManager.updateZoomButtonStates();
                this.redrawCanvas();
            });
        });

        document.getElementById('zoomOutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handleZoom('out', () => {
                this.viewportManager.updateZoomButtonStates();
                this.redrawCanvas();
            });
        });

        document.getElementById('panUpBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handlePan('up', () => this.redrawCanvas());
        });

        document.getElementById('panDownBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handlePan('down', () => this.redrawCanvas());
        });

        document.getElementById('panLeftBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handlePan('left', () => this.redrawCanvas());
        });

        document.getElementById('panRightBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handlePan('right', () => this.redrawCanvas());
        });

        document.getElementById('resetViewBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.viewportManager.handleResetView(() => {
                this.viewportManager.updateZoomButtonStates();
                this.redrawCanvas();
            });
        });

        // 設定ボタン
        document.getElementById('settingsBtn').addEventListener('click', (e) => {
            e.preventDefault();
            console.log('設定ボタンがクリックされました');
            console.log('markerSettingsManager:', this.markerSettingsManager);
            this.markerSettingsManager.openDialog();
        });

        // 開始・終了ポイント入力
        const startPointInput = document.getElementById('startPointInput');
        const endPointInput = document.getElementById('endPointInput');

        // readonly状態の入力フィールドクリック時に変更確認
        startPointInput.addEventListener('click', (e) => {
            if (e.target.hasAttribute('readonly')) {
                const confirmed = confirm('開始ポイントを変更しますか？\n変更すると中間点がクリアされます。');
                if (confirmed) {
                    this.handleRoutePointEditRequest('start');
                }
            }
        });

        endPointInput.addEventListener('click', (e) => {
            if (e.target.hasAttribute('readonly')) {
                const confirmed = confirm('終了ポイントを変更しますか？\n変更すると中間点がクリアされます。');
                if (confirmed) {
                    this.handleRoutePointEditRequest('end');
                }
            }
        });

        // blur時に半角・大文字変換とX-nn形式のフォーマット処理を実行
        startPointInput.addEventListener('blur', (e) => {
            const inputValue = e.target.value.trim();
            const previousValue = this.routeManager.getStartEndPoints().start;
            const newValue = this.handleRoutePointBlur(inputValue, 'start', previousValue);
            e.target.value = newValue;
        });

        endPointInput.addEventListener('blur', (e) => {
            const inputValue = e.target.value.trim();
            const previousValue = this.routeManager.getStartEndPoints().end;
            const newValue = this.handleRoutePointBlur(inputValue, 'end', previousValue);
            e.target.value = newValue;
        });

        // ルート選択ドロップダウン
        const routeDropdown = document.getElementById('routeSelectDropdown');
        if (routeDropdown) {
            routeDropdown.addEventListener('change', (e) => {
                const selectedIndex = e.target.value === '' ? -1 : parseInt(e.target.value);
                this.routeManager.selectRoute(selectedIndex);

                // ルート選択時のメッセージ表示
                if (selectedIndex >= 0) {
                    const routes = this.routeManager.getAllRoutes();
                    const selectedRoute = routes[selectedIndex];
                    if (selectedRoute) {
                        const startPoint = selectedRoute.startPointId || '未設定';
                        const endPoint = selectedRoute.endPointId || '未設定';
                        const waypointCount = (selectedRoute.routePoints || []).length;
                        UIHelper.showMessage(
                            `ルート ${selectedIndex + 1} を選択: ${startPoint} → ${endPoint} (中間点: ${waypointCount}個)`,
                            'info'
                        );
                    }
                } else {
                    UIHelper.showMessage('ルート選択を解除しました', 'info');
                }
            });
        }

        // ルート操作ボタン
        document.getElementById('addRouteBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleAddRoute();
        });

        document.getElementById('deleteRouteBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleDeleteRoute();
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
        // 既にファイルピッカーが開いている場合は何もしない
        if (this.isFilePickerActive) {
            return;
        }

        try {
            this.isFilePickerActive = true;
            const result = await this.fileHandler.selectImage();
            await this.processLoadedImage(result.image, result.fileName);
        } catch (error) {
            if (error.message !== 'ファイル選択がキャンセルされました') {
                alert('画像選択中にエラーが発生しました: ' + error.message);
            }
        } finally {
            this.isFilePickerActive = false;
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

        // FirebaseSyncManagerに画像とキャンバスを設定
        this.firebaseSyncManager.setImageAndCanvas(image, this.canvas);

        // Firebaseから自動的にデータを読み込み
        await this.firebaseSyncManager.loadFromFirebase((loadedPoints, loadedRoutes, loadedSpots) => {
            // UIを更新
            this.inputManager.redrawInputBoxes(this.pointManager.getPoints());
            this.inputManager.redrawSpotInputBoxes(this.spotManager.getSpots());
            this.viewportManager.updatePopupPositions();
            this.redrawCanvas();

            // ポイント数・スポット数を更新
            document.getElementById('pointCount').textContent = loadedPoints;
            document.getElementById('spotCount').textContent = loadedSpots;

            // 中間点数は選択されたルートのものを表示（初期状態は0）
            document.getElementById('waypointCount').textContent = 0;
        });
    }

    /**
     * 指定座標上のオブジェクト（ポイント/スポット）を検出
     * @param {number} mouseX - マウスX座標
     * @param {number} mouseY - マウスY座標
     * @returns {{type: string, index: number} | null} 検出されたオブジェクト情報
     */
    findObjectAtMouse(mouseX, mouseY) {
        const managers = {
            pointManager: this.pointManager,
            spotManager: this.spotManager,
            routeManager: null // ルート中間点は別途チェック
        };
        const result = ObjectDetector.findObjectAt(mouseX, mouseY, managers);
        return result ? { type: result.type, index: result.index } : null;
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
        // カーソルは常にcrosshairで固定
        this.canvas.style.cursor = 'crosshair';
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
                const selectedRoute = this.routeManager.getSelectedRoute();
                // ルートが選択されていない場合
                if (!selectedRoute) {
                    UIHelper.showWarning('ルートが選択されていません。ルートを選択または追加してください');
                    event.preventDefault();
                    return;
                }
                // 開始・終了ポイントが設定済みの場合のみドラッグ可能
                if (selectedRoute.startPointId && selectedRoute.endPointId) {
                    this.dragDropHandler.startDrag(
                        'routePoint',
                        routePointInfo.index,
                        coords.x,
                        coords.y,
                        routePointInfo.point
                    );
                    event.preventDefault();
                } else {
                    UIHelper.showWarning('開始ポイントと終了ポイントを先に選択してください');
                    event.preventDefault();
                }
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

            // スポットドラッグ開始時に元の座標を保存（Firebase更新用）
            if (objectInfo.type === 'spot') {
                this.spotDragStartCoords = {
                    x: object.x,
                    y: object.y
                };
            }

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
        // ポイントドラッグ終了時のコールバック
        const onPointDragEnd = (pointIndex) => {
            // 【リアルタイムFirebase更新】ポイント移動完了時にFirebase更新
            this.firebaseSyncManager.updatePointToFirebase(pointIndex);
        };

        // スポットドラッグ終了時のコールバック
        const onSpotDragEnd = async (spotIndex) => {
            // 【リアルタイムFirebase更新】スポット移動完了時にFirebase更新
            // 移動前の座標のデータを削除してから、新しい座標で追加
            if (this.spotDragStartCoords) {
                const spots = this.spotManager.getSpots();
                if (spotIndex >= 0 && spotIndex < spots.length) {
                    const currentSpot = spots[spotIndex];
                    // 座標が変わった場合のみ、古いデータを削除
                    if (this.spotDragStartCoords.x !== currentSpot.x ||
                        this.spotDragStartCoords.y !== currentSpot.y) {
                        await this.firebaseSyncManager.deleteSpotFromFirebase(this.spotDragStartCoords.x, this.spotDragStartCoords.y);
                    }
                }
                this.spotDragStartCoords = null; // リセット
            }
            // 新しい座標で更新/追加
            await this.firebaseSyncManager.updateSpotToFirebase(spotIndex);
        };

        // ルート中間点ドラッグ終了時のコールバック
        const onRoutePointDragEnd = async (routePointIndex) => {
            // 中間点移動後、自動保存
            await this.handleSaveRoute();
        };

        this.dragDropHandler.endDrag(this.inputManager, this.pointManager, onPointDragEnd, onSpotDragEnd, onRoutePointDragEnd);
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

        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);

        // ルート編集モードの場合の処理
        if (mode === 'route') {
            // ポイントまたはスポットをクリックした場合
            if (objectInfo && (objectInfo.type === 'point' || objectInfo.type === 'spot')) {
                this.handleRoutePointSelection(objectInfo);
                return;
            }
            // 開始・終了ポイントが設定済みの場合のみ中間点を追加
            const selectedRoute = this.routeManager.getSelectedRoute();
            // ルートが選択されていない場合
            if (!selectedRoute) {
                UIHelper.showWarning('ルートが選択されていません。ルートを選択または追加してください');
                return;
            }
            if (selectedRoute.startPointId && selectedRoute.endPointId) {
                this.handleNewObjectCreation(coords, mode);
            } else {
                UIHelper.showWarning('開始ポイントと終了ポイントを先に選択してください');
            }
            return;
        }

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
     * ルート編集モードでポイント/スポット選択時の処理
     * @param {Object} objectInfo - オブジェクト情報
     */
    handleRoutePointSelection(objectInfo) {
        const selectedRoute = this.routeManager.getSelectedRoute();
        if (!selectedRoute) {
            UIHelper.showWarning('先にルートを選択または追加してください');
            return;
        }

        let selectedName = '';

        // ポイントIDまたはスポット名を取得
        if (objectInfo.type === 'point') {
            const points = this.pointManager.getPoints();
            const point = points[objectInfo.index];
            selectedName = point.id || '';
            if (!selectedName) {
                UIHelper.showWarning('このポイントにはIDが設定されていません');
                return;
            }
        } else if (objectInfo.type === 'spot') {
            const spots = this.spotManager.getSpots();
            const spot = spots[objectInfo.index];
            selectedName = spot.name || '';
            if (!selectedName) {
                UIHelper.showWarning('このスポットには名前が設定されていません');
                return;
            }
        }

        // 開始ポイントが未設定の場合は開始ポイントに設定
        if (!selectedRoute.startPointId) {
            this.routeManager.setStartPoint(selectedName, true);
            UIHelper.showMessage(`開始ポイントを "${selectedName}" に設定しました。終了ポイントを画像上で選択してください`);
        }
        // 開始ポイントは設定済みで終了ポイントが未設定の場合は終了ポイントに設定
        else if (!selectedRoute.endPointId) {
            this.routeManager.setEndPoint(selectedName, true);
            UIHelper.showMessage(`終了ポイントを "${selectedName}" に設定しました`);
            // 両方設定完了したので入力フィールドをreadonly（変更不可）にする
            this.setRouteInputsEditable(false);
        }
        // 両方設定済みの場合は何もしない（中間点追加モード）
        else {
            // 中間点追加モードでは、ポイント/スポットクリックでは開始・終了ポイントを変更しない
            return;
        }
    }

    /**
     * 新規オブジェクト作成処理
     * @param {Object} coords - 座標
     * @param {string} mode - 編集モード
     */
    async handleNewObjectCreation(coords, mode) {
        switch (mode) {
            case 'route':
                this.routeManager.addRoutePoint(coords.x, coords.y);
                // 中間点追加後、自動保存
                await this.handleSaveRoute();
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
     * 開始・終了ポイントがスポット名の場合、常に表示するように設定
     */
    updateAlwaysVisibleSpotNames() {
        const startEndPoints = this.routeManager.getStartEndPoints();
        const alwaysVisibleSpotNames = [];

        // 開始ポイントがスポット名かチェック
        if (startEndPoints.start && startEndPoints.start.trim() !== '') {
            const spot = this.spotManager.findSpotByName(startEndPoints.start);
            if (spot) {
                alwaysVisibleSpotNames.push(startEndPoints.start);
            }
        }

        // 終了ポイントがスポット名かチェック
        if (startEndPoints.end && startEndPoints.end.trim() !== '') {
            const spot = this.spotManager.findSpotByName(startEndPoints.end);
            if (spot) {
                alwaysVisibleSpotNames.push(startEndPoints.end);
            }
        }

        // InputManagerに設定
        this.inputManager.setAlwaysVisibleSpotNames(alwaysVisibleSpotNames);
    }

    /**
     * ルート選択ドロップダウンを更新
     * @param {Array} routes - ルート配列
     */
    updateRouteDropdown(routes) {
        const dropdown = document.getElementById('routeSelectDropdown');
        if (!dropdown) return;

        // 現在の選択を保持
        const currentSelectedIndex = this.routeManager.selectedRouteIndex;

        // 既存のオプションをクリア（最初の「-- ルートを選択 --」以外）
        dropdown.innerHTML = '<option value="">-- ルートを選択 --</option>';

        // ルートを追加
        routes.forEach((route, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            const routeName = route.routeName || `${route.startPointId} ～ ${route.endPointId}`;
            option.textContent = routeName;
            dropdown.appendChild(option);
        });

        // 選択を復元
        dropdown.value = currentSelectedIndex >= 0 ? currentSelectedIndex.toString() : '';
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
                endPointId: routePoints.end,
                allRoutes: this.routeManager.getAllRoutes(),
                selectedRouteIndex: this.routeManager.selectedRouteIndex
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

        // 開始・終了ポイントがスポット名の場合、常に表示するように設定
        this.updateAlwaysVisibleSpotNames();

        return newValue;
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
     * 新しいルートを追加
     */
    handleAddRoute() {
        const newRoute = {
            routeName: `ルート${this.routeManager.getAllRoutes().length + 1}`,
            startPointId: '',
            endPointId: '',
            routePoints: []
        };
        this.routeManager.addRoute(newRoute);
        // 追加したルートを自動選択
        const newIndex = this.routeManager.getAllRoutes().length - 1;
        this.routeManager.selectRoute(newIndex);

        // 開始・終了ポイント入力フィールドを編集可能にする
        this.setRouteInputsEditable(true);

        UIHelper.showMessage('新しいルートを追加しました。開始ポイントを画像上で選択してください');
    }

    /**
     * すべてのルートを保存（Firebase）
     */
    async handleSaveRoute() {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            UIHelper.showError('Firebase接続が利用できません');
            return;
        }

        const selectedRoute = this.routeManager.getSelectedRoute();
        if (!selectedRoute) {
            UIHelper.showError('ルートが選択されていません');
            return;
        }

        // 開始・終了ポイントが設定されているか確認
        if (!selectedRoute.startPointId || !selectedRoute.endPointId) {
            UIHelper.showError('開始ポイントと終了ポイントを設定してください');
            return;
        }

        // 中間点が1件以上設定されているか確認
        if (!selectedRoute.routePoints || selectedRoute.routePoints.length === 0) {
            UIHelper.showError('中間点を1件以上設定してください');
            return;
        }

        try {
            // プロジェクトIDを画像ファイル名から取得
            const projectId = this.fileHandler.getCurrentImageFileName();
            if (!projectId) {
                UIHelper.showError('画像ファイル名を取得できません');
                return;
            }

            // すべてのルートを保存
            const allRoutes = this.routeManager.getAllRoutes();
            let savedCount = 0;
            let updatedCount = 0;
            let addedCount = 0;
            const savedRouteNames = [];

            for (const route of allRoutes) {
                // 開始・終了ポイント、中間点が設定されていないルートはスキップ
                if (!route.startPointId || !route.endPointId ||
                    !route.routePoints || route.routePoints.length === 0) {
                    continue;
                }

                // キャンバス座標を画像座標に変換
                const waypoints = route.routePoints.map(point => {
                    const imageCoords = CoordinateUtils.canvasToImage(
                        point.x, point.y,
                        this.canvas.width, this.canvas.height,
                        this.currentImage.width, this.currentImage.height
                    );
                    return { x: imageCoords.x, y: imageCoords.y };
                });

                // Firebaseに保存するルートデータ
                const routeData = {
                    routeName: route.routeName || `${route.startPointId} ～ ${route.endPointId}`,
                    startPoint: route.startPointId,
                    endPoint: route.endPointId,
                    waypoints: waypoints
                };

                // 更新されたルートかどうかを記録
                const wasModified = route.isModified;

                // FirestoreIDがあれば更新、なければ新規追加
                if (route.firestoreId) {
                    // 既存ルートを更新
                    await window.firestoreManager.updateRoute(projectId, route.firestoreId, routeData);
                    updatedCount++;
                } else {
                    // 新規ルートを追加
                    const result = await window.firestoreManager.addRoute(projectId, routeData);
                    if (result.status === 'success') {
                        // FirestoreIDを保存
                        route.firestoreId = result.firestoreId;
                        addedCount++;
                    } else if (result.status === 'duplicate') {
                        // 重複している場合は既存のFirestoreIDを保存
                        route.firestoreId = result.existing.firestoreId;
                        // 既存ルートを更新
                        await window.firestoreManager.updateRoute(projectId, route.firestoreId, routeData);
                        updatedCount++;
                    }
                }

                // 更新フラグをクリア
                route.isModified = false;
                savedCount++;

                // 更新されたルートのみ一覧に追加
                if (wasModified) {
                    savedRouteNames.push(routeData.routeName);
                }
            }

            // 開始・終了ポイント入力フィールドを読み取り専用にする
            this.setRouteInputsEditable(false);

            // UI更新
            this.routeManager.notify('onModifiedStateChange', { isModified: false });
            this.routeManager.notify('onRouteListChange', allRoutes);

        } catch (error) {
            UIHelper.showError('ルート保存中にエラーが発生しました: ' + error.message);
        }
    }

    /**
     * 選択中のルートを削除
     */
    async handleDeleteRoute() {
        const selectedIndex = this.routeManager.selectedRouteIndex;
        if (selectedIndex < 0) {
            UIHelper.showError('ルートが選択されていません');
            return;
        }

        const selectedRoute = this.routeManager.getSelectedRoute();
        const routeName = selectedRoute.routeName || `${selectedRoute.startPointId} ～ ${selectedRoute.endPointId}`;

        if (confirm(`ルート「${routeName}」を削除しますか？`)) {
            try {
                // Firebaseから削除
                if (selectedRoute.firestoreId) {
                    const projectId = this.fileHandler.getCurrentImageFileName();
                    await window.firestoreManager.deleteRoute(projectId, selectedRoute.firestoreId);
                }

                // RouteManagerから削除
                this.routeManager.deleteRoute(selectedIndex);
                UIHelper.showMessage(`ルート「${routeName}」を削除しました`);
            } catch (error) {
                UIHelper.showError('ルート削除中にエラーが発生しました: ' + error.message);
            }
        }
    }

    /**
     * ルート入力フィールドの編集可/不可を設定
     * @param {boolean} editable - 編集可能かどうか
     */
    setRouteInputsEditable(editable) {
        const startPointInput = document.getElementById('startPointInput');
        const endPointInput = document.getElementById('endPointInput');

        if (editable) {
            startPointInput.removeAttribute('readonly');
            endPointInput.removeAttribute('readonly');
        } else {
            startPointInput.setAttribute('readonly', 'readonly');
            endPointInput.setAttribute('readonly', 'readonly');
        }
    }

    /**
     * ルートポイント編集リクエスト処理
     * @param {string} pointType - 'start' または 'end'
     */
    handleRoutePointEditRequest(pointType) {
        const selectedRoute = this.routeManager.getSelectedRoute();
        if (!selectedRoute) return;

        // 中間点をクリア
        if (selectedRoute.routePoints && selectedRoute.routePoints.length > 0) {
            selectedRoute.routePoints = [];
            this.routeManager.notify('onCountChange', 0);
            this.routeManager.notify('onChange');
        }

        // 開始・終了ポイントをクリア
        if (pointType === 'start') {
            this.routeManager.setStartPoint('', true);
            this.routeManager.setEndPoint('', true);
        } else {
            this.routeManager.setEndPoint('', true);
        }

        // 入力フィールドを編集可能にする
        this.setRouteInputsEditable(true);

        // 適切な入力フィールドにフォーカス
        const inputId = pointType === 'start' ? 'startPointInput' : 'endPointInput';
        setTimeout(() => {
            document.getElementById(inputId).focus();
        }, 100);

        UIHelper.showMessage('ルートポイントを編集できるようになりました。画像上でポイント/スポットを選択してください');
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
            this.viewportManager,
            () => this.redrawCanvas()
        );
    }

}
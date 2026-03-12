import { CanvasRenderer } from './core/Canvas.js';
import { PointManager } from './data/PointManager.js';
import { RouteManager } from './data/RouteManager.js';
import { SpotManager } from './data/SpotManager.js';
import { AreaManager } from './data/AreaManager.js';
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
import { CanvasEventHandler } from './ui/CanvasEventHandler.js';
import { RouteUIManager } from './ui/RouteUIManager.js';
import { AreaUIManager } from './ui/AreaUIManager.js';

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
        this.areaManager = new AreaManager();
        this.fileHandler = new FileHandler();
        this.inputManager = new InputManager(this.canvas);
        this.layoutManager = new LayoutManager();
        this.validationManager = new ValidationManager();

        this.canvasEventHandler = new CanvasEventHandler(this);
        this.routeUIManager = new RouteUIManager(this);
        this.areaUIManager = new AreaUIManager(this);
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
            this.areaManager,
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

        // CanvasEventHandlerの初期化 (済み)


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
            this.routeUIManager.updateRouteDropdown(routes);
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

            // ルート選択時はポイントID表示チェックボックスを強制的にオンにする
            if (index >= 0) {
                const checkbox = document.getElementById('showPointIdsCheckbox');
                if (checkbox && !checkbox.checked) {
                    checkbox.checked = true;
                    this.handlePointIdVisibilityChange(true);
                }
            }
        });

        // ルート更新状態変更時のコールバック
        this.routeManager.setCallback('onModifiedStateChange', (data) => {
            this.routeUIManager.updateRouteDropdown(this.routeManager.getAllRoutes());
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

        // エリア管理のコールバック
        this.areaManager.setCallback('onChange', () => {
            this.redrawCanvas();
        });

        this.areaManager.setCallback('onCountChange', (count) => {
            const el = document.getElementById('vertexCount');
            if (el) el.textContent = count;
        });

        this.areaManager.setCallback('onAreaListChange', (areas) => {
            this.areaUIManager.updateAreaDropdown(areas);
        });

        this.areaManager.setCallback('onSelectionChange', (index) => {
            const dropdown = document.getElementById('areaSelectDropdown');
            if (dropdown) {
                dropdown.value = index >= 0 ? index.toString() : '';
            }
            // 入力フィールドも更新
            this.areaUIManager.updateAreaNameInput();
        });

        this.areaManager.setCallback('onModifiedStateChange', (data) => {
            this.areaUIManager.updateAreaDropdown(this.areaManager.getAllAreas());
        });

        this.areaManager.setCallback('onNoAreaSelected', (message) => {
            UIHelper.showMessage(message);
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
            // blur時にIDが空白の場合はポイントを削除して終了
            if (!data.skipFormatting && data.id.trim() === '') {
                const points = this.pointManager.getPoints();
                if (data.index >= 0 && data.index < points.length) {
                    // 画面から削除
                    this.pointManager.removePoint(data.index);
                }
                return;
            }

            // フォーマット処理を実行（blur時もinput時も）
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
            // blur時にスポット名が空白の場合はスポットを削除
            if (!data.skipFormatting && data.name.trim() === '') {
                // Firebaseからも削除するため、削除前に座標を取得
                const spots = this.spotManager.getSpots();
                if (data.index >= 0 && data.index < spots.length) {
                    // 画面から削除
                    this.spotManager.removeSpot(data.index);
                    return;
                }
            }

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
                // Firebaseからも削除するため、削除前に座標を取得
                const spots = this.spotManager.getSpots();
                if (data.index >= 0 && data.index < spots.length) {
                    // 画面から削除
                    this.spotManager.removeSpot(data.index);
                }
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

            if (mode === 'area') {
                // エリア編集モードに切り替えた時、ポイントID表示を維持（または必要に応じて変更）
                if (pointIdCheckbox) {
                    pointIdCheckbox.checked = true;
                    this.handlePointIdVisibilityChange(true);
                }
            } else if (mode === 'route') {
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
        // Stage 1: 画像読み込み
        const stage1ImageBtn = document.getElementById('stage1ImageBtn');
        if (stage1ImageBtn) {
            stage1ImageBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleImageSelection();
            });
        }

        // JSON読み込み
        const loadJsonBtn = document.getElementById('loadJsonBtn');
        if (loadJsonBtn) {
            loadJsonBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleInput();
            });
        }

        // JSON保存
        const saveJsonBtn = document.getElementById('saveJsonBtn');
        if (saveJsonBtn) {
            saveJsonBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleOutput();
            });
        }

        // キャンバスイベント
        this.canvas.addEventListener('mousedown', (e) => this.canvasEventHandler.handleCanvasMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.canvasEventHandler.handleCanvasMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.canvasEventHandler.handleCanvasMouseUp(e));
        this.canvas.addEventListener('click', (e) => this.canvasEventHandler.handleCanvasClick(e));
        this.canvas.addEventListener('contextmenu', (e) => this.canvasEventHandler.handleCanvasContextMenu(e));


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

        // データベース操作のリスナー設定
        this.markerSettingsManager.setupDatabaseListeners({
            onLoad: async (e) => {
                e.preventDefault();
                // 読み込み時にFirebaseへ接続（未接続の場合のみ）
                try {
                    if (window.connectFirebase) {
                        await window.connectFirebase();
                    }
                } catch (error) {
                    return; // 接続失敗時は処理中断
                }
                // FirebaseSyncManager側でデータがある場合のみ確認が入るので、ここは直接呼び出す
                await this.firebaseSyncManager.loadFromFirebase((points, routes, spots) => {
                    // 読み込み完了時の処理
                    this.redrawCanvas();
                    this.markerSettingsManager.closeDialog();
                });
            },
            onExport: async (e) => {
                e.preventDefault();
                // 保存確認
                if (!confirm('現在のデータをデータベースに上書き保存しますか？')) {
                    return;
                }
                // 保存時にFirebaseへ接続（未接続の場合のみ）
                try {
                    if (window.connectFirebase) {
                        await window.connectFirebase();
                    }
                } catch (error) {
                    return; // 接続失敗時は処理中断
                }
                await this.firebaseSyncManager.saveAllToFirebase();
                // 保存後はダイアログを閉じる
                this.markerSettingsManager.closeDialog();
            }
        });

        // 開始・終了ポイント入力
        const startPointInput = document.getElementById('startPointInput');
        const endPointInput = document.getElementById('endPointInput');

        // readonly状態の入力フィールドクリック時に変更確認
        startPointInput.addEventListener('click', (e) => {
            if (e.target.hasAttribute('readonly')) {
                const confirmed = confirm('開始ポイントを変更しますか？\n変更すると中間点がクリアされます。');
                if (confirmed) {
                    this.routeUIManager.handleRoutePointEditRequest('start');
                }
            }
        });

        endPointInput.addEventListener('click', (e) => {
            if (e.target.hasAttribute('readonly')) {
                const confirmed = confirm('終了ポイントを変更しますか？\n変更すると中間点がクリアされます。');
                if (confirmed) {
                    this.routeUIManager.handleRoutePointEditRequest('end');
                }
            }
        });

        // blur時に半角・大文字変換とX-nn形式のフォーマット処理を実行
        startPointInput.addEventListener('blur', (e) => {
            const inputValue = e.target.value.trim();
            const previousValue = this.routeManager.getStartEndPoints().start;
            const newValue = this.routeUIManager.handleRoutePointBlur(inputValue, 'start', previousValue);
            e.target.value = newValue;
        });

        endPointInput.addEventListener('blur', (e) => {
            const inputValue = e.target.value.trim();
            const previousValue = this.routeManager.getStartEndPoints().end;
            const newValue = this.routeUIManager.handleRoutePointBlur(inputValue, 'end', previousValue);
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
            this.routeUIManager.handleAddRoute();
        });

        document.getElementById('deleteRouteBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.routeUIManager.handleDeleteRoute();
        });

        // エリア選択ドロップダウン
        const areaDropdown = document.getElementById('areaSelectDropdown');
        if (areaDropdown) {
            areaDropdown.addEventListener('change', (e) => {
                const selectedIndex = e.target.value === '' ? -1 : parseInt(e.target.value);
                this.areaManager.selectArea(selectedIndex);

                if (selectedIndex >= 0) {
                    const areas = this.areaManager.getAllAreas();
                    const selectedArea = areas[selectedIndex];
                    if (selectedArea) {
                        UIHelper.showMessage(`エリア "${selectedArea.areaName}" を選択しました`, 'info');
                    }
                } else {
                    UIHelper.showMessage('エリア選択を解除しました', 'info');
                }

                // 入力フィールドの更新は updateAreaDropdown 経由または setCallback('onSelectionChange') で行われるが、
                // ここでも念のため更新を呼ぶか、Managerの通知に任せる。
                // 今回はManagerの onSelectionChange コールバックで updateSelectDropdown が呼ばれ、
                // そこから updateAreaNameInput を呼ぶように修正したほうがきれいだが、
                // 既存実装では onSelectionChange -> dropdown.value更新のみ。
                // なので、コールバック側を修正する。
            });
        }

        // エリア操作ボタン
        const addAreaBtn = document.getElementById('addAreaBtn');
        if (addAreaBtn) {
            addAreaBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.areaUIManager.handleAddArea();
            });
        }

        const deleteAreaBtn = document.getElementById('deleteAreaBtn');
        if (deleteAreaBtn) {
            deleteAreaBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.areaUIManager.handleDeleteArea();
            });
        }

        const renameAreaBtn = document.getElementById('renameAreaBtn');
        if (renameAreaBtn) {
            renameAreaBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.areaUIManager.handleRenameArea();
            });
        }

        // エリア名入力フィールド
        const areaNameInput = document.getElementById('areaNameInput');
        if (areaNameInput) {
            // changeイベント（Enter押下またはフォーカスアウト時）
            areaNameInput.addEventListener('change', (e) => {
                this.areaUIManager.handleAreaNameChange(e.target.value);
            });
            // フォーカス時に全選択
            areaNameInput.addEventListener('focus', (e) => {
                e.target.select();
            });
        }

        // ポイントID表示切り替えチェックボックス
        document.getElementById('showPointIdsCheckbox').addEventListener('change', (e) => {
            this.handlePointIdVisibilityChange(e.target.checked);
        });

        // スポット名表示切り替えチェックボックス
        document.getElementById('showSpotNamesCheckbox').addEventListener('change', (e) => {
            this.handleSpotNameVisibilityChange(e.target.checked, true);
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
        // 初期状態: Stage 1のみ表示
        this.setUIStage(1);
    }

    /**
     * UIのステージを設定
     * @param {number} stage - 1: 画像読み込み, 2: 入力, 3: 出力
     */
    setUIStage(stage) {
        const stage1 = document.getElementById('stage1-container');
        const fileOps = document.getElementById('file-operations-container');

        if (stage1 && fileOps) {
            stage1.style.display = stage === 1 ? 'block' : 'none';
            // Stage 2以降はファイル操作ボタンを表示
            fileOps.style.display = stage >= 2 ? 'flex' : 'none';
        }
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
            await this.processLoadedImage(result.image, result.fileName, result.fullFileName);
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
    async processLoadedImage(image, fileName, fullFileName = '') {
        this.currentImage = image;
        this.canvasRenderer.setImage(image);
        this.canvasRenderer.setupCanvas(this.layoutManager.getCurrentLayout());
        this.canvasRenderer.drawImage();
        this.enableImageControls();
        this.layoutManager.setDefaultPointMode();
        UIHelper.showMessage(`画像「${fileName}」を読み込みました`);

        // ファイル名表示を更新
        const filenameDisplay = document.getElementById('imageFilenameDisplay');
        if (filenameDisplay) {
            filenameDisplay.textContent = fullFileName || `${fileName}.png`; // fallback
            filenameDisplay.style.display = 'block';
        }

        // FirebaseSyncManagerに画像とキャンバスを設定
        this.firebaseSyncManager.setImageAndCanvas(image, this.canvas);

        // Stage 2へ移行
        this.setUIStage(2);
    }

    /**
     * データ入力処理
     */
    async handleInput() {
        try {
            const file = await this.fileHandler.selectJsonFile();
            const result = await this.fileHandler.importProjectData(
                {
                    pointManager: this.pointManager,
                    routeManager: this.routeManager,
                    spotManager: this.spotManager,
                    areaManager: this.areaManager
                },
                file,
                this.canvas.width, this.canvas.height, // 現在のキャンバスサイズ
                this.currentImage.width, this.currentImage.height // 元画像サイズ
            );

            this.redrawAndSyncUI(result.pointsCount, result.routesCount, result.spotsCount);
            const loadParts = [];
            if (result.pointsCount > 0) loadParts.push(`ポイント: ${result.pointsCount}`);
            if (result.routesCount > 0) loadParts.push(`ルート: ${result.routesCount}`);
            if (result.spotsCount > 0) loadParts.push(`スポット: ${result.spotsCount}`);
            if (result.areasCount > 0) loadParts.push(`エリア: ${result.areasCount}`);
            const loadDetail = loadParts.length > 0 ? ` (${loadParts.join(', ')})` : '';
            UIHelper.showMessage(`ファイルからデータを読み込みました${loadDetail}`);

            // Stage 2へ移行 (読み込み直後と同じ状態)
            this.setUIStage(2);

        } catch (error) {
            console.error('入力エラー:', error);
            if (error.message !== 'ファイル選択がキャンセルされました') {
                UIHelper.showError('データの読み込みに失敗しました: ' + error.message);
            }
        }
    }

    /**
     * 保存対象選択ダイアログを表示し、選択結果を返す
     * @param {{points:number, routes:number, spots:number, areas:number}} counts - 各データの件数
     * @returns {Promise<{points:boolean, routes:boolean, spots:boolean, areas:boolean}|null>}
     */
    showSaveSelectionDialog(counts) {
        return new Promise((resolve) => {
            const dialog = document.getElementById('saveSelectionDialog');
            const okBtn = document.getElementById('saveSelectionOkBtn');
            const cancelBtn = document.getElementById('saveSelectionCancelBtn');

            // 件数表示と、0件の場合はチェックをオフ
            const items = [
                { cbId: 'savePoints', countId: 'savePointsCount', count: counts.points, unit: '点' },
                { cbId: 'saveRoutes', countId: 'saveRoutesCount', count: counts.routes, unit: '本' },
                { cbId: 'saveSpots',  countId: 'saveSpotsCount',  count: counts.spots,  unit: '個' },
                { cbId: 'saveAreas',  countId: 'saveAreasCount',  count: counts.areas,  unit: '件' }
            ];
            items.forEach(({ cbId, countId, count, unit }) => {
                const cb = document.getElementById(cbId);
                cb.checked = count > 0;
                document.getElementById(countId).textContent = `${count}${unit}`;
            });

            dialog.style.display = 'flex';

            const cleanup = () => {
                dialog.style.display = 'none';
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
            };

            const onOk = () => {
                cleanup();
                resolve({
                    points: document.getElementById('savePoints').checked,
                    routes: document.getElementById('saveRoutes').checked,
                    spots: document.getElementById('saveSpots').checked,
                    areas: document.getElementById('saveAreas').checked
                });
            };

            const onCancel = () => {
                cleanup();
                resolve(null);
            };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
        });
    }

    /**
     * データ出力処理
     */
    async handleOutput() {
        try {
            const projectId = this.fileHandler.getCurrentImageFileName() || 'project_data';

            // ファイル名生成ロジック（画像ファイル略称：区切り文字の前まで）
            const abbrMatch = projectId.match(/^[^-_ ]+/);
            const abbr = abbrMatch ? abbrMatch[0] : projectId;

            // 各データの件数を事前に計算
            const counts = {
                points: this.pointManager.getPoints().filter(p => p.id && p.id.trim() !== '').length,
                routes: this.routeManager.getAllRoutes().length,
                spots:  this.spotManager.getSpots().filter(s => s.name && s.name.trim() !== '').length,
                areas:  this.areaManager.getAllAreas().filter(a => a.areaName && a.areaName.trim() !== '').length
            };

            // 保存対象選択ダイアログを表示（件数を渡す）
            const saveOptions = await this.showSaveSelectionDialog(counts);
            if (!saveOptions) return; // キャンセル

            // 選択対象のみカウント（ファイル名用）
            const pointCount = saveOptions.points ? counts.points : 0;
            const routeCount = saveOptions.routes ? counts.routes : 0;
            const spotCount  = saveOptions.spots  ? counts.spots  : 0;
            const areaCount  = saveOptions.areas  ? counts.areas  : 0;

            // ファイル名構築
            const now = new Date();
            const dateSuffix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
            let filename = abbr;
            if (pointCount > 0) filename += `_P${pointCount}`;
            if (routeCount > 0) filename += `_R${routeCount}`;
            if (spotCount > 0) filename += `_S${spotCount}`;
            if (areaCount > 0) filename += `_A${areaCount}`;
            filename += `-${dateSuffix}.json`;

            await this.fileHandler.exportProjectData(
                {
                    pointManager: this.pointManager,
                    routeManager: this.routeManager,
                    spotManager: this.spotManager,
                    areaManager: this.areaManager
                },
                this.fileHandler.getCurrentImageFileName() + '.png',
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height,
                filename,
                saveOptions
            );

            // 出力が完了したら、入力ボタン（Stage 2）を表示
            this.setUIStage(2);

        } catch (error) {
            console.error('出力エラー:', error);
            if (error.message !== 'ファイル保存がキャンセルされました') {
                UIHelper.showError('データの保存に失敗しました: ' + error.message);
            }
        }
    }

    /**
     * UI同期と再描画
     */
    redrawAndSyncUI(pointCount, routeCount, spotCount) {
        // UIを更新
        this.inputManager.redrawInputBoxes(this.pointManager.getPoints());
        this.inputManager.redrawSpotInputBoxes(this.spotManager.getSpots());
        this.viewportManager.updatePopupPositions();
        this.redrawCanvas();

        // ポイント数・スポット数を更新
        if (pointCount !== undefined) document.getElementById('pointCount').textContent = pointCount;
        if (spotCount !== undefined) document.getElementById('spotCount').textContent = spotCount;

        // 中間点数は初期化
        document.getElementById('waypointCount').textContent = 0;

        // ルートドロップダウン更新
        this.routeUIManager.updateRouteDropdown(this.routeManager.getAllRoutes());

        // エリアドロップダウン更新
        this.areaUIManager.updateAreaDropdown(this.areaManager.getAllAreas());
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
     * キャンバスを再描画
     */
    redrawCanvas() {
        const mode = this.layoutManager.getCurrentEditingMode();
        const routePoints = this.routeManager.getStartEndPoints();

        this.canvasRenderer.redraw(
            this.pointManager.getPoints(),
            this.routeManager.getRoutePoints(),
            this.spotManager.getSpots(),
            this.areaManager.getAllAreas(), // エリアデータを渡す
            {
                showRouteMode: mode === 'route',
                startPointId: routePoints.start,
                endPointId: routePoints.end,
                allRoutes: this.routeManager.getAllRoutes(),
                selectedRouteIndex: this.routeManager.selectedRouteIndex,
                selectedAreaIndex: this.areaManager.selectedAreaIndex, // エリア選択状態
                showAreaEditMode: mode === 'area' // エリア編集モード
            }
        );
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
    handleSpotNameVisibilityChange(visible, isUserAction = false) {
        // スポットデータを取得して渡す
        const spots = this.spotManager.getSpots();
        this.inputManager.setSpotNameVisibility(visible, spots, isUserAction);
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
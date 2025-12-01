// GeoReferencerメインアプリケーションファイル - リファクタリング版
import { MapCore } from './map-core.js';
import { ImageOverlay } from './image-overlay.js';
import { GPSData } from './gps-data.js';
import { Georeferencing } from './georeferencing.js';
import { RouteSpotHandler } from './route-spot-handler.js';
import { CoordinateDisplay } from './coordinate-display.js';
import { UIHandlers } from './ui-handlers.js';
import { FileHandler } from './file-handler.js';
import { CONFIG, DEFAULTS } from './constants.js';
import { Logger, errorHandler } from './utils.js';

// Firebase関連
import { firebaseConfig } from './firebase/firebase.config.js';
import { FirebaseClient } from './firebase/FirebaseClient.js';
import { AuthManager } from './firebase/AuthManager.js';
import { FirestoreDataManager } from './firebase/FirestoreDataManager.js';

// 標高取得
import { ElevationFetcher } from './elevation-fetcher.js';

class GeoReferencerApp {
    constructor() {
        this.logger = new Logger('GeoReferencerApp');
        this.mapCore = null;
        this.imageOverlay = null;
        this.gpsData = null;
        this.georeferencing = null;
        this.routeSpotHandler = null;
        this.coordinateDisplay = null;
        this.uiHandlers = null;
        this.fileHandler = null;
        this.pointJsonData = null;
        this.imageCoordinateMarkers = [];

        // PNG画像ファイル名を記録
        this.currentPngFileName = null;

        // Firebase関連
        this.firebaseClient = null;
        this.authManager = null;
        this.firestoreManager = null;
        this.currentProjectId = null; // PNG画像ファイル名(拡張子なし)

        // 標高取得
        this.elevationFetcher = null;

        this.logger.info('GeoReferencerApp初期化開始');
    }

    async init() {
        try {
            this.logger.info('アプリケーション初期化開始');

            // Firebase初期化
            await this.initializeFirebase();

            // コアモジュール初期化
            this.mapCore = new MapCore();

            // MapCoreの初期化完了を待つ
            await this.mapCore.initPromise;

            // 他のモジュールを初期化
            await this.initializeModules();

            // イベントハンドラー設定
            this.setupEventHandlers();

            this.logger.info('アプリケーション初期化完了');

        } catch (error) {
            this.logger.error('アプリケーション初期化エラー', error);
            errorHandler.handle(error, 'アプリケーション初期化中にエラーが発生しました。', 'アプリケーション初期化');
        }
    }

    async initializeFirebase() {
        try {
            this.logger.info('Firebase初期化開始');

            // FirebaseClient初期化
            this.firebaseClient = new FirebaseClient(firebaseConfig);
            await this.firebaseClient.initialize();

            // AuthManager初期化
            this.authManager = new AuthManager(this.firebaseClient);

            // 匿名認証
            const user = await this.authManager.signInAnonymously();
            this.logger.info('Firebase匿名認証成功', user.uid);

            // FirestoreDataManager初期化（Firestoreインスタンスを渡す）
            this.firestoreManager = new FirestoreDataManager(this.firebaseClient.getFirestore(), user.uid);

            // ElevationFetcher初期化
            this.elevationFetcher = new ElevationFetcher(this.firestoreManager);

            // デバッグ用にグローバルスコープに公開
            window.firebaseClient = this.firebaseClient;
            window.authManager = this.authManager;
            window.firestoreManager = this.firestoreManager;
            window.elevationFetcher = this.elevationFetcher;

            this.logger.info('Firebase初期化完了');

        } catch (error) {
            this.logger.error('Firebase初期化エラー', error);
            // Firebase初期化失敗は警告のみで続行
            errorHandler.handle(error, 'Firebaseの初期化に失敗しました。一部機能が制限されます。', 'Firebase初期化', 'warning');
        }
    }

    async initializeModules() {
        try {
            // 地図が初期化されていることを確認
            if (!this.mapCore || !this.mapCore.getMap()) {
                throw new Error(CONFIG.ERROR_MESSAGES.MAP_NOT_INITIALIZED);
            }

            // 各モジュールを初期化
            this.imageOverlay = new ImageOverlay(this.mapCore);
            this.gpsData = new GPSData();
            this.georeferencing = new Georeferencing(this.mapCore, this.imageOverlay, this.gpsData);
            this.routeSpotHandler = new RouteSpotHandler(this.mapCore, this.imageOverlay);
            this.coordinateDisplay = new CoordinateDisplay(this.mapCore, this.imageOverlay);
            this.uiHandlers = new UIHandlers();
            this.fileHandler = new FileHandler();

            // CoordinateDisplayインスタンスをGeoreferencingに注入
            this.georeferencing.setCoordinateDisplay(this.coordinateDisplay);
            
            // RouteSpotHandlerインスタンスをGeoreferencingに注入
            this.georeferencing.setRouteSpotHandler(this.routeSpotHandler);

            
        } catch (error) {
            this.logger.error('モジュール初期化エラー', error);
            throw error;
        }
    }

    setupEventHandlers() {
        try {
            // ポイントGPS読み込みボタン
            const loadFileBtn = document.getElementById('loadFileBtn');
            const gpsExcelInput = document.getElementById('gpsExcelInput');

            if (loadFileBtn) {
                loadFileBtn.addEventListener('click', () => {
                    if (gpsExcelInput) gpsExcelInput.click();
                });
            }

            // GPS Excelファイル入力
            if (gpsExcelInput) {
                gpsExcelInput.addEventListener('change', (event) => {
                    this.handleGpsExcelLoad(event);
                    this.recordFileDirectory(event.target.files[0]);
                });
            }

            // PNG画像読み込みボタン
            const loadPngBtn = document.getElementById('loadPngBtn');
            const imageInput = document.getElementById('imageInput');

            if (loadPngBtn) {
                loadPngBtn.addEventListener('click', () => {
                    if (imageInput) imageInput.click();
                });
            }

            // PNG画像ファイル入力
            if (imageInput) {
                imageInput.addEventListener('change', (event) => {
                    this.handlePngLoad(event);
                    this.recordFileDirectory(event.target.files[0]);
                });
            }

            // 画像の重ね合わせボタン
            const matchPointsBtn = document.getElementById('matchPointsBtn');
            if (matchPointsBtn) {
                matchPointsBtn.addEventListener('click', () => {
                    this.handleMatchPoints();
                });
            }

            // Firebase保存ボタン (Phase 3実装)
            const saveToFirebaseBtn = document.getElementById('saveToFirebaseBtn');
            if (saveToFirebaseBtn) {
                saveToFirebaseBtn.addEventListener('click', () => {
                    this.handleSaveToFirebase();
                });
            }

            // 標高取得ボタン (Phase 4実装)
            const fetchElevationBtn = document.getElementById('fetchElevationBtn');
            if (fetchElevationBtn) {
                fetchElevationBtn.addEventListener('click', () => {
                    this.handleFetchElevation();
                });
            }

        } catch (error) {
            this.logger.error('イベントハンドラー設定エラー', error);
            errorHandler.handle(error, 'イベントハンドラーの設定中にエラーが発生しました。', 'イベントハンドラー設定');
        }
    }

    async handleGpsExcelLoad(event) {
        try {
            // 既存データがある場合は確認
            const existingCount = this.gpsData?.getPoints()?.length || 0;
            if (existingCount > 0) {
                const shouldClear = window.confirm(
                    `既存の${existingCount}個のポイントをクリアして、新しく読み込みます。`
                );
                if (!shouldClear) {
                    // ファイル入力をリセット
                    event.target.value = '';
                    return;
                }
            }

            const file = event.target.files[0];
            if (!file) {
                // ファイル選択がキャンセルされた場合
                // 既存データは保持(一時保存不要)
                return;
            }

            this.logger.info('GPS Excelファイル読み込み開始', file.name);

            // 既存データをクリア
            if (existingCount > 0) {
                this.gpsData.gpsPoints = [];
                this.gpsData.clearMarkersFromMap();
            }

            // GPSDataクラスのExcel読み込み機能を使用
            const rawData = await this.fileHandler.loadExcelFile(file);

            // Excel データを検証・変換
            const validatedData = this.fileHandler.validateAndConvertExcelData(rawData);

            if (validatedData.length === 0) {
                throw new Error('有効なGPSポイントデータが見つかりませんでした。');
            }

            // GPSDataに変換されたデータを設定
            this.gpsData.setPointsFromExcelData(validatedData);

            // 地図上にGPSポイントを表示
            if (this.mapCore && this.mapCore.getMap()) {
                this.gpsData.displayPointsOnMap(this.mapCore.getMap());
            }

            // GPS ポイント数を更新
            this.uiHandlers.updateGpsPointCount(this.gpsData);

            this.logger.info(`GPS Excelファイル読み込み完了: ${validatedData.length}ポイント`);

            // 成功メッセージを表示
            this.showMessage(`${validatedData.length}個のポイントGPSを読み込みました`);

        } catch (error) {
            this.logger.error('GPS Excel読み込みエラー', error);
            errorHandler.handle(error, error.message, 'GPS Excel読み込み');
        } finally {
            // 同じファイルを再選択できるようにファイル入力をリセット
            event.target.value = '';
        }
    }

    async handlePngLoad(event) {
        try {
            // 既存データがある場合は確認
            if (this.currentPngFileName) {
                const shouldClear = window.confirm(
                    `既存の画像およびそのデータをクリアして、新しく読み込みます。`
                );
                if (!shouldClear) {
                    // ファイル入力をリセット
                    event.target.value = '';
                    return;
                }
            }

            const file = event.target.files[0];
            if (!file) {
                // ファイル選択がキャンセルされた場合
                return;
            }

            // 既存データをクリア(画面上のみ、Firebaseは削除しない)
            if (this.currentPngFileName) {
                // 画像クリア
                if (this.imageOverlay) {
                    // Leaflet ImageOverlayを地図から削除
                    if (this.imageOverlay.imageOverlay && this.mapCore && this.mapCore.getMap()) {
                        this.mapCore.getMap().removeLayer(this.imageOverlay.imageOverlay);
                    }
                    // ImageOverlayの内部状態をクリア
                    this.imageOverlay.imageOverlay = null;
                    this.imageOverlay.currentImage = new Image(); // 新しいImageオブジェクトを作成
                    this.imageOverlay.currentImageFileName = null;
                    this.imageOverlay.resetTransformation();
                }

                // ポイント・ルート・スポットクリア
                if (this.routeSpotHandler) {
                    this.routeSpotHandler.pointData = [];
                    this.routeSpotHandler.routeData = [];
                    this.routeSpotHandler.spotData = [];
                    this.routeSpotHandler.clearAllMarkers();
                }

                this.currentPngFileName = null;
                this.currentProjectId = null;
            }

            // PNGファイル名を記録（拡張子を除去）
            this.currentPngFileName = file.name.replace(/\.[^/.]+$/, '');
            this.currentProjectId = this.currentPngFileName; // FirebaseのprojectIdとして使用
            this.logger.info('PNGファイル:', this.currentPngFileName);
            this.logger.info('ProjectID:', this.currentProjectId);

            // PNG画像を読み込み
            if (this.imageOverlay) {
                await this.imageOverlay.loadImage(file);
            }

            // Firebaseから画像座標データを自動読み込み
            await this.loadFromFirebase();

            // 成功メッセージを表示
            this.showMessage(`PNG画像ファイルを読み込みました:\n${file.name}`);

        } catch (error) {
            this.logger.error('PNG読み込みエラー', error);
            errorHandler.handle(error, 'PNG画像の読み込みに失敗しました。', 'PNG読み込み');
        } finally {
            // 同じファイルを再選択できるようにファイル入力をリセット
            event.target.value = '';
        }
    }

    async loadFromFirebase() {
        try {
            // Firebase接続確認
            if (!this.firestoreManager) {
                this.logger.warn('Firebase未接続のため、画像座標データの自動読み込みをスキップします');
                return;
            }

            // ProjectID確認
            if (!this.currentProjectId) {
                this.logger.warn('ProjectIDが設定されていません');
                return;
            }

            this.logger.info('Firebaseから画像座標データ読み込み開始:', this.currentProjectId);

            // プロジェクトの存在確認
            const projectMeta = await this.firestoreManager.getProjectMetadata(this.currentProjectId);
            if (!projectMeta) {
                this.logger.info('Firebaseにプロジェクトが見つかりません:', this.currentProjectId);
                this.showMessage('新規プロジェクトです');
                return;
            }

            // points読み込み
            const points = await this.firestoreManager.getPoints(this.currentProjectId);
            this.logger.info(`Firebaseからポイント読み込み: ${points.length}件`);

            // routes読み込み
            const routes = await this.firestoreManager.getRoutes(this.currentProjectId);
            this.logger.info(`Firebaseからルート読み込み: ${routes.length}件`);

            // spots読み込み
            const spots = await this.firestoreManager.getSpots(this.currentProjectId);
            this.logger.info(`Firebaseからスポット読み込み: ${spots.length}件`);

            // RouteSpotHandlerにデータをロード
            if (this.routeSpotHandler) {
                await this.routeSpotHandler.loadFromFirebaseData(points, routes, spots, this.imageOverlay);
            }

            // UI更新
            this.uiHandlers.updateRouteSpotCount(this.routeSpotHandler);

            this.logger.info('Firebaseからの画像座標データ読み込み完了');

        } catch (error) {
            this.logger.error('Firebase読み込みエラー', error);
            // エラーは警告として表示（致命的ではない）
            this.showMessage('Firebaseからのデータ読み込みに失敗しました');
        }
    }

    async handlePointCoordJsonLoad(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            this.logger.info('ポイント(座標)JSONファイル読み込み開始', file.name);
            
            // JSONファイルを読み込んでポイント座標情報を処理
            const text = await file.text();
            const data = JSON.parse(text);
            
            // ポイントJSONデータを保存
            this.pointJsonData = data;
            this.georeferencing.setPointJsonData(data);
            
            // imageX, imageYを持つポイントを画像上に表示
            if (this.imageOverlay && data) {
                // 既存のマーカーをクリア
                this.georeferencing.clearImageCoordinateMarkers('georeference-point');
                
                this.imageCoordinateMarkers = await this.coordinateDisplay.displayImageCoordinates(data, 'points', this.imageCoordinateMarkers);
                
                // GeoreferencingクラスにもmarkerInfoを渡す
                this.imageCoordinateMarkers.forEach(markerInfo => {
                    this.georeferencing.addImageCoordinateMarker(markerInfo);
                });
                
                this.logger.info(`ポイントマーカー登録完了: ${this.imageCoordinateMarkers.length}個`);
            }
            
            // ポイント座標数を更新
            this.uiHandlers.updatePointCoordCount(this.pointJsonData);
            
            this.logger.info('ポイント(座標)JSON読み込み完了', data);
            
        } catch (error) {
            this.logger.error('ポイント(座標)JSON読み込みエラー', error);
            errorHandler.handle(error, 'ポイント(座標)JSONファイルの読み込みに失敗しました。', 'ポイント(座標)JSON読み込み');
        }
    }

    async handleRouteSpotJsonLoad(event) {
        try {
            const files = Array.from(event.target.files);
            if (!files.length) return;

            // RouteSpotHandlerに処理を委譲（自動判定するため、selectedRouteSpotTypeは不要）
            await this.routeSpotHandler.handleRouteSpotJsonLoad(files, null);
            
            // ルート・スポット数を更新
            this.uiHandlers.updateRouteSpotCount(this.routeSpotHandler);
            
        } catch (error) {
            this.logger.error('ルート・スポット(座標)JSON読み込みエラー', error);
            errorHandler.handle(error, 'ルート・スポット(座標)JSONファイルの読み込みに失敗しました。', 'ルート・スポット(座標)JSON読み込み');
        }
    }

    async handleMultiJsonLoad(event) {
        try {
            const files = Array.from(event.target.files);
            if (!files.length) return;

            this.logger.info(`複数JSONファイル読み込み開始: ${files.length}ファイル`);
            
            let pointsProcessed = 0;
            let routesProcessed = 0;
            let spotsProcessed = 0;
            
            // 最初にポイントデータのマーカーをクリア（一度だけ）
            let shouldClearMarkers = true;
            
            // 各ファイルを処理
            for (const file of files) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    
                    this.logger.info(`JSONファイル処理開始: ${file.name}`);
                    
                    // RouteSpotHandlerの自動判定を使用してファイル内容を判定
                    const detectedType = this.routeSpotHandler.detectJsonType(data);
                    
                    if (detectedType === 'route') {
                        // ルートデータの場合
                        await this.routeSpotHandler.handleRouteSpotJsonLoad([file], null);
                        routesProcessed++;
                        
                    } else if (detectedType === 'spot') {
                        // スポットデータの場合
                        await this.routeSpotHandler.handleRouteSpotJsonLoad([file], null);
                        if (data.spots && Array.isArray(data.spots)) {
                            spotsProcessed += data.spots.length;
                        } else {
                            spotsProcessed++;
                        }
                        
                    } else if (detectedType === 'point') {
                        // ポイントデータの場合
                        this.pointJsonData = data;
                        this.georeferencing.setPointJsonData(data);
                        
                        // 画像上にポイント座標を表示
                        if (this.imageOverlay && data.points) {
                            // 最初のポイントファイル処理時のみマーカーをクリア
                            if (shouldClearMarkers) {
                                this.georeferencing.clearImageCoordinateMarkers('georeference-point');
                                this.imageCoordinateMarkers = []; // マーカー配列もクリア
                                shouldClearMarkers = false;
                            }
                            
                            this.imageCoordinateMarkers = await this.coordinateDisplay.displayImageCoordinates(data, 'points', this.imageCoordinateMarkers);
                            
                            // GeoreferencingクラスにもmarkerInfoを渡す
                            this.imageCoordinateMarkers.forEach(markerInfo => {
                                this.georeferencing.addImageCoordinateMarker(markerInfo);
                            });
                            
                            this.logger.info(`ポイント: ${this.imageCoordinateMarkers.length}個`);
                        }
                        
                        pointsProcessed++;
                        
                    } else {
                        this.logger.warn(`未知のJSONファイル形式: ${file.name}`);
                    }
                    
                } catch (fileError) {
                    this.logger.error(`ファイル処理エラー: ${file.name}`, fileError);
                    // 個別ファイルのエラーは警告として処理し、他のファイルの処理を続行
                }
            }
            
            // UIを更新
            if (this.pointJsonData) {
                this.uiHandlers.updatePointCoordCount(this.pointJsonData);
            }
            this.uiHandlers.updateRouteSpotCount(this.routeSpotHandler);

            this.logger.info(`複数JSONファイル読み込み完了 - ポイント: ${pointsProcessed}, ルート: ${routesProcessed}, スポット: ${spotsProcessed}`);

            // 成功メッセージを表示
            this.showMessage(`画像内座標（${files.length} ファイル）を読み込みました`);
            
        } catch (error) {
            this.logger.error('複数JSON読み込みエラー', error);
            errorHandler.handle(error, '複数JSONファイルの読み込みに失敗しました。', '複数JSON読み込み');
        }
    }

    async handleMatchPoints() {
        try {
            this.logger.info('画像重ね合わせ処理開始');
            
            // 1. 画像ファイルの読み込みと準備チェック
            if (!this.imageOverlay || !this.imageOverlay.currentImage || !this.imageOverlay.currentImage.src) {
                throw new Error('PNG画像が読み込まれていません。');
            }

            if (!this.gpsData || !this.gpsData.getPoints() || this.gpsData.getPoints().length === 0) {
                throw new Error('GPS座標データが読み込まれていません。');
            }

            // 2. 初期表示境界の設定
            
            // 3-10. Georeferencingクラスに処理を委譲
            await this.georeferencing.executeGeoreferencing();
            this.georeferencing.setupGeoreferencingUI();
            const result = await this.georeferencing.performGeoreferencingCalculations();
            
            // 結果を表示
            this.uiHandlers.updateMatchResults(result);

            // Firebase保存ボタンと標高取得ボタンを有効化
            const saveToFirebaseBtn = document.getElementById('saveToFirebaseBtn');
            if (saveToFirebaseBtn) {
                saveToFirebaseBtn.disabled = false;
            }

            const fetchElevationBtn = document.getElementById('fetchElevationBtn');
            if (fetchElevationBtn) {
                fetchElevationBtn.disabled = false;
                fetchElevationBtn.title = '標高未取得地点の標高を国土地理院APIから取得します';
            }

            this.logger.info('画像重ね合わせ処理完了', result);

            // 成功メッセージを表示
            this.showMessage(`${result.matchedCount}個のポイントにてジオリファレンスを行いました`);

            // 標高未取得件数を更新（ジオリファレンス後のルート中間点とスポットの件数を表示）
            await this.updateElevationCounts();

        } catch (error) {
            this.logger.error('画像重ね合わせエラー', error);
            errorHandler.handle(error, error.message, '画像重ね合わせ');
        }
    }

    async handleSaveToFirebase() {
        try {
            this.logger.info('Firebase保存処理開始');

            // Firebase接続確認
            if (!this.firestoreManager) {
                throw new Error(CONFIG.ERROR_MESSAGES.FIREBASE_NOT_CONNECTED);
            }

            // ProjectID確認
            if (!this.currentProjectId) {
                throw new Error('PNG画像を先に読み込んでください。');
            }

            // ジオリファレンス実行確認
            if (!this.georeferencing || !this.georeferencing.currentTransformation) {
                throw new Error('ジオリファレンスを先に実行してください。');
            }

            // GPS変換済みデータを収集
            const gpsData = await this.collectGpsDataForFirebase();

            if (gpsData.gpsPoints.length === 0 && gpsData.gpsRoutes.length === 0 && gpsData.gpsSpots.length === 0) {
                throw new Error('保存対象のデータがありません。');
            }

            // 標高未取得地点の確認
            const elevationStats = this.getElevationStats();
            const missingCount = elevationStats.routes.missing + elevationStats.spots.missing;

            if (missingCount > 0) {
                // 確認ダイアログを表示
                const shouldSave = window.confirm(
                    '標高を未取得の地点がありますが、データベースに格納しますか。'
                );
                if (!shouldSave) {
                    // キャンセルの場合は処理を中断
                    return;
                }
            }

            // 既存のGPS変換済みデータを削除（上書き保存）
            await this.firestoreManager.deleteAllGpsData(this.currentProjectId);

            // gpsPointsを保存
            for (const gpsPoint of gpsData.gpsPoints) {
                await this.firestoreManager.addGpsPoint(this.currentProjectId, gpsPoint);
            }

            // gpsRoutesを保存
            for (const gpsRoute of gpsData.gpsRoutes) {
                await this.firestoreManager.addGpsRoute(this.currentProjectId, gpsRoute);
            }

            // gpsSpotsを保存
            for (const gpsSpot of gpsData.gpsSpots) {
                await this.firestoreManager.addGpsSpot(this.currentProjectId, gpsSpot);
            }

            // 標高カウントを更新
            await this.updateElevationCounts();

            // 成功メッセージ表示
            const totalCount = gpsData.gpsPoints.length + gpsData.gpsRoutes.length + gpsData.gpsSpots.length;
            this.showMessage(`GPS変換済みデータをFirebaseに保存しました:\nポイント: ${gpsData.gpsPoints.length}件\nルート: ${gpsData.gpsRoutes.length}件\nスポット: ${gpsData.gpsSpots.length}件`);

            this.logger.info('Firebase保存完了', {
                projectId: this.currentProjectId,
                gpsPoints: gpsData.gpsPoints.length,
                gpsRoutes: gpsData.gpsRoutes.length,
                gpsSpots: gpsData.gpsSpots.length
            });

        } catch (error) {
            this.logger.error('Firebase保存エラー', error);
            errorHandler.handle(error, error.message, 'Firebase保存');
        }
    }

    async handleFetchElevation() {
        try {
            this.logger.info('標高取得処理開始');

            // Firebase接続確認
            if (!this.elevationFetcher) {
                throw new Error('標高取得機能が初期化されていません。');
            }

            // ProjectID確認
            if (!this.currentProjectId) {
                throw new Error('PNG画像を先に読み込んでください。');
            }

            // チェックボックスの状態を確認
            const routeCheckbox = document.getElementById('elevationRouteCheckbox');
            const spotCheckbox = document.getElementById('elevationSpotCheckbox');

            const fetchRoutes = routeCheckbox && routeCheckbox.checked;
            const fetchSpots = spotCheckbox && spotCheckbox.checked;

            if (!fetchRoutes && !fetchSpots) {
                this.showMessage('標高取得対象を選択してください');
                return;
            }

            let totalFetched = 0;
            let totalFailed = 0;

            // ルート中間点の標高取得
            if (fetchRoutes) {
                this.showMessage('ルート中間点の標高を取得中...');

                if (this.routeSpotHandler && this.routeSpotHandler.routeMarkers) {
                    const result = await this.elevationFetcher.fetchAndSetRouteMarkersElevation(
                        this.routeSpotHandler.routeMarkers,
                        (current, total) => {
                            // 進捗表示
                            this.updateElevationProgress('route', current, total);
                        }
                    );

                    totalFetched += result.fetched;
                    totalFailed += result.failed;

                    this.logger.info('ルート中間点の標高取得完了', result);
                } else {
                    this.logger.warn('ルートマーカーが存在しません');
                }
            }

            // スポットの標高取得
            if (fetchSpots) {
                this.showMessage('スポットの標高を取得中...');

                if (this.routeSpotHandler && this.routeSpotHandler.spotMarkers) {
                    const result = await this.elevationFetcher.fetchAndSetSpotMarkersElevation(
                        this.routeSpotHandler.spotMarkers,
                        (current, total) => {
                            // 進捗表示
                            this.updateElevationProgress('spot', current, total);
                        }
                    );

                    totalFetched += result.fetched;
                    totalFailed += result.failed;

                    this.logger.info('スポットの標高取得完了', result);
                } else {
                    this.logger.warn('スポットマーカーが存在しません');
                }
            }

            // 標高カウントを更新
            await this.updateElevationCounts();

            // 成功メッセージ表示
            this.showMessage(`標高取得完了:\n成功: ${totalFetched}件\n失敗: ${totalFailed}件`);

            this.logger.info('標高取得処理完了', { fetched: totalFetched, failed: totalFailed });

        } catch (error) {
            this.logger.error('標高取得エラー', error);
            errorHandler.handle(error, error.message, '標高取得');
        }
    }

    updateElevationProgress(type, current, total) {
        const fieldId = type === 'route' ? 'elevationRouteCount' : 'elevationSpotCount';
        const field = document.getElementById(fieldId);

        if (field) {
            const remaining = total - current;
            field.value = `${remaining}`;
        }
    }

    async updateElevationCounts() {
        try {
            // メモリ上のマーカーから標高統計を計算
            const stats = {
                routes: { missing: 0, total: 0 },
                spots: { missing: 0, total: 0 }
            };

            // ルートマーカーのカウント
            if (this.routeSpotHandler && this.routeSpotHandler.routeMarkers) {
                stats.routes.total = this.routeSpotHandler.routeMarkers.length;
                for (const marker of this.routeSpotHandler.routeMarkers) {
                    const meta = marker.__meta;
                    if (!meta || meta.elevation === undefined || meta.elevation === null) {
                        stats.routes.missing++;
                    }
                }
            }

            // スポットマーカーのカウント
            if (this.routeSpotHandler && this.routeSpotHandler.spotMarkers) {
                const latestSpots = this.getLatestSpots(this.routeSpotHandler.spotMarkers);
                stats.spots.total = latestSpots.length;
                for (const marker of latestSpots) {
                    const meta = marker.__meta;
                    if (!meta || meta.elevation === undefined || meta.elevation === null) {
                        stats.spots.missing++;
                    }
                }
            }

            // ルート中間点のカウント更新（未取得件数のみ表示）
            const routeCountField = document.getElementById('elevationRouteCount');
            if (routeCountField) {
                routeCountField.value = `${stats.routes.missing}`;
            }

            // スポットのカウント更新（未取得件数のみ表示）
            const spotCountField = document.getElementById('elevationSpotCount');
            if (spotCountField) {
                spotCountField.value = `${stats.spots.missing}`;
            }

            this.logger.info('標高カウント更新', stats);

        } catch (error) {
            this.logger.error('標高カウント更新エラー', error);
        }
    }

    async handleExportGeoJson() {
        try {
            this.logger.info('GeoJSON出力処理開始');

            // ジオリファレンス済みデータをGeoJSON形式で出力
            if (!this.georeferencing) {
                throw new Error('ジオリファレンス機能が初期化されていません。');
            }

            // ジオリファレンス済みデータを収集
            const geoJsonData = await this.collectGeoreferencedData();
            
            if (!geoJsonData.features || geoJsonData.features.length === 0) {
                throw new Error('出力対象のデータがありません。ジオリファレンスを実行してください。');
            }
            
            // ファイルとして保存
            const geoJsonFileName = this.getGeoJsonFileName();
            const result = await this.fileHandler.saveDataWithUserChoice(geoJsonData, geoJsonFileName);
            
            if (result.success) {
                this.logger.info(`GeoJSON保存成功: ${result.filename}`);

                // 成功メッセージを表示
                this.showMessage(`GPSデータをGeoJSON形式にて出力しました:\n${result.filename}`);
            } else if (result.error !== 'キャンセル') {
                throw new Error(result.error);
            }

            this.logger.info(`GeoJSON出力完了: ${geoJsonData.features.length}件`);
            
        } catch (error) {
            this.logger.error('GeoJSON出力エラー', error);
            errorHandler.handle(error, error.message, 'GeoJSON出力');
        }
    }

    async collectGpsDataForFirebase() {
        try {
            const gpsPoints = [];
            const gpsRoutes = [];
            const gpsSpots = [];

            // 1. ポイントGPS（Excelから読み込まれたGPSデータ）を収集
            if (this.gpsData && this.georeferencing) {
                const matchResult = this.georeferencing.matchPointJsonWithGPS(this.gpsData.getPoints());

                for (const pair of matchResult.matchedPairs) {
                    const elevation = pair.gpsPoint.elevation && pair.gpsPoint.elevation > 0 ? pair.gpsPoint.elevation : null;

                    gpsPoints.push({
                        id: pair.gpsPoint.pointId,
                        name: pair.gpsPoint.name || pair.gpsPoint.location || '',
                        coordinates: [
                            this.roundCoordinate(pair.gpsPoint.lng),
                            this.roundCoordinate(pair.gpsPoint.lat),
                            elevation
                        ],
                        source: 'GPS_Excel',
                        description: pair.gpsPoint.description || '緊急ポイント（Excel管理GPS値）'
                    });
                }
            }

            // 2. ルート中間点（ジオリファレンス変換済み）を収集
            if (this.routeSpotHandler && this.routeSpotHandler.routeMarkers) {
                this.logger.info(`🔍 ルートマーカー数: ${this.routeSpotHandler.routeMarkers.length}`);
                const routeGroupMap = new Map();

                for (const marker of this.routeSpotHandler.routeMarkers) {
                    const meta = marker.__meta;
                    this.logger.info(`🔍 ルートマーカー meta.origin: ${meta?.origin}, meta.routeId: ${meta?.routeId}`);
                    // ジオリファレンス後のマーカーは origin='firebase' または 'image' のどちらもあり得る
                    if (meta && (meta.origin === 'image' || meta.origin === 'firebase')) {
                        const routeId = meta.routeId || 'unknown_route';

                        if (!routeGroupMap.has(routeId)) {
                            routeGroupMap.set(routeId, []);
                        }
                        routeGroupMap.get(routeId).push(marker);
                    }
                }
                this.logger.info(`🔍 ルートグループ数: ${routeGroupMap.size}`);

                // 各ルートグループごとに処理
                for (const [routeId, markers] of routeGroupMap) {
                    let startPoint = 'unknown_start';
                    let endPoint = 'unknown_end';

                    if (this.routeSpotHandler.routeData) {
                        const routeData = this.routeSpotHandler.routeData.find(route =>
                            (route.routeId === routeId) ||
                            (route.name === routeId) ||
                            (route.fileName && route.fileName.replace('.json', '') === routeId)
                        );

                        if (routeData) {
                            startPoint = (routeData.startPoint && routeData.startPoint.id) ||
                                        (routeData.routeInfo && routeData.routeInfo.startPoint) ||
                                        'unknown_start';
                            endPoint = (routeData.endPoint && routeData.endPoint.id) ||
                                      (routeData.routeInfo && routeData.routeInfo.endPoint) ||
                                      'unknown_end';
                        }
                    }

                    const waypoints = markers.map(marker => {
                        const latLng = marker.getLatLng();
                        const meta = marker.__meta;
                        // マーカーに設定された標高値を取得（標高取得ボタンで設定）
                        const elevation = (meta && meta.elevation !== undefined) ? meta.elevation : null;

                        return {
                            coordinates: [
                                this.roundCoordinate(latLng.lng),
                                this.roundCoordinate(latLng.lat),
                                elevation
                            ]
                        };
                    });

                    gpsRoutes.push({
                        routeName: `${startPoint} → ${endPoint}`,
                        startPoint: startPoint,
                        endPoint: endPoint,
                        waypoints: waypoints,
                        description: 'ルート中間点（画像変換）'
                    });
                }
            }

            // 3. スポット（ジオリファレンス変換済み）を収集
            if (this.routeSpotHandler && this.routeSpotHandler.spotMarkers) {
                this.logger.info(`🔍 スポットマーカー数: ${this.routeSpotHandler.spotMarkers.length}`);
                const latestSpots = this.getLatestSpots(this.routeSpotHandler.spotMarkers);
                this.logger.info(`🔍 最新スポット数: ${latestSpots.length}`);

                for (const marker of latestSpots) {
                    const meta = marker.__meta;
                    this.logger.info(`🔍 スポットマーカー meta.origin: ${meta?.origin}, meta.spotId: ${meta?.spotId}`);
                    // ジオリファレンス後のマーカーは origin='firebase' または 'image' のどちらもあり得る
                    if (meta && (meta.origin === 'image' || meta.origin === 'firebase')) {
                        const latLng = marker.getLatLng();
                        const spotName = meta.spotId || `spot_${Date.now()}`;
                        // マーカーに設定された標高値を取得（標高取得ボタンで設定）
                        const elevation = (meta && meta.elevation !== undefined) ? meta.elevation : null;

                        gpsSpots.push({
                            name: spotName,
                            coordinates: [
                                this.roundCoordinate(latLng.lng),
                                this.roundCoordinate(latLng.lat),
                                elevation
                            ],
                            category: '',
                            description: 'スポット（画像変換）'
                        });
                    }
                }
                this.logger.info(`🔍 収集したスポット数: ${gpsSpots.length}`);
            }

            this.logger.info(`📊 収集結果: ポイント=${gpsPoints.length}, ルート=${gpsRoutes.length}, スポット=${gpsSpots.length}`);

            return {
                gpsPoints,
                gpsRoutes,
                gpsSpots
            };

        } catch (error) {
            this.logger.error('GPS変換済みデータ収集エラー', error);
            throw new Error('GPS変換済みデータの収集に失敗しました。');
        }
    }

    async collectGeoreferencedData() {
        try {
            const features = [];

            // 1. ポイントGPS（Excelから読み込まれたGPSデータ）を収集
            if (this.gpsData && this.georeferencing) {
                const matchResult = this.georeferencing.matchPointJsonWithGPS(this.gpsData.getPoints());

                for (const pair of matchResult.matchedPairs) {
                    const elevation = pair.gpsPoint.elevation;

                    // 標高が正の値でない場合は標高を除外
                    let coordinates;
                    if (elevation && elevation > 0) {
                        coordinates = [this.roundCoordinate(pair.gpsPoint.lng), this.roundCoordinate(pair.gpsPoint.lat), elevation];
                    } else {
                        coordinates = [this.roundCoordinate(pair.gpsPoint.lng), this.roundCoordinate(pair.gpsPoint.lat)];
                    }

                    features.push({
                        type: 'Feature',
                        properties: {
                            id: pair.gpsPoint.pointId,
                            name: pair.gpsPoint.name || pair.gpsPoint.location,
                            type: 'ポイントGPS',
                            source: 'GPS_Excel',
                            description: '緊急ポイント（Excel管理GPS値）',
                            notes: ''
                        },
                        geometry: {
                            type: 'Point',
                            coordinates: coordinates
                        }
                    });
                }
            }

            // 2. ルート中間点（ジオリファレンス変換済み）を収集
            if (this.routeSpotHandler && this.routeSpotHandler.routeMarkers) {
                // ルートデータから開始・終了ポイント情報を取得
                const routeGroupMap = new Map();

                for (const marker of this.routeSpotHandler.routeMarkers) {
                    const meta = marker.__meta;
                    if (meta && meta.origin === 'image') {
                        const routeId = meta.routeId || 'unknown_route';

                        if (!routeGroupMap.has(routeId)) {
                            routeGroupMap.set(routeId, []);
                        }
                        routeGroupMap.get(routeId).push(marker);
                    }
                }

                // 各ルートグループごとに処理
                for (const [routeId, markers] of routeGroupMap) {
                    // ルートデータから開始・終了ポイント情報を検索
                    let startPoint = 'unknown_start';
                    let endPoint = 'unknown_end';

                    if (this.routeSpotHandler.routeData) {
                        const routeData = this.routeSpotHandler.routeData.find(route =>
                            (route.routeId === routeId) ||
                            (route.name === routeId) ||
                            (route.fileName && route.fileName.replace('.json', '') === routeId)
                        );

                        if (routeData) {
                            startPoint = (routeData.startPoint && routeData.startPoint.id) ||
                                        (routeData.routeInfo && routeData.routeInfo.startPoint) ||
                                        'unknown_start';
                            endPoint = (routeData.endPoint && routeData.endPoint.id) ||
                                      (routeData.routeInfo && routeData.routeInfo.endPoint) ||
                                      'unknown_end';
                        }
                    }

                    const fullRouteId = `route_${startPoint}_to_${endPoint}`;

                    // マーカーを順番に処理
                    markers.forEach((marker, index) => {
                        const latLng = marker.getLatLng();
                        const waypointName = `waypoint_${String(index + 1).padStart(2, '0')}`;

                        features.push({
                            type: 'Feature',
                            properties: {
                                id: `${fullRouteId}_${waypointName}`,
                                name: waypointName,
                                type: 'route_waypoint',
                                source: 'image_transformed',
                                route_id: fullRouteId,
                                description: 'ルート中間点'
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: [this.roundCoordinate(latLng.lng), this.roundCoordinate(latLng.lat)]
                            }
                        });
                    });
                }
            }

            // 3. スポット（ジオリファレンス変換済み）を収集
            if (this.routeSpotHandler && this.routeSpotHandler.spotMarkers) {
                const latestSpots = this.getLatestSpots(this.routeSpotHandler.spotMarkers);
                let spotCounter = 1;

                for (const marker of latestSpots) {
                    const meta = marker.__meta;
                    if (meta && meta.origin === 'image') {
                        const latLng = marker.getLatLng();
                        const spotName = meta.spotId || `spot${String(spotCounter).padStart(2, '0')}`;

                        features.push({
                            type: 'Feature',
                            properties: {
                                id: `spot${String(spotCounter).padStart(2, '0')}_${spotName}`,
                                name: spotName,
                                type: 'spot',
                                source: 'image_transformed',
                                description: 'スポット'
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: [this.roundCoordinate(latLng.lng), this.roundCoordinate(latLng.lat)]
                            }
                        });
                        spotCounter++;
                    }
                }
            }

            return {
                type: 'FeatureCollection',
                features: features
            };

        } catch (error) {
            this.logger.error('ジオリファレンス済みデータ収集エラー', error);
            throw new Error('ジオリファレンス済みデータの収集に失敗しました。');
        }
    }

    /**
     * GeoJSONファイル名を生成
     * @returns {string} GeoJSONファイル名
     */
    getGeoJsonFileName() {
        if (this.currentPngFileName) {
            return `${this.currentPngFileName}-GPS`;
        }
        // PNG画像が読み込まれていない場合はデフォルト名を使用
        return this.fileHandler.getDefaultDataFileName();
    }

    /**
     * 座標を小数点5桁に丸める
     * @param {number} coordinate - 座標値
     * @returns {number} 小数点5桁に丸められた座標値
     */
    roundCoordinate(coordinate) {
        return Math.round(coordinate * 100000) / 100000;
    }

    /**
     * スポットマーカーから最新の分のみを取得
     * @param {Array} spotMarkers - 全スポットマーカー
     * @returns {Array} 最新の分のスポットマーカー
     */
    getLatestSpots(spotMarkers) {
        if (!spotMarkers || spotMarkers.length === 0) {
            return [];
        }

        // スポットIDごとにグループ化し、最新のタイムスタンプのみを保持
        const latestSpotsMap = new Map();

        for (const marker of spotMarkers) {
            const meta = marker.__meta;
            if (meta && meta.spotId) {
                const spotId = meta.spotId;
                const timestamp = meta.timestamp || 0; // タイムスタンプがない場合は0

                if (!latestSpotsMap.has(spotId) || timestamp > latestSpotsMap.get(spotId).__meta.timestamp) {
                    latestSpotsMap.set(spotId, marker);
                }
            }
        }

        return Array.from(latestSpotsMap.values());
    }

    /**
     * 標高統計を取得
     * @returns {Object} {routes: {missing, total}, spots: {missing, total}}
     */
    getElevationStats() {
        const stats = {
            routes: { missing: 0, total: 0 },
            spots: { missing: 0, total: 0 }
        };

        // ルートマーカーのカウント
        if (this.routeSpotHandler?.routeMarkers) {
            stats.routes.total = this.routeSpotHandler.routeMarkers.length;
            for (const marker of this.routeSpotHandler.routeMarkers) {
                const meta = marker.__meta;
                if (!meta || meta.elevation === undefined || meta.elevation === null) {
                    stats.routes.missing++;
                }
            }
        }

        // スポットマーカーのカウント
        if (this.routeSpotHandler?.spotMarkers) {
            const latestSpots = this.getLatestSpots(this.routeSpotHandler.spotMarkers);
            stats.spots.total = latestSpots.length;
            for (const marker of latestSpots) {
                const meta = marker.__meta;
                if (!meta || meta.elevation === undefined || meta.elevation === null) {
                    stats.spots.missing++;
                }
            }
        }

        return stats;
    }

    /**
     * ファイルのディレクトリを記録する（File System Access API使用時）
     * @param {File} file - 読み込んだファイル
     */
    async recordFileDirectory(file) {
        try {
            // File System Access APIがサポートされているかチェック
            if (this.fileHandler && this.fileHandler.isFileSystemAccessSupported() && file.webkitRelativePath) {
                // ファイルハンドルが利用可能な場合のみ処理
                // 注意: 通常のファイル入力ではFile System Access APIを使用できない
                // ここではフォールバックとしてファイル名を記録
                this.fileHandler.currentFileName = file.name;
            }
        } catch (error) {
            // ディレクトリ記録はオプショナルなのでエラーを無視
        }
    }

    /**
     * メッセージを画面上部に3秒間表示する
     * @param {string} message - 表示するメッセージ
     * @param {string} type - メッセージの種類 ('info', 'warning', 'error')
     */
    showMessage(message, type = 'info') {
        const messageArea = document.getElementById('messageArea');
        if (!messageArea) return;

        messageArea.textContent = message;

        // タイプに応じてクラスを設定
        let className = 'message-area';
        let displayDuration = CONFIG.MESSAGE_DISPLAY_DURATION;

        switch (type) {
            case 'warning':
                className += ' message-warning';
                displayDuration = CONFIG.MESSAGE_DISPLAY_DURATION * 1.5; // 警告は少し長く表示
                break;
            case 'error':
                className += ' message-error';
                displayDuration = CONFIG.MESSAGE_DISPLAY_DURATION * 2; // エラーは更に長く表示
                break;
            default:
                className += ' message-info';
                break;
        }

        messageArea.className = className;
        messageArea.style.display = 'block';

        setTimeout(() => {
            messageArea.style.display = 'none';
        }, displayDuration);
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const app = new GeoReferencerApp();
        await app.init();
        
        // グローバルスコープでデバッグ用にアクセス可能にする
        window.geoApp = app;
        
    } catch (error) {
        
        // エラーをユーザーにも表示
        document.body.innerHTML = `
            <div style="padding: 20px; color: red; font-family: monospace;">
                <h2>アプリケーション起動エラー</h2>
                <p>エラー: ${error.message}</p>
                <details>
                    <summary>詳細情報</summary>
                    <pre>${error.stack}</pre>
                </details>
                <p>ローカルサーバーが起動していることを確認してください。</p>
                <p>例: <code>python -m http.server 8000</code></p>
            </div>
        `;
    }
});
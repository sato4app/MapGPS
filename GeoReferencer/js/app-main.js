// GeoReferencerメインアプリケーションファイル - リファクタリング版
import { MapCore } from './map-core.js';
import { ImageOverlay } from './image-overlay.js';
import { GPSData } from './gps-data.js';
import { Georeferencing } from './georeferencing.js';
import { RouteSpotHandler } from './route-spot-handler.js';
import { CoordinateDisplay } from './coordinate-display.js';
import { UIHandlers } from './ui-handlers.js';
import { FileHandler } from './file-handler.js';
import { CONFIG, EVENTS, DEFAULTS } from './constants.js';
import { Logger, errorHandler } from './utils.js';

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
        
        this.logger.info('GeoReferencerApp初期化開始');
    }

    async init() {
        try {
            this.logger.info('アプリケーション初期化開始');
            
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
            // 統合された読み込みボタン
            const loadFileBtn = document.getElementById('loadFileBtn');
            const gpsExcelInput = document.getElementById('gpsExcelInput');
            const imageInput = document.getElementById('imageInput');
            const pointCoordJsonInput = document.getElementById('pointCoordJsonInput');
            
            if (loadFileBtn) {
                loadFileBtn.addEventListener('click', () => {
                    const selectedFileType = document.querySelector('input[name="fileType"]:checked')?.value;
                    
                    switch (selectedFileType) {
                        case 'gpsGeoJson':
                            if (gpsExcelInput) gpsExcelInput.click();
                            break;
                        case 'image':
                            if (imageInput) imageInput.click();
                            break;
                        case 'pointCoord':
                            if (pointCoordJsonInput) pointCoordJsonInput.click();
                            break;
                        default:
                            this.logger.warn('ファイル種類が選択されていません');
                    }
                });
            }

            // ファイル入力の変更イベント
            if (gpsExcelInput) {
                gpsExcelInput.addEventListener('change', (event) => {
                    this.handleGpsExcelLoad(event);
                    // ファイルハンドラーにディレクトリを記録
                    this.recordFileDirectory(event.target.files[0]);
                });
            }
            
            if (imageInput) {
                imageInput.addEventListener('change', (event) => {
                    this.handleImageLoad(event);
                    // ファイルハンドラーにディレクトリを記録
                    this.recordFileDirectory(event.target.files[0]);
                });
            }
            
            if (pointCoordJsonInput) {
                pointCoordJsonInput.addEventListener('change', (event) => {
                    this.handlePointCoordJsonLoad(event);
                });
            }

            // ルート・スポット読み込みボタン
            const loadRouteSpotBtn = document.getElementById('loadRouteSpotBtn');
            const routeSpotJsonInput = document.getElementById('routeSpotJsonInput');
            
            if (loadRouteSpotBtn) {
                loadRouteSpotBtn.addEventListener('click', () => {
                    if (routeSpotJsonInput) {
                        routeSpotJsonInput.click();
                    } else {
                        this.logger.warn('ファイル入力要素が見つかりません');
                    }
                });
            }
            
            if (routeSpotJsonInput) {
                routeSpotJsonInput.addEventListener('change', (event) => {
                    this.handleRouteSpotJsonLoad(event);
                });
            }

            // 読み込みJSONボタン
            const loadJsonBtn = document.getElementById('loadJsonBtn');
            const multiJsonInput = document.getElementById('multiJsonInput');
            
            if (loadJsonBtn) {
                loadJsonBtn.addEventListener('click', () => {
                    if (multiJsonInput) {
                        multiJsonInput.click();
                    } else {
                        this.logger.warn('複数JSONファイル入力要素が見つかりません');
                    }
                });
            }
            
            if (multiJsonInput) {
                multiJsonInput.addEventListener('change', (event) => {
                    this.handleMultiJsonLoad(event);
                    // ファイルハンドラーにディレクトリを記録
                    if (event.target.files.length > 0) {
                        this.recordFileDirectory(event.target.files[0]);
                    }
                });
            }

            // 画像の重ね合わせボタン
            const matchPointsBtn = document.getElementById('matchPointsBtn');
            if (matchPointsBtn) {
                matchPointsBtn.addEventListener('click', () => {
                    this.handleMatchPoints();
                });
            }

            // GeoJSON出力ボタン
            const exportGeoJsonBtn = document.getElementById('exportGeoJsonBtn');
            if (exportGeoJsonBtn) {
                exportGeoJsonBtn.addEventListener('click', () => {
                    this.handleExportGeoJson();
                });
            }

            
        } catch (error) {
            this.logger.error('イベントハンドラー設定エラー', error);
            errorHandler.handle(error, 'イベントハンドラーの設定中にエラーが発生しました。', 'イベントハンドラー設定');
        }
    }

    async handleGpsExcelLoad(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            this.logger.info('GPS Excelファイル読み込み開始', file.name);
            
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
        }
    }

    async handleImageLoad(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;


            // PNGファイル名を記録（拡張子を除去）
            this.currentPngFileName = file.name.replace(/\.[^/.]+$/, '');
            this.logger.info('PNGファイル:', this.currentPngFileName);

            if (this.imageOverlay) {
                await this.imageOverlay.loadImage(file);

                // 成功メッセージを表示
                this.showMessage(`PNG画像ファイルを読み込みました:\n${file.name}`);
            }

        } catch (error) {
            this.logger.error('画像読み込みエラー', error);
            errorHandler.handle(error, '画像ファイルの読み込みに失敗しました。', '画像読み込み');
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

            this.logger.info('画像重ね合わせ処理完了', result);

            // 成功メッセージを表示
            this.showMessage(`${result.matchedCount}個のポイントにてジオリファレンスを行いました`);
            
        } catch (error) {
            this.logger.error('画像重ね合わせエラー', error);
            errorHandler.handle(error, error.message, '画像重ね合わせ');
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
            const result = await this.fileHandler.saveGeoJsonWithUserChoice(geoJsonData, geoJsonFileName);
            
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
        return this.fileHandler.getDefaultGeoJsonFileName();
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
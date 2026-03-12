// GeoReferencerメインアプリケーションファイル - リファクタリング版
import { MapCore } from './map-core.js';
import { ImageOverlay } from './image-overlay.js';
import { GPSData } from './gps-data.js';
import { Georeferencing } from './georeferencing.js';
import { RouteSpotHandler } from './route-spot-handler.js';
import { AreaHandler } from './area-handler.js';
import { CoordinateDisplay } from './coordinate-display.js';
import { UIHandlers } from './ui-handlers.js';
import { FileHandler } from './file-handler.js';
import { DataImporter } from './data-importer.js';
import { CONFIG, DEFAULTS } from './constants.js';
import { Logger, errorHandler } from './utils.js';

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
        this.areaHandler = null;
        this.coordinateDisplay = null;
        this.uiHandlers = null;
        this.fileHandler = null;
        this.pointJsonData = null;
        this.imageCoordinateMarkers = [];

        // PNG画像ファイル名を記録
        this.currentPngFileName = null;

        // 標高取得
        this.elevationFetcher = null;

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
            this.areaHandler = new AreaHandler(this.mapCore, this.imageOverlay);
            this.coordinateDisplay = new CoordinateDisplay(this.mapCore, this.imageOverlay);
            this.uiHandlers = new UIHandlers();
            this.fileHandler = new FileHandler();
            this.dataImporter = new DataImporter(this);
            this.elevationFetcher = new ElevationFetcher();

            // CoordinateDisplayインスタンスをGeoreferencingに注入
            this.georeferencing.setCoordinateDisplay(this.coordinateDisplay);

            // RouteSpotHandlerインスタンスをGeoreferencingに注入
            this.georeferencing.setRouteSpotHandler(this.routeSpotHandler);

            // AreaHandlerインスタンスをGeoreferencingに注入
            this.georeferencing.setAreaHandler(this.areaHandler);


        } catch (error) {
            this.logger.error('モジュール初期化エラー', error);
            throw error;
        }
    }

    setupEventHandlers() {
        try {
            // 読み込みボタン（汎用）
            const loadFileBtn = document.getElementById('loadFileBtn');
            const gpsExcelInput = document.getElementById('gpsExcelInput');
            const imageInput = document.getElementById('imageInput');
            const jsonInput = document.getElementById('jsonInput');

            if (loadFileBtn) {
                loadFileBtn.addEventListener('click', () => {
                    // ラジオボタンの選択状態を取得
                    const selectedRadio = document.querySelector('input[name="loadType"]:checked');
                    if (!selectedRadio) return;

                    const loadType = selectedRadio.value;
                    if (loadType === 'gps' && gpsExcelInput) {
                        gpsExcelInput.click();
                    } else if (loadType === 'png' && imageInput) {
                        imageInput.click();
                    } else if (loadType === 'json' && jsonInput) {
                        if (!this.currentPngFileName) {
                            alert('対応するPNG画像が読み込まれていません。\nJSONファイルを読み込むには、先に画像を読み込んでください。');
                            return;
                        }
                        jsonInput.click();
                    }
                });
            }

            // GPS Excelファイル入力
            if (gpsExcelInput) {
                gpsExcelInput.addEventListener('change', (event) => {
                    this.dataImporter.handleGpsExcelLoad(event);
                    this.fileHandler.recordFileDirectory(event.target.files[0]);
                });
            }

            // PNG画像ファイル入力
            if (imageInput) {
                imageInput.addEventListener('change', (event) => {
                    this.dataImporter.handlePngLoad(event);
                    this.fileHandler.recordFileDirectory(event.target.files[0]);
                });
            }

            // JSONファイル入力 (New)
            if (jsonInput) {
                jsonInput.addEventListener('change', (event) => {
                    this.dataImporter.handleJsonLoad(event); // 既存の汎用JSON読み込みを使用
                    // ファイル名は特に表示しない? 必要なら追加
                    this.fileHandler.recordFileDirectory(event.target.files[0]);
                });
            }

            // 画像の重ね合わせボタン
            const matchPointsBtn = document.getElementById('matchPointsBtn');
            if (matchPointsBtn) {
                matchPointsBtn.addEventListener('click', () => {
                    this.handleMatchPoints();
                });
            }

            // GeoJSON保存ボタン (旧Firebase保存)
            const saveGeoJsonBtn = document.getElementById('saveGeoJsonBtn');
            if (saveGeoJsonBtn) {
                saveGeoJsonBtn.addEventListener('click', () => {
                    this.handleExportGeoJson();
                });
            }

            // 標高取得ボタン
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



    async handleMatchPoints() {
        try {
            this.logger.info('画像重ね合わせ処理開始');

            // 1. 画像ファイルの読み込みと準備チェック
            if (!this.imageOverlay || !this.imageOverlay.currentImage || !this.imageOverlay.currentImage.src) {
                throw new Error('PNG画像が読み込まれていません。');
            }

            if (!this.gpsData || !this.gpsData.getPoints() || this.gpsData.getPoints().length === 0) {
                // GPSデータがなくても実行できるようにする？
                // プロンプトでは「ラジオボタン「JSONファイル」を選択して...PNG画像上に配置して」とある。
                // ジオリファレンスにはGPSデータ（コントロールポイント）が必要。
                // もし「JSONファイル」がコントロールポイントを含むならOKだが...
                // ここでは既存のチェックを維持するが、GPSデータ必須のエラーが出るかもしれない。
                // しかし、正規のフローでは「ポイントGPS」を読み込んでから実行するはず。
                if (!this.pointJsonData && (!this.gpsData.getPoints() || this.gpsData.getPoints().length === 0)) {
                    throw new Error('GPS座標データまたはポイントJSONデータが読み込まれていません。');
                }
            }

            // 2. 初期表示境界の設定

            // 3-10. Georeferencingクラスに処理を委譲
            await this.georeferencing.executeGeoreferencing();
            this.georeferencing.setupGeoreferencingUI();
            const result = await this.georeferencing.performGeoreferencingCalculations();

            // 結果を表示
            this.uiHandlers.updateMatchResults(result);

            // GeoJSON保存ボタンと標高取得ボタンを有効化
            const saveGeoJsonBtn = document.getElementById('saveGeoJsonBtn');
            const saveGeoJsonNote = document.getElementById('saveGeoJsonNote');
            if (saveGeoJsonBtn) {
                saveGeoJsonBtn.disabled = false;
                if (saveGeoJsonNote) {
                    saveGeoJsonNote.style.display = 'block';
                }
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
            this.updateElevationCounts();

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
            const geoJsonFileName = this.getGeoJsonFileName(geoJsonData);
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

    /**
     * 国土地理院APIから標高データを取得（Firebase依存なし）
     */
    async handleFetchElevation() {
        if (!this.elevationFetcher) {
            this.showMessage('標高取得機能が初期化されていません。', 'error');
            return;
        }

        const fetchElevationBtn = document.getElementById('fetchElevationBtn');
        if (fetchElevationBtn) fetchElevationBtn.disabled = true;

        try {
            this.logger.info('標高データ取得開始');
            this.showMessage('標高データの取得を開始します...');

            const progressContainer = document.getElementById('elevationProgressContainer');
            const progressBar = document.getElementById('elevationProgressBar');
            const progressText = document.getElementById('elevationProgressText');

            // チェックボックスの状態を取得
            const isPointChecked = document.getElementById('elevationPointCheckbox')?.checked;
            const isRouteChecked = document.getElementById('elevationRouteCheckbox')?.checked;
            const isSpotChecked = document.getElementById('elevationSpotCheckbox')?.checked;
            const isAreaChecked = document.getElementById('elevationAreaVertexCheckbox')?.checked;


            if (progressContainer) progressContainer.style.display = 'block';

            let totalFetched = 0;
            let totalFailed = 0;

            // 進捗更新用ヘルパー
            const updateProgress = (current, total, prefix) => {
                if (progressBar) {
                    const params = new URLSearchParams(window.location.search);
                    const isDebug = params.has('debug');
                    if (isDebug) console.log(`${prefix}: ${current}/${total}`);

                    // 全体の進捗は個別の処理で管理が難しいため、ここでは簡易的な表示に留めるか、
                    // あるいは各フェーズごとにバーをリセットして表示する
                    const percentage = Math.round((current / total) * 100);
                    progressBar.style.width = `${percentage}%`;
                    progressBar.textContent = `${percentage}%`;
                }
                if (progressText) {
                    progressText.textContent = `${prefix}の標高を取得中: ${current} / ${total}`;
                }
            };

            // 1. ポイント（画像上のポイント）
            if (isPointChecked && this.routeSpotHandler && this.routeSpotHandler.pointData && this.georeferencing) {
                this.logger.info('ポイントの標高取得開始');
                const result = await this.elevationFetcher.fetchAndSetPointsElevation(
                    this.routeSpotHandler.pointData,
                    this.georeferencing,
                    (c, t) => { updateProgress(c, t, 'ポイント'); this.updateElevationCounts(); }
                );
                totalFetched += result.fetched;
                totalFailed += result.failed;
            }

            // 2. ルートマーカー（中間点含む）
            if (isRouteChecked && this.routeSpotHandler && this.routeSpotHandler.routeMarkers) {
                this.logger.info('ルートマーカーの標高取得開始');
                const result = await this.elevationFetcher.fetchAndSetRouteMarkersElevation(
                    this.routeSpotHandler.routeMarkers,
                    (c, t) => { updateProgress(c, t, 'ルート中間点'); this.updateElevationCounts(); }
                );
                totalFetched += result.fetched;
                totalFailed += result.failed;
            }

            // 3. スポットマーカー
            if (isSpotChecked && this.routeSpotHandler && this.routeSpotHandler.spotMarkers) {
                this.logger.info('スポットマーカーの標高取得開始');
                const result = await this.elevationFetcher.fetchAndSetSpotMarkersElevation(
                    this.routeSpotHandler.spotMarkers,
                    (c, t) => { updateProgress(c, t, 'スポット'); this.updateElevationCounts(); }
                );
                totalFetched += result.fetched;
                totalFailed += result.failed;
            }

            // 4. Combined JSON形式の座標マーカー（imageCoordinateMarkersにwaypoint/spot/pointJSONが入っている場合）
            if (this.imageCoordinateMarkers && this.imageCoordinateMarkers.length > 0) {
                const waypointInfos = this.imageCoordinateMarkers.filter(m => m.data?.type === 'waypoint');
                const spotInfos = this.imageCoordinateMarkers.filter(m => m.data?.type === 'spot');
                const pointInfos = this.imageCoordinateMarkers.filter(m => m.data?.type === 'pointJSON');

                // 4a. ポイント（pointJSON型）
                if (isPointChecked && pointInfos.length > 0 && this.routeSpotHandler.pointData.length === 0) {
                    this.logger.info(`Combined ポイントの標高取得開始: ${pointInfos.length}件`);
                    let cnt = 0;
                    for (const markerInfo of pointInfos) {
                        if (markerInfo.data.elevation !== undefined && markerInfo.data.elevation !== null) {
                            cnt++;
                            updateProgress(cnt, pointInfos.length, 'ポイント');
                            continue;
                        }
                        const latLng = markerInfo.marker.getLatLng();
                        const elevation = await this.elevationFetcher.fetchElevation(latLng.lng, latLng.lat);
                        if (elevation !== null) {
                            markerInfo.data.elevation = elevation;
                            totalFetched++;
                        } else {
                            totalFailed++;
                        }
                        cnt++;
                        updateProgress(cnt, pointInfos.length, 'ポイント');
                        this.updateElevationCounts();
                        await this.elevationFetcher.delay(this.elevationFetcher.DELAY_MS);
                    }
                }

                // 4b. ルート中間点
                if (isRouteChecked && waypointInfos.length > 0 && this.routeSpotHandler.routeMarkers.length === 0) {
                    this.logger.info(`Combined ルート中間点の標高取得開始: ${waypointInfos.length}件`);
                    let cnt = 0;
                    for (const markerInfo of waypointInfos) {
                        if (markerInfo.data.elevation !== undefined && markerInfo.data.elevation !== null) {
                            cnt++;
                            updateProgress(cnt, waypointInfos.length, 'ルート中間点');
                            continue;
                        }
                        const latLng = markerInfo.marker.getLatLng();
                        const elevation = await this.elevationFetcher.fetchElevation(latLng.lng, latLng.lat);
                        if (elevation !== null) {
                            markerInfo.data.elevation = elevation;
                            totalFetched++;
                        } else {
                            totalFailed++;
                        }
                        cnt++;
                        updateProgress(cnt, waypointInfos.length, 'ルート中間点');
                        this.updateElevationCounts();
                        await this.elevationFetcher.delay(this.elevationFetcher.DELAY_MS);
                    }
                }

                // 4c. スポット
                if (isSpotChecked && spotInfos.length > 0 && this.routeSpotHandler.spotMarkers.length === 0) {
                    this.logger.info(`Combined スポットの標高取得開始: ${spotInfos.length}件`);
                    let cnt = 0;
                    for (const markerInfo of spotInfos) {
                        if (markerInfo.data.elevation !== undefined && markerInfo.data.elevation !== null) {
                            cnt++;
                            updateProgress(cnt, spotInfos.length, 'スポット');
                            continue;
                        }
                        const latLng = markerInfo.marker.getLatLng();
                        const elevation = await this.elevationFetcher.fetchElevation(latLng.lng, latLng.lat);
                        if (elevation !== null) {
                            markerInfo.data.elevation = elevation;
                            totalFetched++;
                        } else {
                            totalFailed++;
                        }
                        cnt++;
                        updateProgress(cnt, spotInfos.length, 'スポット');
                        this.updateElevationCounts();
                        await this.elevationFetcher.delay(this.elevationFetcher.DELAY_MS);
                    }
                }
            }

            // 5. エリア頂点
            if (isAreaChecked && this.areaHandler) {
                this.logger.info('エリア頂点の標高取得開始');
                const result = await this.elevationFetcher.fetchAndSetAreaVerticesElevation(
                    this.areaHandler,
                    (c, t) => { updateProgress(c, t, 'エリア'); this.updateElevationCounts(); }
                );
                totalFetched += result.fetched;
                totalFailed += result.failed;
            }

            this.logger.info(`標高取得完了: 成功=${totalFetched}, 失敗=${totalFailed}`);
            this.showMessage(`標高データの取得が完了しました (取得: ${totalFetched}, 失敗: ${totalFailed})`);

            // 統計を更新
            this.updateElevationCounts();

        } catch (error) {
            this.logger.error('標高データ取得エラー', error);
            this.showMessage(`標高データの取得中にエラーが発生しました: ${error.message}`, 'error');
        } finally {
            if (fetchElevationBtn) fetchElevationBtn.disabled = false;
            if (document.getElementById('elevationProgressContainer')) {
                setTimeout(() => {
                    document.getElementById('elevationProgressContainer').style.display = 'none';
                }, 3000);
            }
        }
    }



    async collectGeoreferencedData() {
        try {
            const features = [];

            // 1. ポイント（画像座標をジオリファレンス変換）を収集
            if (this.routeSpotHandler && this.routeSpotHandler.pointData && this.georeferencing && this.georeferencing.currentTransformation) {
                const points = this.routeSpotHandler.pointData;
                for (const point of points) {
                    const pointId = point.Id || point.id || point.pointId;
                    // 画像座標をアフィン変換でGPS座標に変換
                    const transformedLatLng = this.georeferencing.transformImageCoordsToGps(point.x, point.y, this.georeferencing.currentTransformation);

                    if (transformedLatLng) {
                        const lat = Array.isArray(transformedLatLng) ? transformedLatLng[0] : transformedLatLng.lat;
                        const lng = Array.isArray(transformedLatLng) ? transformedLatLng[1] : transformedLatLng.lng;
                        const elevation = point.elevation;

                        let coordinates = [this.roundCoordinate(lng), this.roundCoordinate(lat)];
                        if (elevation !== undefined && elevation !== null) {
                            coordinates.push(this.roundCoordinate(elevation));
                        }

                        features.push({
                            type: 'Feature',
                            properties: {
                                id: pointId,
                                name: point.name || pointId,
                                type: 'point',
                                source: 'image_transformed',
                                description: '画像ポイント（GPS変換済）'
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: coordinates
                            }
                        });
                    }
                }
            }

            // 2. ルート（ジオリファレンス変換済み）を収集
            if (this.routeSpotHandler && this.routeSpotHandler.routeMarkers) {
                // ルートデータから開始・終了ポイント情報を取得
                const routeGroupMap = new Map();

                for (const marker of this.routeSpotHandler.routeMarkers) {
                    const meta = marker.__meta;
                    if (meta && (meta.origin === 'image' || meta.origin === 'firebase')) { // firebase origin means loaded from external
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
                    const lineCoordinates = [];

                    // マーカーを順番に処理
                    markers.forEach((marker, index) => {
                        const latLng = marker.getLatLng();
                        const waypointName = `waypoint_${String(index + 1).padStart(2, '0')}`;
                        const elevation = marker.__meta && marker.__meta.elevation;

                        let coords = [this.roundCoordinate(latLng.lng), this.roundCoordinate(latLng.lat)];
                        if (elevation !== undefined && elevation !== null) {
                            coords.push(this.roundCoordinate(elevation));
                        }
                        lineCoordinates.push(coords);

                        // 中間点もPointとして出力したければここに追加可能だが、LineStringにする
                    });

                    // LineStringとして出力
                    features.push({
                        type: 'Feature',
                        properties: {
                            id: fullRouteId,
                            name: `${startPoint} ～ ${endPoint}`,
                            type: 'route',
                            startPoint: startPoint,
                            endPoint: endPoint,
                            source: 'image_transformed',
                            description: 'ルート（GPS変換済）'
                        },
                        geometry: {
                            type: 'LineString',
                            coordinates: lineCoordinates
                        }
                    });
                }
            }

            // 3. スポット（ジオリファレンス変換済み）を収集
            if (this.routeSpotHandler && this.routeSpotHandler.spotMarkers) {
                const latestSpots = this.getLatestSpots(this.routeSpotHandler.spotMarkers);
                let spotCounter = 1;

                for (const marker of latestSpots) {
                    const meta = marker.__meta;
                    if (meta && (meta.origin === 'image' || meta.origin === 'firebase')) {
                        const latLng = marker.getLatLng();
                        const spotName = meta.spotId || `spot${String(spotCounter).padStart(2, '0')}`;
                        const elevation = meta.elevation;

                        let coords = [this.roundCoordinate(latLng.lng), this.roundCoordinate(latLng.lat)];
                        if (elevation !== undefined && elevation !== null) {
                            coords.push(this.roundCoordinate(elevation));
                        }

                        features.push({
                            type: 'Feature',
                            properties: {
                                id: `spot${String(spotCounter).padStart(2, '0')}_${spotName}`,
                                name: spotName,
                                type: 'spot',
                                source: 'image_transformed',
                                description: 'スポット（GPS変換済）'
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: coords
                            }
                        });
                        spotCounter++;
                    }
                }
            }

            // 4. Combined JSON形式のデータ（imageCoordinateMarkers）を収集
            // （routeSpotHandler の個別形式データが空の場合のみ - 重複回避）
            if (this.imageCoordinateMarkers && this.imageCoordinateMarkers.length > 0) {
                const waypointInfos = this.imageCoordinateMarkers.filter(m => m.data?.type === 'waypoint');
                const spotInfosCombined = this.imageCoordinateMarkers.filter(m => m.data?.type === 'spot');
                const pointInfosCombined = this.imageCoordinateMarkers.filter(m => m.data?.type === 'pointJSON');

                // 4a. ポイント（pointJSON型）
                if (pointInfosCombined.length > 0 && (!this.routeSpotHandler.pointData || this.routeSpotHandler.pointData.length === 0)) {
                    for (const markerInfo of pointInfosCombined) {
                        const latLng = markerInfo.marker.getLatLng();
                        const elevation = markerInfo.data.elevation;
                        let coords = [this.roundCoordinate(latLng.lng), this.roundCoordinate(latLng.lat)];
                        if (elevation !== undefined && elevation !== null) {
                            coords.push(this.roundCoordinate(elevation));
                        }
                        features.push({
                            type: 'Feature',
                            properties: {
                                id: markerInfo.data.id || markerInfo.data.name || 'unknown',
                                name: markerInfo.data.name || markerInfo.data.id || '名称未設定',
                                type: 'point',
                                source: 'image_transformed',
                                description: '画像ポイント（GPS変換済）'
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: coords
                            }
                        });
                    }
                }

                // 4b. ルート中間点（waypoint型）→ ルート名でグループ化してLineStringとして出力
                if (waypointInfos.length > 0 && (!this.routeSpotHandler.routeMarkers || this.routeSpotHandler.routeMarkers.length === 0)) {
                    const routeGroups = new Map();
                    for (const markerInfo of waypointInfos) {
                        const routeName = markerInfo.data.name || 'unknown_route';
                        if (!routeGroups.has(routeName)) {
                            routeGroups.set(routeName, []);
                        }
                        routeGroups.get(routeName).push(markerInfo);
                    }
                    for (const [, markerInfos] of routeGroups) {
                        const lineCoordinates = [];
                        for (const markerInfo of markerInfos) {
                            const latLng = markerInfo.marker.getLatLng();
                            const elevation = markerInfo.data.elevation;
                            let coords = [this.roundCoordinate(latLng.lng), this.roundCoordinate(latLng.lat)];
                            if (elevation !== undefined && elevation !== null) {
                                coords.push(this.roundCoordinate(elevation));
                            }
                            lineCoordinates.push(coords);
                        }
                        if (lineCoordinates.length > 0) {
                            const firstData = markerInfos[0].data;
                            const spStart = firstData.startPoint || 'unknown_start';
                            const spEnd = firstData.endPoint || 'unknown_end';
                            const routeId = `route_${spStart}_to_${spEnd}`;
                            features.push({
                                type: 'Feature',
                                properties: {
                                    id: routeId,
                                    name: `${spStart} ～ ${spEnd}`,
                                    type: 'route',
                                    startPoint: spStart,
                                    endPoint: spEnd,
                                    source: 'image_transformed',
                                    description: 'ルート（GPS変換済）'
                                },
                                geometry: {
                                    type: 'LineString',
                                    coordinates: lineCoordinates
                                }
                            });
                        }
                    }
                }

                // 4c. スポット（spot型）
                if (spotInfosCombined.length > 0 && (!this.routeSpotHandler.spotMarkers || this.routeSpotHandler.spotMarkers.length === 0)) {
                    let spotCounter = 1;
                    for (const markerInfo of spotInfosCombined) {
                        const latLng = markerInfo.marker.getLatLng();
                        const elevation = markerInfo.data.elevation;
                        const spotName = markerInfo.data.name || markerInfo.data.id || `spot${String(spotCounter).padStart(2, '0')}`;
                        let coords = [this.roundCoordinate(latLng.lng), this.roundCoordinate(latLng.lat)];
                        if (elevation !== undefined && elevation !== null) {
                            coords.push(this.roundCoordinate(elevation));
                        }
                        features.push({
                            type: 'Feature',
                            properties: {
                                id: spotName,
                                name: spotName,
                                type: 'spot',
                                source: 'image_transformed',
                                description: 'スポット（GPS変換済）'
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: coords
                            }
                        });
                        spotCounter++;
                    }
                }
            }

            // 5. エリア（ジオリファレンス変換済み）を収集
            if (this.areaHandler && this.georeferencing && this.georeferencing.currentTransformation) {
                const areas = this.areaHandler.getUpToDateAreas();
                for (const area of areas) {
                    const latLngs = this.areaHandler.calculateAreaLatLngs(area);

                    if (latLngs && latLngs.length > 0) {
                        const coordinates = latLngs.map((latLng, index) => {
                            const lat = Array.isArray(latLng) ? latLng[0] : latLng.lat;
                            const lng = Array.isArray(latLng) ? latLng[1] : latLng.lng;
                            const vertex = area.vertices && area.vertices[index];
                            const elevation = vertex ? vertex.elevation : undefined;
                            let coord = [this.roundCoordinate(lng), this.roundCoordinate(lat)];
                            if (elevation !== undefined && elevation !== null) {
                                coord.push(this.roundCoordinate(elevation));
                            }
                            return coord;
                        });

                        // 閉じる必要がある
                        if (coordinates.length > 0) {
                            const first = coordinates[0];
                            const last = coordinates[coordinates.length - 1];
                            if (first[0] !== last[0] || first[1] !== last[1]) {
                                coordinates.push([...first]);
                            }

                            features.push({
                                type: 'Feature',
                                properties: {
                                    id: area.id || `area_${Date.now()}`,
                                    name: area.name || '名称未設定エリア',
                                    type: 'area',
                                    source: 'image_transformed',
                                    description: 'エリア（GPS変換済）'
                                },
                                geometry: {
                                    type: 'Polygon',
                                    coordinates: [coordinates]
                                }
                            });
                        }
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
     * @param {Object} geoJsonData - GeoJSONデータ（features配列を含む）
     * @returns {string} GeoJSONファイル名
     */
    getGeoJsonFileName(geoJsonData) {
        // 日付フォーマット YYYYMMDD
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}${mm}${dd}`;

        // PNG画像ファイル名から略称を取得（先頭から区切り文字の前まで）
        const abbreviation = this.currentPngFileName.split(/[-_\s.]/)[0];

        // featuresからポイント・ルート・スポット・エリアの件数を集計
        const features = (geoJsonData && geoJsonData.features) || [];
        const pointCount = features.filter(f => f.properties?.type === 'point').length;
        const routeCount = features.filter(f => f.properties?.type === 'route').length;
        const spotCount  = features.filter(f => f.properties?.type === 'spot').length;
        const areaCount  = features.filter(f => f.properties?.type === 'area').length;

        // 件数が1以上の項目のみ含める（0の場合は省略）
        const parts = [];
        if (pointCount > 0) parts.push(`P${pointCount}`);
        if (routeCount > 0) parts.push(`R${routeCount}`);
        if (spotCount  > 0) parts.push(`S${spotCount}`);
        if (areaCount  > 0) parts.push(`A${areaCount}`);

        const countStr = parts.join('_');
        return countStr
            ? `${abbreviation}-GPS-${countStr}-${dateStr}`
            : `${abbreviation}-GPS-${dateStr}`;
    }

    /**
     * 標高未取得件数を各UIフィールドに反映する
     */
    updateElevationCounts() {
        try {
            const stats = this.getElevationStats();

            const pointCountField = document.getElementById('elevationPointCount');
            if (pointCountField) pointCountField.value = stats.points.missing;

            const routeCountField = document.getElementById('elevationRouteCount');
            if (routeCountField) routeCountField.value = stats.routes.missing;

            const spotCountField = document.getElementById('elevationSpotCount');
            if (spotCountField) spotCountField.value = stats.spots.missing;

            let areaVertexMissing = 0;
            if (this.areaHandler && this.areaHandler.areas) {
                for (const area of this.areaHandler.areas) {
                    if (area.vertices && Array.isArray(area.vertices)) {
                        for (const vertex of area.vertices) {
                            if (vertex.elevation === undefined || vertex.elevation === null) {
                                areaVertexMissing++;
                            }
                        }
                    }
                }
            }
            const areaVertexCountField = document.getElementById('elevationAreaVertexCount');
            if (areaVertexCountField) areaVertexCountField.value = areaVertexMissing;
        } catch (error) {
            this.logger.error('標高未取得件数更新エラー', error);
        }
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
     * @returns {Object} {points: {missing, total}, routes: {missing, total}, spots: {missing, total}}
     */
    getElevationStats() {
        const stats = {
            points: { missing: 0, total: 0 },
            routes: { missing: 0, total: 0 },
            spots: { missing: 0, total: 0 }
        };

        // ポイントのカウント（GPS Excelデータ）
        if (this.routeSpotHandler?.pointData?.length > 0) {
            const points = this.routeSpotHandler.pointData;
            stats.points.total = points.length;
            for (const point of points) {
                if (point.elevation === undefined || point.elevation === null) {
                    stats.points.missing++;
                }
            }
        } else if (this.imageCoordinateMarkers?.length > 0) {
            // combined JSON形式のポイント（imageCoordinateMarkersのpointJSON型）
            const pointInfos = this.imageCoordinateMarkers.filter(m => m.data?.type === 'pointJSON');
            stats.points.total = pointInfos.length;
            stats.points.missing = pointInfos.filter(m => m.data?.elevation === undefined || m.data?.elevation === null).length;
        }

        // ルートマーカーのカウント
        if (this.routeSpotHandler?.routeMarkers?.length > 0) {
            stats.routes.total = this.routeSpotHandler.routeMarkers.length;
            for (const marker of this.routeSpotHandler.routeMarkers) {
                const meta = marker.__meta;
                if (!meta || meta.elevation === undefined || meta.elevation === null) {
                    stats.routes.missing++;
                }
            }
        } else if (this.imageCoordinateMarkers?.length > 0) {
            // combined JSON形式のルート中間点（imageCoordinateMarkersのwaypoint型）
            const waypointInfos = this.imageCoordinateMarkers.filter(m => m.data?.type === 'waypoint');
            stats.routes.total = waypointInfos.length;
            stats.routes.missing = waypointInfos.filter(m => m.data?.elevation === undefined || m.data?.elevation === null).length;
        }

        // スポットマーカーのカウント
        if (this.routeSpotHandler?.spotMarkers?.length > 0) {
            const latestSpots = this.getLatestSpots(this.routeSpotHandler.spotMarkers);
            stats.spots.total = latestSpots.length;
            for (const marker of latestSpots) {
                const meta = marker.__meta;
                if (!meta || meta.elevation === undefined || meta.elevation === null) {
                    stats.spots.missing++;
                }
            }
        } else if (this.imageCoordinateMarkers?.length > 0) {
            // combined JSON形式のスポット（imageCoordinateMarkersのspot型）
            const spotInfos = this.imageCoordinateMarkers.filter(m => m.data?.type === 'spot');
            stats.spots.total = spotInfos.length;
            stats.spots.missing = spotInfos.filter(m => m.data?.elevation === undefined || m.data?.elevation === null).length;
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
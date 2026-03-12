import { Logger, errorHandler } from './utils.js';
import { CONFIG } from './constants.js';

export class DataImporter {
    constructor(app) {
        this.app = app;
        this.logger = new Logger('DataImporter');
    }

    /**
     * GPS Excelファイル読み込み
     */
    async handleGpsExcelLoad(event) {
        try {
            const files = Array.from(event.target.files);
            if (files.length === 0) return;

            // 既存データがある場合は確認
            const existingCount = this.app.gpsData?.getPoints()?.length || 0;
            let mode = 'clear'; // デフォルトはクリア（初回など）

            if (existingCount > 0) {
                // 追記か中止かを確認
                const shouldAppend = window.confirm(
                    `既存のGPSポイントデータ(${existingCount}件)があります。\n` +
                    `データを追記しますか？\n\n` +
                    `[OK] 追記する（IDと座標が一致するデータはスキップ）\n` +
                    `[キャンセル] 読み込みを中止`
                );

                if (!shouldAppend) {
                    // ファイル入力をリセットして中止
                    event.target.value = '';
                    return;
                }
                mode = 'append';
            }

            this.logger.info(`GPS Excelファイル読み込み開始: ${files.length}ファイル, モード: ${mode}`);

            if (mode === 'clear') {
                this.app.gpsData.gpsPoints = [];
                this.app.gpsData.clearMarkersFromMap();
            }

            let totalLoaded = 0;
            let totalAdded = 0;

            for (const file of files) {
                try {
                    this.logger.info(`Processing file: ${file.name}`);

                    // GPSDataクラスのExcel読み込み機能を使用
                    const rawData = await this.app.fileHandler.loadExcelFile(file);

                    // Excel データを検証・変換
                    const validatedData = this.app.fileHandler.validateAndConvertExcelData(rawData);

                    if (validatedData.length === 0) {
                        this.logger.warn(`有効なデータがありません: ${file.name}`);
                        continue;
                    }

                    totalLoaded += validatedData.length;

                    // マージ（追加）処理
                    const addedCount = this.app.gpsData.mergePoints(validatedData);
                    totalAdded += addedCount;

                    this.logger.info(`ファイル完了: ${file.name}, 追加: ${addedCount}`);

                } catch (fileError) {
                    this.logger.error(`ファイル読み込みエラー: ${file.name}`, fileError);
                    this.app.showMessage(`エラー(${file.name}): ${fileError.message}`, 'error');
                }
            }

            // 地図上にGPSポイントを表示（全データ再描画）
            if (this.app.mapCore && this.app.mapCore.getMap()) {
                this.app.gpsData.displayPointsOnMap(this.app.mapCore.getMap());
            }

            // GPS ポイント数を更新
            this.app.uiHandlers.updateGpsPointCount(this.app.gpsData);

            // 完了メッセージ
            const currentTotal = this.app.gpsData.getPoints().length;
            if (mode === 'append') {
                this.app.showMessage(`${totalAdded}個のポイントを追加しました (現在合計: ${currentTotal}個)`);
            } else {
                this.app.showMessage(`${currentTotal}個のポイントを読み込みました`);
            }

        } catch (error) {
            this.logger.error('GPS Excel一括読み込みエラー', error);
            errorHandler.handle(error, error.message, 'GPS Excel読み込み');
        } finally {
            // 同じファイルを再選択できるようにファイル入力をリセット
            event.target.value = '';
        }
    }

    /**
     * PNG画像ファイル読み込み
     */
    async handlePngLoad(event) {
        try {
            // 既存データがある場合は確認
            if (this.app.currentPngFileName) {
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

            // 既存データをクリア(画面上のみ)
            if (this.app.currentPngFileName) {
                // 画像クリア
                if (this.app.imageOverlay) {
                    // Leaflet ImageOverlayを地図から削除
                    if (this.app.imageOverlay.imageOverlay && this.app.mapCore && this.app.mapCore.getMap()) {
                        this.app.mapCore.getMap().removeLayer(this.app.imageOverlay.imageOverlay);
                    }
                    // ImageOverlayの内部状態をクリア
                    this.app.imageOverlay.imageOverlay = null;
                    this.app.imageOverlay.currentImage = new Image(); // 新しいImageオブジェクトを作成
                    this.app.imageOverlay.currentImageFileName = null;
                    this.app.imageOverlay.resetTransformation();
                }

                // ポイント・ルート・スポットクリア
                if (this.app.routeSpotHandler) {
                    this.app.routeSpotHandler.pointData = [];
                    this.app.routeSpotHandler.routeData = [];
                    this.app.routeSpotHandler.spotData = [];
                    this.app.routeSpotHandler.clearAllMarkers();
                }

                // ポイント(JSON)データクリア
                this.app.pointJsonData = null;

                // エリアデータクリア
                if (this.app.areaHandler) {
                    this.app.areaHandler.areas = []; // Reset areas array
                    this.app.areaHandler.clearAreaLayers();
                }

                // Georeferencingポイントマーカークリア (関連するすべてのマーカーをクリア)
                this.app.imageCoordinateMarkers = [];
                if (this.app.georeferencing) {
                    this.app.georeferencing.clearImageCoordinateMarkers('all');
                    this.app.georeferencing.setPointJsonData(null);
                }

                // UIカウント更新 (全クリア)
                this.app.uiHandlers.clearAllCounts();

                this.app.currentPngFileName = null;
            }

            // PNGファイル名を記録（拡張子を除去）
            this.app.currentPngFileName = file.name.replace(/\.[^/.]+$/, '');
            this.logger.info('PNGファイル:', this.app.currentPngFileName);

            // ファイル名を表示
            const pngFileNameField = document.getElementById('pngFileName');
            if (pngFileNameField) {
                pngFileNameField.value = file.name;
                pngFileNameField.title = file.name; // ツールチップでも表示
            }

            // PNG画像を読み込み
            if (this.app.imageOverlay) {
                await this.app.imageOverlay.loadImage(file);
            }

            // 成功メッセージを表示
            this.app.showMessage(`PNG画像ファイルを読み込みました:\n${file.name}`);

        } catch (error) {
            this.logger.error('PNG読み込みエラー', error);
            errorHandler.handle(error, 'PNG画像の読み込みに失敗しました。', 'PNG読み込み');
        } finally {
            // 同じファイルを再選択できるようにファイル入力をリセット
            event.target.value = '';
        }
    }

    /**
     * ポイント(座標)JSONファイル読み込み
     */
    async handlePointCoordJsonLoad(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            this.logger.info('ポイント(座標)JSONファイル読み込み開始', file.name);

            // JSONファイルを読み込んでポイント座標情報を処理
            const text = await file.text();
            const data = JSON.parse(text);

            // ポイントJSONデータを保存
            this.app.pointJsonData = data;
            this.app.georeferencing.setPointJsonData(data);

            // imageX, imageYを持つポイントを画像上に表示
            if (this.app.imageOverlay && data) {
                // 既存のマーカーをクリア
                this.app.georeferencing.clearImageCoordinateMarkers('georeference-point');

                this.app.imageCoordinateMarkers = await this.app.coordinateDisplay.displayImageCoordinates(data, 'points', this.app.imageCoordinateMarkers);

                // GeoreferencingクラスにもmarkerInfoを渡す
                this.app.imageCoordinateMarkers.forEach(markerInfo => {
                    this.app.georeferencing.addImageCoordinateMarker(markerInfo);
                });

                this.logger.info(`ポイントマーカー登録完了: ${this.app.imageCoordinateMarkers.length}個`);
            }

            // ポイント座標数を更新
            this.app.uiHandlers.updatePointCoordCount(this.app.pointJsonData);

            this.logger.info('ポイント(座標)JSON読み込み完了', data);

        } catch (error) {
            this.logger.error('ポイント(座標)JSON読み込みエラー', error);
            errorHandler.handle(error, 'ポイント(座標)JSONファイルの読み込みに失敗しました。', 'ポイント(座標)JSON読み込み');
        }
    }

    /**
     * ルート・スポット(座標)JSONファイル読み込み
     */
    async handleRouteSpotJsonLoad(event) {
        try {
            const files = Array.from(event.target.files);
            if (!files.length) return;

            const dataItems = [];

            // ファイルの読み込み
            for (const file of files) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    dataItems.push({
                        data: data,
                        fileName: file.name
                    });
                } catch (fileError) {
                    this.logger.error(`ファイル読み込みエラー: ${file.name}`, fileError);
                }
            }

            // RouteSpotHandlerに処理を委譲（自動判定するため、selectedRouteSpotTypeは不要）
            if (dataItems.length > 0) {
                await this.app.routeSpotHandler.importRouteSpotData(dataItems);
            }

            // ルート・スポット数を更新
            this.app.uiHandlers.updateRouteSpotCount(this.app.routeSpotHandler);

            // 成功メッセージ
            this.app.showMessage(`${dataItems.length}件のファイルを読み込みました`);

        } catch (error) {
            this.logger.error('ルート・スポット(座標)JSON読み込みエラー', error);
            errorHandler.handle(error, 'ルート・スポット(座標)JSONファイルの読み込みに失敗しました。', 'ルート・スポット(座標)JSON読み込み');
        } finally {
            event.target.value = '';
        }
    }

    /**
     * 汎用JSONファイル読み込み
     */
    async handleJsonLoad(event) {
        try {
            const files = Array.from(event.target.files);
            if (!files.length) return;

            // 既存データの有無を確認（詳細）
            // GPSデータ(Excel由来)は「ベースデータ」として扱うため、JSON読み込み時の「既存データ」としては扱わない
            // const gpsCount = this.app.gpsData ? this.app.gpsData.getPoints().length : 0;
            const pointJsonCount = (this.app.pointJsonData && this.app.pointJsonData.points) ? this.app.pointJsonData.points.length : 0;
            const routeCount = this.app.routeSpotHandler ? this.app.routeSpotHandler.routeData.length : 0;
            const spotCount = this.app.routeSpotHandler ? this.app.routeSpotHandler.spotData.length : 0;

            const hasExistingData = pointJsonCount > 0 || routeCount > 0 || spotCount > 0;

            let mode = 'clear';

            if (hasExistingData) {
                // デバッグ用ログ
                this.logger.info(`既存データ検出: PointJSON=${pointJsonCount}, Route=${routeCount}, Spot=${spotCount}`);

                let message = `既存のデータがあります:\n`;
                if (pointJsonCount > 0) message += `- ポイント(JSON): ${pointJsonCount}件\n`;
                if (routeCount > 0) message += `- ルート: ${routeCount}件\n`;
                if (spotCount > 0) message += `- スポット: ${spotCount}件\n`;

                message += `\nデータを追記しますか？\n` +
                    `[OK] 追記する（重複はスキップ）\n` +
                    `[キャンセル] 読み込みを中止`;

                const shouldAppend = window.confirm(message);

                if (!shouldAppend) {
                    event.target.value = '';
                    return;
                }
                mode = 'append';
            }

            this.logger.info(`複数JSONファイル読み込み開始: ${files.length}ファイル, モード: ${mode}`);
            this.app.showMessage('JSONファイルを読み込んでいます...');

            // クリアモードならデータをリセット
            if (mode === 'clear') {
                // GPSデータはクリアしない（Excel由来のデータを保持）
                // if (this.app.gpsData) {
                //    this.app.gpsData.gpsPoints = [];
                //    this.app.gpsData.clearMarkersFromMap();
                // }
                this.app.pointJsonData = null;
                this.app.routeSpotHandler.routeData = [];
                this.app.routeSpotHandler.spotData = [];
                this.app.imageCoordinateMarkers = [];
                this.app.georeferencing.clearImageCoordinateMarkers('georeference-point');
                if (this.app.referenceLayer && this.app.mapCore && this.app.mapCore.map) {
                    this.app.mapCore.map.removeLayer(this.app.referenceLayer);
                    this.app.referenceLayer = null;
                }
            }

            let geoJsonProcessed = 0;
            // 既存のGPSポイントがあれば取得（常に追記・マージとして扱う）
            const allGpsPoints = (this.app.gpsData) ? [...this.app.gpsData.getPoints()] : [];
            const otherGeoJsonFeatures = [];

            // 各ファイルを処理
            for (const file of files) {
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);

                    this.logger.info(`JSONファイル処理開始: ${file.name}`);

                    // 1. GeoJSON形式の判定
                    if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
                        for (const feature of data.features) {
                            if (feature.geometry && feature.geometry.type === 'Point' && feature.properties && feature.properties.type !== 'route' && feature.properties.type !== 'spot' && feature.properties.type !== 'area') {
                                // ポイントデータ (GPS) - 重複チェック
                                const newPoint = {
                                    pointId: feature.properties.id || feature.properties.name || `Point_${allGpsPoints.length + 1}`,
                                    lat: feature.geometry.coordinates[1],
                                    lng: feature.geometry.coordinates[0],
                                    elevation: feature.geometry.coordinates[2] || 0,
                                    location: feature.properties.name || feature.properties.location || '',
                                    gpsElevation: feature.properties.gpsElevation || 0
                                };

                                const isDuplicate = allGpsPoints.some(existing => {
                                    const EPSILON = 0.0000001;
                                    return Math.abs(existing.lat - newPoint.lat) < EPSILON &&
                                        Math.abs(existing.lng - newPoint.lng) < EPSILON;
                                });

                                if (!isDuplicate) {
                                    allGpsPoints.push(newPoint);
                                }
                            } else {
                                otherGeoJsonFeatures.push(feature);
                            }
                        }
                        geoJsonProcessed++;
                        continue;
                    }
                    // ... (その他の形式の処理は続く)

                    // 2. 独自形式 (Route/Spot/Point) の判定
                    const detectedType = this.app.routeSpotHandler.detectJsonType(data);

                    if (detectedType === 'route') {
                        // ルートデータ
                        const routes = this.app.routeSpotHandler.processRouteData(data, file.name);
                        this.app.routeSpotHandler.routeData = this.app.routeSpotHandler.mergeAndDeduplicate(
                            this.app.routeSpotHandler.routeData, routes, 'route'
                        );
                        // 画像上にルート中間点を表示 (追加描画)
                        this.app.imageCoordinateMarkers = await this.app.coordinateDisplay.displayImageCoordinates(data, 'route', this.app.imageCoordinateMarkers);

                    } else if (detectedType === 'spot') {
                        // スポットデータ
                        const spots = this.app.routeSpotHandler.processSpotData(data, file.name);
                        this.app.routeSpotHandler.spotData = this.app.routeSpotHandler.mergeAndDeduplicate(
                            this.app.routeSpotHandler.spotData, spots, 'spot'
                        );
                        // 画像上にスポットを表示 (追加描画)
                        this.app.imageCoordinateMarkers = await this.app.coordinateDisplay.displayImageCoordinates(data, 'spot', this.app.imageCoordinateMarkers);

                    } else if (detectedType === 'point') {
                        // ポイントデータ (画像処理用)
                        // 追記モードの場合、ポイントデータの扱いは注意が必要（通常1セットだが、複数ファイルならマージ？）
                        // ここでは常に上書きせず、既存データがあればマージする方針で

                        if (!this.app.pointJsonData || mode === 'clear') {
                            this.app.pointJsonData = data;
                        } else {
                            // マージ処理 (簡易): ID重複チェックを行いつつ追加
                            if (data.points && Array.isArray(data.points)) {
                                const currentPoints = this.app.pointJsonData.points || [];
                                data.points.forEach(p => {
                                    // 重複チェック (ID & 座標)
                                    const isDup = currentPoints.some(existing =>
                                        existing.id === p.id && existing.x === p.x && existing.y === p.y
                                    );
                                    if (!isDup) {
                                        currentPoints.push(p);
                                    }
                                });
                                this.app.pointJsonData.points = currentPoints;
                            }
                        }

                        this.app.georeferencing.setPointJsonData(this.app.pointJsonData);

                        // 画像上にポイント座標を表示 (追加描画)
                        if (this.app.imageOverlay && data.points) {
                            this.app.imageCoordinateMarkers = await this.app.coordinateDisplay.displayImageCoordinates(data, 'points', this.app.imageCoordinateMarkers);

                            // GeoreferencingクラスにもmarkerInfoを渡す
                            // マーカーの重複追加を防ぐロジックが必要だが、displayImageCoordinatesが返すのは新規分含めた全体？いや、実装依存。
                            // displayImageCoordinatesは既存マーカー配列を受け取って追加して返す仕様のようなのでOK。

                            // ただしGeoreferencing側への追加は重複チェックが必要かもしれないが、
                            // addImageCoordinateMarkerは単純pushなので、再描画時にクリアするか？
                            // 効率のため、今回は新規追加分だけ...といきたいが、displayImageCoordinatesの実装を見ると
                            // 既存マーカー配列にpushして返している。
                            // なので、全マーカー再登録は重複を生む。

                            // 一旦クリアして全再登録が無難
                            this.app.georeferencing.clearImageCoordinateMarkers('georeference-point');
                            this.app.imageCoordinateMarkers.forEach(markerInfo => {
                                this.app.georeferencing.addImageCoordinateMarker(markerInfo);
                            });
                        }

                    } else if (detectedType === 'area') {
                        // エリアデータ
                        if (data.areas && Array.isArray(data.areas)) {
                            await this.app.areaHandler.importAreas(data.areas, this.app.imageOverlay);
                        }

                    } else if (detectedType === 'combined') {
                        // 複合形式
                        const combinedData = data.data;

                        // 画像上に全座標を表示
                        this.app.imageCoordinateMarkers = await this.app.coordinateDisplay.displayImageCoordinates(data, 'combined', this.app.imageCoordinateMarkers);
                        this.app.georeferencing.clearImageCoordinateMarkers('georeference-point');
                        this.app.imageCoordinateMarkers.forEach(markerInfo => {
                            this.app.georeferencing.addImageCoordinateMarker(markerInfo);
                        });

                        // ポイントデータを格納
                        if (combinedData.points && Array.isArray(combinedData.points)) {
                            // ポイントデータのマージロジック
                            if (!this.app.pointJsonData || mode === 'clear') {
                                this.app.pointJsonData = { points: [] };
                            }
                            // combinedDataのpoints形式に注意（imageX/imageY変換など）
                            const newPoints = combinedData.points.map(p => ({
                                ...p,
                                imageX: p.imageX !== undefined ? p.imageX : p.x,
                                imageY: p.imageY !== undefined ? p.imageY : p.y
                            }));

                            const currentPoints = this.app.pointJsonData.points || [];
                            newPoints.forEach(p => {
                                const isDup = currentPoints.some(existing =>
                                    existing.id === p.id && existing.x === p.x && existing.y === p.y
                                );
                                if (!isDup) currentPoints.push(p);
                            });
                            this.app.pointJsonData.points = currentPoints;
                            this.app.georeferencing.setPointJsonData(this.app.pointJsonData);
                        }

                        // ルートデータを格納
                        if (combinedData.routes && Array.isArray(combinedData.routes)) {
                            const routes = [];
                            combinedData.routes.forEach(route => {
                                routes.push({
                                    ...route,
                                    fileName: file.name,
                                    routeId: route.routeName || file.name
                                });
                            });
                            this.app.routeSpotHandler.routeData = this.app.routeSpotHandler.mergeAndDeduplicate(
                                this.app.routeSpotHandler.routeData, routes, 'route'
                            );
                        }

                        // スポットデータを格納
                        if (combinedData.spots && Array.isArray(combinedData.spots)) {
                            const spots = [];
                            combinedData.spots.forEach(spot => {
                                spots.push({
                                    ...spot,
                                    fileName: file.name,
                                    spotId: spot.name || `${file.name}_spot`
                                });
                            });
                            this.app.routeSpotHandler.spotData = this.app.routeSpotHandler.mergeAndDeduplicate(
                                this.app.routeSpotHandler.spotData, spots, 'spot'
                            );
                        }

                        // エリアデータを処理・表示
                        if (combinedData.areas && Array.isArray(combinedData.areas)) {
                            await this.app.areaHandler.importAreas(combinedData.areas, this.app.imageOverlay);
                        }

                    } else {
                        this.logger.warn(`未知のJSONファイル形式: ${file.name}`);
                    }

                } catch (fileError) {
                    this.logger.error(`ファイル処理エラー: ${file.name}`, fileError);
                }
            }

            // GeoJSON由来のGPSポイントを表示
            if (allGpsPoints.length > 0 && this.app.gpsData) {
                this.app.gpsData.setPointsFromExcelData(allGpsPoints);
                if (this.app.mapCore && this.app.mapCore.map) {
                    this.app.gpsData.displayPointsOnMap(this.app.mapCore.map);
                }
                this.app.uiHandlers.updateGpsPointCount(this.app.gpsData);
            }

            // GeoJSON由来の参照レイヤーを表示
            if (otherGeoJsonFeatures.length > 0 && this.app.mapCore && this.app.mapCore.map) {
                if (this.app.referenceLayer) {
                    this.app.mapCore.map.removeLayer(this.app.referenceLayer);
                }
                this.app.referenceLayer = L.geoJSON(otherGeoJsonFeatures, {
                    style: (feature) => {
                        switch (feature.geometry.type) {
                            case 'LineString': return { color: 'blue', weight: 4 };
                            case 'Polygon': return { color: 'green', weight: 2, fillOpacity: 0.2 };
                            default: return { color: 'orange' };
                        }
                    },
                    onEachFeature: (feature, layer) => {
                        if (feature.properties && feature.properties.name) {
                            layer.bindPopup(feature.properties.name);
                        }
                    }
                }).addTo(this.app.mapCore.map);
            }

            // UIを更新
            if (this.app.pointJsonData) {
                this.app.uiHandlers.updatePointCoordCount(this.app.pointJsonData);
            }
            this.app.uiHandlers.updateRouteSpotCount(this.app.routeSpotHandler);
            this.app.uiHandlers.updateAreaCount(this.app.areaHandler.areas ? this.app.areaHandler.areas.length : 0);

            // カウントを取得して詳細なメッセージを作成
            let pCount = 0;
            if (this.app.pointJsonData) {
                if (this.app.pointJsonData.points && Array.isArray(this.app.pointJsonData.points)) {
                    pCount = this.app.pointJsonData.points.filter(p => !p.type || p.type !== 'waypoint').length;
                } else if (Array.isArray(this.app.pointJsonData)) {
                    pCount = this.app.pointJsonData.filter(p => !p.type || p.type !== 'waypoint').length;
                }
            }
            const rCount = this.app.routeSpotHandler.getRouteCount();
            const sCount = this.app.routeSpotHandler.getSpotCount();
            const aCount = this.app.areaHandler.areas ? this.app.areaHandler.areas.length : 0;

            // 成功メッセージを表示
            this.app.showMessage(
                `${files.length}件のファイルを処理しました (${mode === 'append' ? '追記' : '新規'})\n` +
                `ポイント: ${pCount}個, ルート: ${rCount}本, スポット: ${sCount}個, エリア: ${aCount}個`
            );

        } catch (error) {
            this.logger.error('JSON読み込みエラー', error);
            errorHandler.handle(error, 'JSONファイルの読み込みに失敗しました。', 'JSON読み込み');
        } finally {
            event.target.value = '';
        }
    }
}

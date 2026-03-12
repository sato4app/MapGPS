import { CoordinateUtils } from '../utils/Coordinates.js';
import { UIHelper } from '../ui/UIHelper.js';

/**
 * Firebase同期処理を管理するクラス
 * ポイント、スポット、ルートのFirestore連携を担当
 */
export class FirebaseSyncManager {
    /**
     * コンストラクタ
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {Object} spotManager - SpotManagerインスタンス
     * @param {Object} routeManager - RouteManagerインスタンス

     * @param {Object} areaManager - AreaManagerインスタンス
     * @param {Object} fileHandler - FileHandlerインスタンス
     */
    constructor(pointManager, spotManager, routeManager, areaManager, fileHandler) {
        this.pointManager = pointManager;
        this.spotManager = spotManager;
        this.routeManager = routeManager;
        this.areaManager = areaManager;
        this.fileHandler = fileHandler;
        this.currentImage = null;
        this.canvas = null;
    }

    /**
     * 現在の画像とキャンバスを設定
     * @param {HTMLImageElement} image - 現在の画像
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     */
    setImageAndCanvas(image, canvas) {
        this.currentImage = image;
        this.canvas = canvas;
    }

    /**
     * ポイントをFirebaseに更新
     * @param {number} pointIndex - ポイントのインデックス
     */
    async updatePointToFirebase(pointIndex) {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            return;
        }

        // プロジェクトIDを画像ファイル名から取得
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            return;
        }

        const points = this.pointManager.getPoints();
        if (pointIndex < 0 || pointIndex >= points.length) {
            return;
        }

        const point = points[pointIndex];

        // 空白IDのポイントは更新対象外
        if (!point.id || point.id.trim() === '') {
            return;
        }

        try {
            // キャンバス座標から画像座標に変換
            const imageCoords = CoordinateUtils.canvasToImage(
                point.x, point.y,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );

            // プロジェクトメタデータの存在確認・作成
            const existingProject = await window.firestoreManager.getProjectMetadata(projectId);
            if (!existingProject) {
                const metadata = {
                    projectName: projectId,
                    imageName: projectId + '.png',
                    imageWidth: this.currentImage.width,
                    imageHeight: this.currentImage.height
                };
                await window.firestoreManager.createProjectMetadata(projectId, metadata);
            }

            // 既存ポイントを検索
            const existingPoint = await window.firestoreManager.findPointById(projectId, point.id);

            if (existingPoint) {
                // 既存ポイントを更新
                await window.firestoreManager.updatePoint(projectId, existingPoint.firestoreId, {
                    x: imageCoords.x,
                    y: imageCoords.y,
                    index: point.index || 0,
                    isMarker: false
                });
            } else {
                // 新規ポイントを追加
                await window.firestoreManager.addPoint(projectId, {
                    id: point.id,
                    x: imageCoords.x,
                    y: imageCoords.y,
                    index: point.index || 0,
                    isMarker: false
                });
            }

        } catch (error) {
            // エラーが発生してもユーザーには通知しない（バックグラウンド処理）
        }
    }

    /**
     * 座標でポイントをFirebaseから削除
     * @param {number} x - キャンバスX座標
     * @param {number} y - キャンバスY座標
     */
    async deletePointFromFirebase(x, y) {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            return;
        }

        // プロジェクトIDを画像ファイル名から取得
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            return;
        }

        try {
            // キャンバス座標から画像座標に変換
            const imageCoords = CoordinateUtils.canvasToImage(
                x, y,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );

            // 同じ座標のポイントをFirestoreから検索・削除
            const points = await window.firestoreManager.getPoints(projectId);
            const tolerance = 1.0; // 誤差許容範囲（1px）

            for (const point of points) {
                const dx = Math.abs(point.x - imageCoords.x);
                const dy = Math.abs(point.y - imageCoords.y);

                if (dx <= tolerance && dy <= tolerance) {
                    await window.firestoreManager.deletePoint(projectId, point.firestoreId);
                    break;
                }
            }
        } catch (error) {
            // エラーが発生してもユーザーには通知しない（バックグラウンド処理）
        }
    }

    /**
     * スポットをFirebaseに更新
     * @param {number} spotIndex - スポットのインデックス
     */
    async updateSpotToFirebase(spotIndex) {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            return;
        }

        // プロジェクトIDを画像ファイル名から取得
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            return;
        }

        const spots = this.spotManager.getSpots();
        if (spotIndex < 0 || spotIndex >= spots.length) {
            return;
        }

        const spot = spots[spotIndex];

        // 空白名のスポットは更新対象外
        if (!spot.name || spot.name.trim() === '') {
            return;
        }

        try {
            // キャンバス座標から画像座標に変換
            const imageCoords = CoordinateUtils.canvasToImage(
                spot.x, spot.y,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );

            // プロジェクトメタデータの存在確認・作成
            const existingProject = await window.firestoreManager.getProjectMetadata(projectId);
            if (!existingProject) {
                const metadata = {
                    projectName: projectId,
                    imageName: projectId + '.png',
                    imageWidth: this.currentImage.width,
                    imageHeight: this.currentImage.height
                };
                await window.firestoreManager.createProjectMetadata(projectId, metadata);
            }

            // 既存スポットを検索
            const existingSpot = await window.firestoreManager.findSpotByName(projectId, spot.name);

            if (existingSpot) {
                // 既存スポットを更新
                await window.firestoreManager.updateSpot(projectId, existingSpot.firestoreId, {
                    x: imageCoords.x,
                    y: imageCoords.y
                });
            } else {
                // 新規スポットを追加
                await window.firestoreManager.addSpot(projectId, {
                    name: spot.name,
                    x: imageCoords.x,
                    y: imageCoords.y
                });
            }

        } catch (error) {
            // エラーが発生してもユーザーには通知しない（バックグラウンド処理）
        }
    }

    /**
     * 座標でスポットをFirebaseから削除
     * @param {number} x - キャンバスX座標
     * @param {number} y - キャンバスY座標
     */
    async deleteSpotFromFirebase(x, y) {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            return;
        }

        // プロジェクトIDを画像ファイル名から取得
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            return;
        }

        try {
            // キャンバス座標から画像座標に変換
            const imageCoords = CoordinateUtils.canvasToImage(
                x, y,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );

            // 同じ座標のスポットをFirestoreから検索・削除
            const spots = await window.firestoreManager.getSpots(projectId);
            const tolerance = 1.0; // 誤差許容範囲（1px）

            for (const spot of spots) {
                const dx = Math.abs(spot.x - imageCoords.x);
                const dy = Math.abs(spot.y - imageCoords.y);

                if (dx <= tolerance && dy <= tolerance) {
                    await window.firestoreManager.deleteSpot(projectId, spot.firestoreId);
                    break;
                }
            }
        } catch (error) {
            // エラーが発生してもユーザーには通知しない（バックグラウンド処理）
        }
    }

    /**
     * ルートをFirebaseに更新
     * @param {number} routeIndex - ルートのインデックス
     */
    async updateRouteToFirebase(routeIndex) {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            return;
        }

        // プロジェクトIDを画像ファイル名から取得
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            return;
        }

        const routes = this.routeManager.getAllRoutes();
        if (routeIndex < 0 || routeIndex >= routes.length) {
            return;
        }

        const route = routes[routeIndex];

        try {
            // 中間点の座標変換
            const convertedWaypoints = [];
            if (route.routePoints) {
                for (const waypoint of route.routePoints) {
                    const imageCoords = CoordinateUtils.canvasToImage(
                        waypoint.x, waypoint.y,
                        this.canvas.width, this.canvas.height,
                        this.currentImage.width, this.currentImage.height
                    );
                    convertedWaypoints.push({ x: imageCoords.x, y: imageCoords.y });
                }
            }

            // プロジェクトメタデータの存在確認・作成
            const existingProject = await window.firestoreManager.getProjectMetadata(projectId);
            if (!existingProject) {
                const metadata = {
                    projectName: projectId,
                    imageName: projectId + '.png',
                    imageWidth: this.currentImage.width,
                    imageHeight: this.currentImage.height
                };
                await window.firestoreManager.createProjectMetadata(projectId, metadata);
            }

            const routeData = {
                routeName: route.routeName,
                startPoint: route.startPointId,
                endPoint: route.endPointId,
                waypoints: convertedWaypoints,
                waypointCount: convertedWaypoints.length,
                description: route.description || ''
            };

            if (route.firestoreId) {
                // 既存ルートを更新
                await window.firestoreManager.updateRoute(projectId, route.firestoreId, routeData);
            } else {
                // 新規ルートを追加
                const result = await window.firestoreManager.addRoute(projectId, routeData);
                if (result.status === 'success') {
                    // FirestoreIDを保存
                    route.firestoreId = result.firestoreId;
                } else if (result.status === 'duplicate') {
                    // 重複時は既存のIDを使って更新
                    route.firestoreId = result.existing.firestoreId;
                    await window.firestoreManager.updateRoute(projectId, route.firestoreId, routeData);
                }
            }

        } catch (error) {
            console.error('ルート保存エラー:', error);
        }
    }

    /**
     * ルートをFirebaseから削除
     * @param {string} firestoreId - Firestore ID
     */
    async deleteRouteFromFirebase(firestoreId) {
        if (!window.firestoreManager || !this.currentImage || !firestoreId) return;
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) return;

        try {
            await window.firestoreManager.deleteRoute(projectId, firestoreId);
        } catch (error) {
            console.error('ルート削除エラー:', error);
        }
    }

    /**
     * エリアをFirebaseに更新
     * @param {number} areaIndex - エリアのインデックス
     */
    async updateAreaToFirebase(areaIndex) {
        if (!window.firestoreManager || !this.currentImage) return;

        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) return;

        const areas = this.areaManager.getAllAreas();
        if (areaIndex < 0 || areaIndex >= areas.length) return;

        const area = areas[areaIndex];
        if (!area.areaName || area.areaName.trim() === '') return;

        try {
            // 頂点座標の変換
            const convertedVertices = [];
            if (area.vertices) {
                for (const vertex of area.vertices) {
                    const imageCoords = CoordinateUtils.canvasToImage(
                        vertex.x, vertex.y,
                        this.canvas.width, this.canvas.height,
                        this.currentImage.width, this.currentImage.height
                    );
                    convertedVertices.push({ x: imageCoords.x, y: imageCoords.y });
                }
            }

            const areaData = {
                areaName: area.areaName,
                vertices: convertedVertices
            };

            if (area.firestoreId) {
                // 更新
                await window.firestoreManager.updateArea(projectId, area.firestoreId, areaData);
            } else {
                // 新規追加
                const result = await window.firestoreManager.addArea(projectId, areaData);
                if (result.status === 'success') {
                    area.firestoreId = result.firestoreId;
                } else if (result.status === 'duplicate') {
                    area.firestoreId = result.existing.firestoreId;
                    await window.firestoreManager.updateArea(projectId, area.firestoreId, areaData);
                }
            }
        } catch (error) {
            console.error('エリア保存エラー:', error);
        }
    }

    /**
     * エリアをFirebaseから削除
     * @param {string} firestoreId - Firestore ID
     */
    async deleteAreaFromFirebase(firestoreId) {
        if (!window.firestoreManager || !this.currentImage || !firestoreId) return;
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) return;

        try {
            await window.firestoreManager.deleteArea(projectId, firestoreId);
        } catch (error) {
            console.error('エリア削除エラー:', error);
        }
    }

    /**
     * Firebaseからデータを読み込み
     * @param {Function} onLoadComplete - 読み込み完了時のコールバック
     */
    async loadFromFirebase(onLoadComplete) {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            UIHelper.showError('Firebase接続が利用できません');
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            UIHelper.showError('先に画像を読み込んでください');
            return;
        }

        try {
            // プロジェクトIDを画像ファイル名から取得
            const projectId = this.fileHandler.getCurrentImageFileName();
            if (!projectId) {
                UIHelper.showError('画像ファイル名を取得できません');
                return;
            }

            // プロジェクトの存在確認
            const projectMetadata = await window.firestoreManager.getProjectMetadata(projectId);
            if (!projectMetadata) {
                UIHelper.showWarning(`画像 ${projectId} に対するデータがありません`);
                // データがない場合でも処理を続行（新規プロジェクトとして扱う）
                if (onLoadComplete) {
                    onLoadComplete(0, 0, 0);
                }
                return;
            }

            // 既存データをクリア
            if (this.pointManager.getPoints().length > 0 ||
                this.routeManager.getRoutePoints().length > 0 ||
                this.spotManager.getSpots().length > 0) {
                const confirmed = confirm('現在のデータを削除して読み込みますか？');
                if (!confirmed) {
                    return;
                }
            }

            this.pointManager.clearPoints();
            this.routeManager.clearAllRoutes();
            this.spotManager.clearSpots();
            this.areaManager.clearAreas();

            // ポイントを読み込み（画像座標→キャンバス座標に変換）
            const points = await window.firestoreManager.getPoints(projectId);
            let loadedPoints = 0;
            for (const point of points) {
                // 空白IDはスキップ
                if (!point.id || point.id.trim() === '') {
                    continue;
                }

                // 画像座標からキャンバス座標に変換
                const canvasCoords = CoordinateUtils.imageToCanvas(
                    point.x, point.y,
                    this.canvas.width, this.canvas.height,
                    this.currentImage.width, this.currentImage.height
                );

                this.pointManager.addPoint(canvasCoords.x, canvasCoords.y, point.id);
                loadedPoints++;
            }

            // ルートを読み込み（画像座標→キャンバス座標に変換）
            const routes = await window.firestoreManager.getRoutes(projectId);
            let loadedRoutes = 0;
            for (const route of routes) {
                // 中間点の座標変換
                const convertedWaypoints = [];
                for (const waypoint of route.waypoints) {
                    // 画像座標からキャンバス座標に変換
                    const canvasCoords = CoordinateUtils.imageToCanvas(
                        waypoint.x, waypoint.y,
                        this.canvas.width, this.canvas.height,
                        this.currentImage.width, this.currentImage.height
                    );
                    convertedWaypoints.push({ x: canvasCoords.x, y: canvasCoords.y });
                }

                // ルートオブジェクトを作成してRouteManagerに追加
                // FirestoreIDを保持して、更新時に使用できるようにする
                this.routeManager.addRoute({
                    firestoreId: route.firestoreId,  // FirestoreドキュメントIDを保持
                    routeName: route.routeName || `${route.startPoint} ～ ${route.endPoint}`,
                    startPointId: route.startPoint,
                    endPointId: route.endPoint,
                    routePoints: convertedWaypoints
                });
                loadedRoutes++;
            }

            // スポットを読み込み（画像座標→キャンバス座標に変換）
            const spots = await window.firestoreManager.getSpots(projectId);
            let loadedSpots = 0;
            for (const spot of spots) {
                // 空白名はスキップ
                if (!spot.name || spot.name.trim() === '') {
                    continue;
                }

                // 画像座標からキャンバス座標に変換
                const canvasCoords = CoordinateUtils.imageToCanvas(
                    spot.x, spot.y,
                    this.canvas.width, this.canvas.height,
                    this.currentImage.width, this.currentImage.height
                );

                this.spotManager.addSpot(canvasCoords.x, canvasCoords.y, spot.name);
                loadedSpots++;

            }

            // エリアを読み込み
            if (window.firestoreManager.getAreas) {
                const areas = await window.firestoreManager.getAreas(projectId);
                let loadedAreas = 0;
                for (const area of areas) {
                    const convertedVertices = [];
                    if (area.vertices) {
                        for (const vertex of area.vertices) {
                            const canvasCoords = CoordinateUtils.imageToCanvas(
                                vertex.x, vertex.y,
                                this.canvas.width, this.canvas.height,
                                this.currentImage.width, this.currentImage.height
                            );
                            convertedVertices.push({ x: canvasCoords.x, y: canvasCoords.y });
                        }
                    }

                    this.areaManager.addArea({
                        firestoreId: area.firestoreId,
                        areaName: area.areaName,
                        vertices: convertedVertices
                    });
                    loadedAreas++;
                }
            }

            // 読み込み完了コールバックを実行
            if (onLoadComplete) {
                onLoadComplete(loadedPoints, loadedRoutes, loadedSpots);
            }

            const fbLoadParts = [];
            if (loadedPoints > 0) fbLoadParts.push(`ポイント${loadedPoints}件`);
            if (loadedRoutes > 0) fbLoadParts.push(`ルート${loadedRoutes}件`);
            if (loadedSpots > 0) fbLoadParts.push(`スポット${loadedSpots}件`);
            const fbLoadDetail = fbLoadParts.length > 0 ? fbLoadParts.join('、') : 'データなし';
            UIHelper.showMessage(`読み込み完了: ${fbLoadDetail}`);

        } catch (error) {
            UIHelper.showError('読み込み中にエラーが発生しました: ' + error.message);
        }
    }

    /**
     * すべてのデータをFirebaseに保存
     */
    async saveAllToFirebase() {
        if (!window.firestoreManager || !this.currentImage) {
            UIHelper.showError('Firebase接続または画像がありません');
            return;
        }

        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            UIHelper.showError('プロジェクトIDが不明です');
            return;
        }

        try {
            // プロジェクトメタデータ更新
            const metadata = {
                projectName: projectId,
                imageName: projectId + '.png',
                imageWidth: this.currentImage.width,
                imageHeight: this.currentImage.height,
                lastAccessedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const existingProject = await window.firestoreManager.getProjectMetadata(projectId);
            if (!existingProject) {
                await window.firestoreManager.createProjectMetadata(projectId, metadata);
            } else {
                await window.firestoreManager.updateProjectMetadata(projectId, metadata);
            }

            // ポイント保存
            const points = this.pointManager.getPoints();
            for (let i = 0; i < points.length; i++) {
                await this.updatePointToFirebase(i);
            }

            // ルート保存
            const routes = this.routeManager.getAllRoutes();
            for (let i = 0; i < routes.length; i++) {
                await this.updateRouteToFirebase(i);
            }

            // スポット保存
            const spots = this.spotManager.getSpots();
            for (let i = 0; i < spots.length; i++) {
                await this.updateSpotToFirebase(i);
            }

            // エリア保存
            const areas = this.areaManager.getAllAreas();
            for (let i = 0; i < areas.length; i++) {
                await this.updateAreaToFirebase(i);
            }

            UIHelper.showMessage('すべてのデータをデータベースに保存しました', 'success');

        } catch (error) {
            console.error('全データ保存エラー:', error);
            UIHelper.showError('保存中にエラーが発生しました');
        }
    }
}

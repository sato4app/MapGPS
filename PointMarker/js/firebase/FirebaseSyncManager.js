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
     * @param {Object} fileHandler - FileHandlerインスタンス
     */
    constructor(pointManager, spotManager, routeManager, fileHandler) {
        this.pointManager = pointManager;
        this.spotManager = spotManager;
        this.routeManager = routeManager;
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

            // 読み込み完了コールバックを実行
            if (onLoadComplete) {
                onLoadComplete(loadedPoints, loadedRoutes, loadedSpots);
            }

            UIHelper.showMessage(
                `読み込み完了: ポイント${loadedPoints}件、ルート${loadedRoutes}件、スポット${loadedSpots}件`
            );

        } catch (error) {
            UIHelper.showError('読み込み中にエラーが発生しました: ' + error.message);
        }
    }
}

import { Validators } from '../utils/Validators.js';
import { BaseManager } from '../core/BaseManager.js';

/**
 * ルートデータの管理を行うクラス（複数ルート対応）
 */
export class RouteManager extends BaseManager {
    constructor() {
        super();
        // 複数ルートを管理
        this.routes = [];
        // 現在選択されているルートのインデックス（-1 = 未選択）
        this.selectedRouteIndex = -1;
    }

    /**
     * 全ルートを取得
     * @returns {Array} 全ルートの配列
     */
    getAllRoutes() {
        return this.routes;
    }

    /**
     * 選択中のルートを取得
     * @returns {Object|null} 選択中のルート、または null
     */
    getSelectedRoute() {
        if (this.selectedRouteIndex >= 0 && this.selectedRouteIndex < this.routes.length) {
            return this.routes[this.selectedRouteIndex];
        }
        return null;
    }

    /**
     * ルートを選択
     * @param {number} index - ルートのインデックス（-1 = 未選択）
     */
    selectRoute(index) {
        this.selectedRouteIndex = index;
        this.notify('onSelectionChange', index);

        // 選択されたルートの開始・終了ポイントを設定
        if (index >= 0 && index < this.routes.length) {
            const route = this.routes[index];
            this.notify('onStartEndChange', {
                start: route.startPointId,
                end: route.endPointId
            });
            this.notify('onCountChange', route.routePoints ? route.routePoints.length : 0);
        } else {
            // 未選択の場合はクリア
            this.notify('onStartEndChange', { start: '', end: '' });
            this.notify('onCountChange', 0);
        }
        this.notify('onChange');
    }

    /**
     * ルートを追加
     * @param {Object} route - ルートデータ {startPointId, endPointId, routePoints, routeName}
     */
    addRoute(route) {
        // isModifiedフラグを初期化（デフォルト: false）
        if (route.isModified === undefined) {
            route.isModified = false;
        }
        this.routes.push(route);
        this.notify('onRouteListChange', this.routes);
    }

    /**
     * ルートを削除
     * @param {number} index - 削除するルートのインデックス
     */
    deleteRoute(index) {
        if (index < 0 || index >= this.routes.length) {
            console.warn('Invalid route index:', index);
            return;
        }

        this.routes.splice(index, 1);

        // 削除したルートが選択中だった場合、選択を解除
        if (this.selectedRouteIndex === index) {
            this.selectedRouteIndex = -1;
            this.notify('onStartEndChange', { start: '', end: '' });
            this.notify('onCountChange', 0);
            this.notify('onSelectionChange', -1);
        } else if (this.selectedRouteIndex > index) {
            // 削除したルートより後ろのルートが選択されていた場合、インデックスを調整
            this.selectedRouteIndex--;
            this.notify('onSelectionChange', this.selectedRouteIndex);
        }

        this.notify('onRouteListChange', this.routes);
        this.notify('onChange');
    }

    /**
     * ルート中間点を追加（選択中のルートにのみ追加）
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @returns {Object} 追加されたポイント
     */
    addRoutePoint(x, y) {
        const selectedRoute = this.getSelectedRoute();
        if (!selectedRoute) {
            console.warn('No route selected. Cannot add route point.');
            this.notify('onNoRouteSelected', 'ルートを選択してから中間点を追加してください');
            return null;
        }

        const point = {
            x: Math.round(x),
            y: Math.round(y)
        };

        if (!selectedRoute.routePoints) {
            selectedRoute.routePoints = [];
        }
        selectedRoute.routePoints.push(point);
        this.notify('onChange');
        this.notify('onCountChange', selectedRoute.routePoints.length);

        // 更新状態をチェック
        this.checkAndUpdateModifiedState();

        return point;
    }

    /**
     * 指定位置に最も近いルート中間点を検索（選択中のルートのみ）
     * @param {number} x - X座標（キャンバス座標）
     * @param {number} y - Y座標（キャンバス座標）
     * @param {number} threshold - 判定閾値（デフォルト: 10px）
     * @returns {{index: number, point: Object} | null} 見つかった中間点と配列インデックス、見つからない場合はnull
     */
    findRoutePointAt(x, y, threshold = 10) {
        const selectedRoute = this.getSelectedRoute();
        if (!selectedRoute || !selectedRoute.routePoints) {
            return null;
        }

        for (let i = 0; i < selectedRoute.routePoints.length; i++) {
            const point = selectedRoute.routePoints[i];
            const dx = point.x - x;
            const dy = point.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= threshold) {
                return { index: i, point: point };
            }
        }
        return null;
    }

    /**
     * 指定座標に最も近いルート中間点を検索（選択中のルートのみ）
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {number} maxDistance - 最大検索距離（これを超えると検索対象外）
     * @returns {{index: number, point: Object, distance: number} | null} 最も近い中間点情報
     */
    findNearestRoutePoint(x, y, maxDistance = 50) {
        const selectedRoute = this.getSelectedRoute();
        if (!selectedRoute || !selectedRoute.routePoints || selectedRoute.routePoints.length === 0) {
            return null;
        }

        let nearestIndex = -1;
        let nearestDistance = Infinity;
        let nearestPoint = null;

        for (let i = 0; i < selectedRoute.routePoints.length; i++) {
            const point = selectedRoute.routePoints[i];
            const dx = point.x - x;
            const dy = point.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < nearestDistance && distance <= maxDistance) {
                nearestDistance = distance;
                nearestIndex = i;
                nearestPoint = point;
            }
        }

        if (nearestIndex !== -1) {
            return { index: nearestIndex, point: nearestPoint, distance: nearestDistance };
        }
        return null;
    }

    /**
     * 指定矩形内のルート中間点を検索（選択中のルートのみ）
     * @param {number} x1 - 矩形の開始点X座標
     * @param {number} y1 - 矩形の開始点Y座標
     * @param {number} x2 - 矩形の終了点X座標
     * @param {number} y2 - 矩形の終了点Y座標
     * @returns {Array<{index: number, point: Object}>} 矩形内の中間点配列（インデックス降順）
     */
    findRoutePointsInRectangle(x1, y1, x2, y2) {
        const selectedRoute = this.getSelectedRoute();
        if (!selectedRoute || !selectedRoute.routePoints || selectedRoute.routePoints.length === 0) {
            return [];
        }

        const pointsInRect = [];

        // 矩形の左上・右下座標を計算
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);

        for (let i = 0; i < selectedRoute.routePoints.length; i++) {
            const point = selectedRoute.routePoints[i];

            // 矩形内判定
            if (point.x >= left && point.x <= right &&
                point.y >= top && point.y <= bottom) {
                pointsInRect.push({ index: i, point: point });
            }
        }

        // インデックスの降順でソート（削除時に配列が崩れないように）
        pointsInRect.sort((a, b) => b.index - a.index);

        return pointsInRect;
    }

    /**
     * ルート中間点の座標を更新（選択中のルートのみ）
     * @param {number} index - 中間点の配列インデックス
     * @param {number} x - 新しいX座標
     * @param {number} y - 新しいY座標
     */
    updateRoutePoint(index, x, y) {
        const selectedRoute = this.getSelectedRoute();
        if (!selectedRoute || !selectedRoute.routePoints) {
            return;
        }

        if (index >= 0 && index < selectedRoute.routePoints.length) {
            selectedRoute.routePoints[index].x = Math.round(x);
            selectedRoute.routePoints[index].y = Math.round(y);
            this.notify('onChange');

            // 更新状態をチェック
            this.checkAndUpdateModifiedState();
        }
    }

    /**
     * ルート中間点を削除（選択中のルートのみ）
     * @param {number} index - 削除する中間点の配列インデックス
     * @returns {boolean} 削除成功したかどうか
     */
    removeRoutePoint(index) {
        const selectedRoute = this.getSelectedRoute();
        if (!selectedRoute || !selectedRoute.routePoints) {
            return false;
        }

        if (index >= 0 && index < selectedRoute.routePoints.length) {
            selectedRoute.routePoints.splice(index, 1);
            this.notify('onChange');
            this.notify('onCountChange', selectedRoute.routePoints.length);

            // 更新状態をチェック
            this.checkAndUpdateModifiedState();
            return true;
        }
        return false;
    }

    /**
     * 複数のルート中間点を一括削除（選択中のルートのみ）
     * @param {Array<number>} indices - 削除する中間点のインデックス配列（降順推奨）
     * @returns {number} 削除した中間点の数
     */
    removeRoutePoints(indices) {
        const selectedRoute = this.getSelectedRoute();
        if (!selectedRoute || !selectedRoute.routePoints) {
            return 0;
        }

        let deletedCount = 0;

        // インデックスを降順でソート（配列崩れ防止）
        const sortedIndices = [...indices].sort((a, b) => b - a);

        for (const index of sortedIndices) {
            if (index >= 0 && index < selectedRoute.routePoints.length) {
                selectedRoute.routePoints.splice(index, 1);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            this.notify('onChange');
            this.notify('onCountChange', selectedRoute.routePoints.length);
            this.checkAndUpdateModifiedState();
        }

        return deletedCount;
    }

    /**
     * ルート中間点のみをクリア（開始・終了ポイントは保持）
     */
    clearRoutePoints() {
        const selectedRoute = this.getSelectedRoute();
        if (selectedRoute) {
            selectedRoute.routePoints = [];
            this.notify('onChange');
            this.notify('onCountChange', 0);
        }
    }

    /**
     * 選択中のルート情報を全てクリア（開始・終了ポイント含む）
     */
    clearRoute() {
        const selectedRoute = this.getSelectedRoute();
        if (selectedRoute) {
            selectedRoute.routePoints = [];
            selectedRoute.startPointId = '';
            selectedRoute.endPointId = '';
            this.notify('onChange');
            this.notify('onCountChange', 0);
            this.notify('onStartEndChange', { start: '', end: '' });
        }
    }

    /**
     * 全ルートをクリア
     */
    clearAllRoutes() {
        this.routes = [];
        this.selectedRouteIndex = -1;
        this.notify('onChange');
        this.notify('onCountChange', 0);
        this.notify('onStartEndChange', { start: '', end: '' });
        this.notify('onRouteListChange', []);
        this.notify('onSelectionChange', -1);
    }

    /**
     * 開始ポイントIDを設定（選択中のルートのみ）
     * @param {string} id - 開始ポイントID
     * @param {boolean} skipFormatting - フォーマット処理をスキップするかどうか (デフォルト: false)
     */
    setStartPoint(id, skipFormatting = false) {
        const selectedRoute = this.getSelectedRoute();
        if (!selectedRoute) {
            console.warn('No route selected. Cannot set start point.');
            return;
        }

        selectedRoute.startPointId = skipFormatting ? id : Validators.formatPointId(id);

        // 開始・終了ポイントが両方設定されている場合、ルート名を更新
        this.updateRouteNameIfComplete();

        this.notify('onStartEndChange', {
            start: selectedRoute.startPointId,
            end: selectedRoute.endPointId
        });
    }

    /**
     * 終了ポイントIDを設定（選択中のルートのみ）
     * @param {string} id - 終了ポイントID
     * @param {boolean} skipFormatting - フォーマット処理をスキップするかどうか (デフォルト: false)
     */
    setEndPoint(id, skipFormatting = false) {
        const selectedRoute = this.getSelectedRoute();
        if (!selectedRoute) {
            console.warn('No route selected. Cannot set end point.');
            return;
        }

        selectedRoute.endPointId = skipFormatting ? id : Validators.formatPointId(id);

        // 開始・終了ポイントが両方設定されている場合、ルート名を更新
        this.updateRouteNameIfComplete();

        this.notify('onStartEndChange', {
            start: selectedRoute.startPointId,
            end: selectedRoute.endPointId
        });
    }

    /**
     * 開始・終了ポイントが両方設定されている場合、ルート名を更新
     */
    updateRouteNameIfComplete() {
        const selectedRoute = this.getSelectedRoute();
        if (!selectedRoute) return;

        if (selectedRoute.startPointId && selectedRoute.endPointId) {
            selectedRoute.routeName = `${selectedRoute.startPointId} ～ ${selectedRoute.endPointId}`;
            this.notify('onRouteListChange', this.routes);
            // 更新状態をチェック
            this.checkAndUpdateModifiedState();
        }
    }

    /**
     * ルートの更新状態をチェックして必要に応じてフラグを設定
     * 更新基準:
     * - 開始ポイント、終了ポイントの指定があり、ルート中間点が追加・移動された
     * - ルート中間点があり、開始ポイントと終了ポイントが指定された
     */
    checkAndUpdateModifiedState() {
        const selectedRoute = this.getSelectedRoute();
        if (!selectedRoute) return;

        const hasStartEnd = selectedRoute.startPointId && selectedRoute.endPointId;
        const hasWaypoints = selectedRoute.routePoints && selectedRoute.routePoints.length > 0;

        // 更新基準を満たす場合、isModifiedフラグを立てる
        if (hasStartEnd && hasWaypoints) {
            if (!selectedRoute.isModified) {
                selectedRoute.isModified = true;
                this.notify('onModifiedStateChange', { isModified: true, routeIndex: this.selectedRouteIndex });
                this.notify('onRouteListChange', this.routes);
            }
        }
    }

    /**
     * ルートの更新フラグをクリア（保存完了時などに使用）
     */
    clearModifiedFlag() {
        const selectedRoute = this.getSelectedRoute();
        if (selectedRoute && selectedRoute.isModified) {
            selectedRoute.isModified = false;
            this.notify('onModifiedStateChange', { isModified: false, routeIndex: this.selectedRouteIndex });
            this.notify('onRouteListChange', this.routes);
        }
    }

    /**
     * ルートポイント配列を取得（選択中のルートのみ）
     * @returns {Array} ルートポイント配列
     */
    getRoutePoints() {
        const selectedRoute = this.getSelectedRoute();
        return selectedRoute && selectedRoute.routePoints ? selectedRoute.routePoints : [];
    }

    /**
     * 開始・終了ポイントIDを取得（選択中のルートのみ）
     * @returns {{start: string, end: string}} 開始・終了ポイントID
     */
    getStartEndPoints() {
        const selectedRoute = this.getSelectedRoute();
        if (selectedRoute) {
            return {
                start: selectedRoute.startPointId || '',
                end: selectedRoute.endPointId || ''
            };
        }
        return { start: '', end: '' };
    }

    /**
     * 開始・終了ポイントの検証（選択中のルートのみ）
     * @param {Array} registeredIds - 登録済みポイントID配列
     * @param {Object} spotManager - スポットマネージャー（オプション）
     * @returns {{isValid: boolean, message?: string}} 検証結果
     */
    validateStartEndPoints(registeredIds, spotManager = null) {
        const selectedRoute = this.getSelectedRoute();
        if (!selectedRoute) {
            return {
                isValid: false,
                message: 'ルートが選択されていません。'
            };
        }

        const startPointId = selectedRoute.startPointId || '';
        const endPointId = selectedRoute.endPointId || '';

        // 開始ポイントのチェック
        if (startPointId) {
            const isRegisteredAsPoint = registeredIds.includes(startPointId);
            let isRegisteredAsSpot = false;

            // スポット名として登録されているかチェック
            if (spotManager) {
                const allSpots = spotManager.getSpots();
                isRegisteredAsSpot = allSpots.some(spot => spot.name === startPointId);
            }

            if (!isRegisteredAsPoint && !isRegisteredAsSpot) {
                return {
                    isValid: false,
                    message: `開始ポイント "${startPointId}" がポイントまたはスポットとして登録されていません。先にポイント編集モードまたはスポット編集モードで登録してください。`
                };
            }
        }

        // 終了ポイントのチェック
        if (endPointId) {
            const isRegisteredAsPoint = registeredIds.includes(endPointId);
            let isRegisteredAsSpot = false;

            // スポット名として登録されているかチェック
            if (spotManager) {
                const allSpots = spotManager.getSpots();
                isRegisteredAsSpot = allSpots.some(spot => spot.name === endPointId);
            }

            if (!isRegisteredAsPoint && !isRegisteredAsSpot) {
                return {
                    isValid: false,
                    message: `終了ポイント "${endPointId}" がポイントまたはスポットとして登録されていません。先にポイント編集モードまたはスポット編集モードで登録してください。`
                };
            }
        }

        if (!startPointId || !endPointId) {
            return {
                isValid: false,
                message: '開始ポイントと終了ポイントの両方を設定してください。'
            };
        }

        // 中間点が1つ以上あることをチェック
        const routePoints = selectedRoute.routePoints || [];
        if (routePoints.length < 1) {
            return {
                isValid: false,
                message: 'ルートを作成するには中間点が1つ以上必要です。地図上をクリックして中間点を追加してください。'
            };
        }

        return { isValid: true };
    }

    /**
     * ルート用のデフォルトファイル名を生成
     * @param {string} imageFileName - 画像ファイル名
     * @returns {string} ルートファイル名
     */
    generateRouteFilename(imageFileName) {
        const selectedRoute = this.getSelectedRoute();
        const baseFileName = imageFileName || 'route';
        const startPoint = (selectedRoute && selectedRoute.startPointId) || 'start';
        const endPoint = (selectedRoute && selectedRoute.endPointId) || 'end';
        return `${baseFileName}_route_${startPoint}_to_${endPoint}.json`;
    }

}

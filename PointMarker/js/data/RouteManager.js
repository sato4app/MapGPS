import { CoordinateUtils } from '../utils/Coordinates.js';
import { Validators } from '../utils/Validators.js';

/**
 * ルートデータの管理を行うクラス
 */
export class RouteManager {
    constructor() {
        this.routePoints = [];
        this.startPointId = '';
        this.endPointId = '';
        this.callbacks = {
            onChange: null,
            onCountChange: null,
            onStartEndChange: null
        };
    }

    /**
     * コールバック関数を設定
     * @param {string} event - イベント名
     * @param {Function} callback - コールバック関数
     */
    setCallback(event, callback) {
        this.callbacks[event] = callback;
    }

    /**
     * 変更通知を発行
     * @param {string} event - イベント名
     * @param {any} data - イベントデータ
     */
    notify(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event](data);
        }
    }

    /**
     * ルート中間点を追加
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @returns {Object} 追加されたポイント
     */
    addRoutePoint(x, y) {
        const point = {
            x: Math.round(x),
            y: Math.round(y)
        };

        this.routePoints.push(point);
        this.notify('onChange', this.routePoints);
        this.notify('onCountChange', this.routePoints.length);
        return point;
    }

    /**
     * 指定位置に最も近いルート中間点を検索
     * @param {number} x - X座標（キャンバス座標）
     * @param {number} y - Y座標（キャンバス座標）
     * @param {number} threshold - 判定閾値（デフォルト: 10px）
     * @returns {{index: number, point: Object} | null} 見つかった中間点と配列インデックス、見つからない場合はnull
     */
    findRoutePointAt(x, y, threshold = 10) {
        for (let i = 0; i < this.routePoints.length; i++) {
            const point = this.routePoints[i];
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
     * ルート中間点の座標を更新
     * @param {number} index - 中間点の配列インデックス
     * @param {number} x - 新しいX座標
     * @param {number} y - 新しいY座標
     */
    updateRoutePoint(index, x, y) {
        if (index >= 0 && index < this.routePoints.length) {
            this.routePoints[index].x = Math.round(x);
            this.routePoints[index].y = Math.round(y);
            this.notify('onChange', this.routePoints);
        }
    }

    /**
     * ルート中間点のみをクリア（開始・終了ポイントは保持）
     */
    clearRoutePoints() {
        this.routePoints = [];
        this.notify('onChange', this.routePoints);
        this.notify('onCountChange', 0);
    }

    /**
     * ルート情報を全てクリア（開始・終了ポイント含む）
     */
    clearRoute() {
        this.routePoints = [];
        this.startPointId = '';
        this.endPointId = '';
        this.notify('onChange', this.routePoints);
        this.notify('onCountChange', 0);
        this.notify('onStartEndChange', { start: '', end: '' });
    }

    /**
     * 開始ポイントIDを設定
     * @param {string} id - 開始ポイントID
     * @param {boolean} skipFormatting - フォーマット処理をスキップするかどうか (デフォルト: false)
     * @example
     * // 入力時（フォーマット処理なし）
     * routeManager.setStartPoint('J-1', true);  // → 'J-1'
     * 
     * // blur時（フォーマット処理あり）
     * routeManager.setStartPoint('J-1');  // → 'J-01'
     */
    setStartPoint(id, skipFormatting = false) {
        this.startPointId = skipFormatting ? id : Validators.formatPointId(id);
        this.notify('onStartEndChange', { 
            start: this.startPointId, 
            end: this.endPointId 
        });
    }

    /**
     * 終了ポイントIDを設定
     * @param {string} id - 終了ポイントID
     * @param {boolean} skipFormatting - フォーマット処理をスキップするかどうか (デフォルト: false)
     * @example
     * // 入力時（フォーマット処理なし）
     * routeManager.setEndPoint('A-2', true);  // → 'A-2'
     * 
     * // blur時（フォーマット処理あり）
     * routeManager.setEndPoint('A-2');  // → 'A-02'
     */
    setEndPoint(id, skipFormatting = false) {
        this.endPointId = skipFormatting ? id : Validators.formatPointId(id);
        this.notify('onStartEndChange', { 
            start: this.startPointId, 
            end: this.endPointId 
        });
    }

    /**
     * ルートポイント配列を取得
     * @returns {Array} ルートポイント配列
     */
    getRoutePoints() {
        return this.routePoints;
    }

    /**
     * 開始・終了ポイントIDを取得
     * @returns {{start: string, end: string}} 開始・終了ポイントID
     */
    getStartEndPoints() {
        return {
            start: this.startPointId,
            end: this.endPointId
        };
    }

    /**
     * 開始・終了ポイントの検証
     * @param {Array} registeredIds - 登録済みポイントID配列
     * @param {Object} spotManager - スポットマネージャー（オプション）
     * @returns {{isValid: boolean, message?: string}} 検証結果
     */
    validateStartEndPoints(registeredIds, spotManager = null) {
        // 開始ポイントのチェック
        if (this.startPointId) {
            const isRegisteredAsPoint = registeredIds.includes(this.startPointId);
            let isRegisteredAsSpot = false;

            // スポット名として登録されているかチェック
            if (spotManager) {
                const allSpots = spotManager.getSpots();
                isRegisteredAsSpot = allSpots.some(spot => spot.name === this.startPointId);
            }

            if (!isRegisteredAsPoint && !isRegisteredAsSpot) {
                return {
                    isValid: false,
                    message: `開始ポイント "${this.startPointId}" がポイントまたはスポットとして登録されていません。先にポイント編集モードまたはスポット編集モードで登録してください。`
                };
            }
        }

        // 終了ポイントのチェック
        if (this.endPointId) {
            const isRegisteredAsPoint = registeredIds.includes(this.endPointId);
            let isRegisteredAsSpot = false;

            // スポット名として登録されているかチェック
            if (spotManager) {
                const allSpots = spotManager.getSpots();
                isRegisteredAsSpot = allSpots.some(spot => spot.name === this.endPointId);
            }

            if (!isRegisteredAsPoint && !isRegisteredAsSpot) {
                return {
                    isValid: false,
                    message: `終了ポイント "${this.endPointId}" がポイントまたはスポットとして登録されていません。先にポイント編集モードまたはスポット編集モードで登録してください。`
                };
            }
        }

        if (!this.startPointId || !this.endPointId) {
            return {
                isValid: false,
                message: '開始ポイントと終了ポイントの両方を設定してください。'
            };
        }

        // 中間点が1つ以上あることをチェック
        if (this.routePoints.length < 1) {
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
        const baseFileName = imageFileName || 'route';
        const startPoint = this.startPointId || 'start';
        const endPoint = this.endPointId || 'end';
        return `${baseFileName}_route_${startPoint}_to_${endPoint}.json`;
    }

}
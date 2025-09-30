import { CoordinateUtils } from '../utils/Coordinates.js';
import { Validators } from '../utils/Validators.js';

/**
 * ポイントデータの管理を行うクラス
 */
export class PointManager {
    constructor() {
        this.points = [];
        this.callbacks = {
            onChange: null,
            onCountChange: null
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
     * @param {...any} args - 追加パラメータ
     */
    notify(event, data, ...args) {
        if (this.callbacks[event]) {
            this.callbacks[event](data, ...args);
        }
    }

    /**
     * ポイントを追加
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {string} id - ポイントID
     * @returns {Object} 追加されたポイント
     */
    addPoint(x, y, id = '') {
        const point = { 
            x: Math.round(x), 
            y: Math.round(y),
            id
        };
        
        this.points.push(point);
        this.notify('onChange', this.points);
        this.notify('onCountChange', this.getUserPointCount());
        return point;
    }

    /**
     * 指定インデックスのポイントを削除
     * @param {number} index - 削除するポイントのインデックス
     */
    removePoint(index) {
        if (index >= 0 && index < this.points.length) {
            this.points.splice(index, 1);
            this.notify('onChange', this.points);
            this.notify('onCountChange', this.getUserPointCount());
        }
    }

    /**
     * ポイントIDを更新
     * @param {number} index - 更新するポイントのインデックス
     * @param {string} newId - 新しいID
     * @param {boolean} skipFormatting - フォーマット処理をスキップするかどうか (デフォルト: false)
     * @param {boolean} skipRedrawInput - 入力ボックスの再描画をスキップするかどうか (デフォルト: false)
     * @example
     * // 入力時（フォーマット処理なし）
     * pointManager.updatePointId(0, 'J-1', true);  // → 'J-1'
     * 
     * // blur時（フォーマット処理あり）
     * pointManager.updatePointId(0, 'J-1');  // → 'J-01'
     */
    updatePointId(index, newId, skipFormatting = false, skipRedrawInput = false) {
        if (index >= 0 && index < this.points.length) {
            this.points[index].id = skipFormatting ? newId : Validators.formatPointId(newId);
            // skipRedrawInputがtrueの場合はonChange通知を送らない（入力中のフォーカス保持のため）
            if (!skipRedrawInput) {
                this.notify('onChange', this.points, skipRedrawInput);
            }
        }
    }

    /**
     * すべてのポイントをクリア
     */
    clearPoints() {
        this.points = [];
        this.notify('onChange', this.points);
        this.notify('onCountChange', 0);
    }

    /**
     * すべてのポイントID名を補正し、ブランクのポイントを削除
     */
    formatAllPointIds() {
        // まず、ID名のフォーマット補正を実行
        this.points.forEach(point => {
            if (point.id) {
                point.id = Validators.formatPointId(point.id);
            }
        });
        
        // 次に、ID名がブランクまたは空のポイントを削除
        const initialLength = this.points.length;
        this.points = this.points.filter(point => {
            return point.id && point.id.trim() !== '';
        });
        
        // ポイント数が変更された場合は数の更新通知も送信
        if (this.points.length !== initialLength) {
            this.notify('onCountChange', this.getUserPointCount());
        }
        
        this.notify('onChange', this.points);
    }

    /**
     * ポイント配列を取得
     * @returns {Array} ポイント配列
     */
    getPoints() {
        return this.points;
    }

    /**
     * ポイント数を取得
     * @returns {number} ポイント数
     */
    getUserPointCount() {
        return this.points.length;
    }

    /**
     * 指定IDのポイントを検索
     * @param {string} id - 検索するポイントID
     * @returns {Object|null} 見つかったポイント、またはnull
     */
    findPointById(id) {
        return this.points.find(point => point.id === id) || null;
    }

    /**
     * 登録されている全ポイントIDを取得
     * @returns {Array} ポイントID配列
     */
    getRegisteredIds() {
        return this.points
            .map(point => point.id)
            .filter(id => id.trim() !== '');
    }

    /**
     * 末尾の未入力ポイントを削除
     */
    removeTrailingEmptyUserPoints() {
        if (this.points.length === 0) return;
        
        let removed = false;
        for (let i = this.points.length - 1; i >= 0; i--) {
            const point = this.points[i];
            if ((point.id ?? '') === '') {
                this.points.splice(i, 1);
                removed = true;
            } else {
                break;
            }
        }
        
        if (removed) {
            this.notify('onChange', this.points);
            this.notify('onCountChange', this.getUserPointCount());
        }
    }

}
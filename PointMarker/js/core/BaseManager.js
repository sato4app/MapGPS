/**
 * すべてのマネージャークラスの基底クラス
 * コールバック機能を統一管理
 */
export class BaseManager {
    constructor() {
        this.callbacks = {};
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
     * @param {...any} args - コールバック関数に渡す引数
     */
    notify(event, ...args) {
        if (this.callbacks[event]) {
            this.callbacks[event](...args);
        }
    }
}

import { CoordinateUtils } from '../utils/Coordinates.js';
import { Validators } from '../utils/Validators.js';

/**
 * スポット管理クラス
 * 名称を持つ地図上の特定の点（スポット）の管理を行う
 */
export class SpotManager {
    constructor() {
        this.spots = [];
        this.callbacks = {};
    }

    /**
     * コールバックを設定
     * @param {string} event - イベント名
     * @param {Function} callback - コールバック関数
     */
    setCallback(event, callback) {
        this.callbacks[event] = callback;
    }

    /**
     * コールバックを実行
     * @param {string} event - イベント名
     * @param {*} data - コールバックに渡すデータ
     */
    notify(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event](data);
        }
    }

    /**
     * スポットを追加
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {string} name - スポット名（デフォルト: 空文字列）
     * @returns {Object} 追加されたスポット
     */
    addSpot(x, y, name = '') {
        const spot = {
            x: Math.round(x),
            y: Math.round(y),
            name: name,
            index: this.spots.length
        };
        
        this.spots.push(spot);
        this.notify('onChange');
        this.notify('onCountChange', this.spots.length);
        
        return spot;
    }

    /**
     * スポットを削除
     * @param {number} index - スポットのインデックス
     */
    removeSpot(index) {
        if (index >= 0 && index < this.spots.length) {
            this.spots.splice(index, 1);
            // インデックスを再割り当て
            this.spots.forEach((spot, i) => {
                spot.index = i;
            });
            
            this.notify('onChange');
            this.notify('onCountChange', this.spots.length);
        }
    }

    /**
     * 全スポットをクリア
     */
    clearSpots() {
        this.spots = [];
        this.notify('onChange');
        this.notify('onCountChange', 0);
    }

    /**
     * スポットリストを取得
     * @returns {Array} スポットの配列
     */
    getSpots() {
        return this.spots;
    }

    /**
     * スポット数を取得
     * @returns {number} スポット数
     */
    getSpotCount() {
        return this.spots.length;
    }

    /**
     * 指定した座標にスポットが存在するかチェック
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {number} tolerance - 許容誤差（デフォルト8px）
     * @returns {number} スポットのインデックス、存在しない場合は-1
     */
    findSpotAt(x, y, tolerance = 8) {
        for (let i = 0; i < this.spots.length; i++) {
            const spot = this.spots[i];
            const dx = x - spot.x;
            const dy = y - spot.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= tolerance) {
                return i;
            }
        }
        return -1;
    }

    /**
     * スポットの位置を更新
     * @param {number} index - スポットのインデックス
     * @param {number} x - 新しいX座標
     * @param {number} y - 新しいY座標
     */
    updateSpotPosition(index, x, y) {
        if (index >= 0 && index < this.spots.length) {
            this.spots[index].x = Math.round(x);
            this.spots[index].y = Math.round(y);
            this.notify('onChange');
        }
    }

    /**
     * スポット名を更新
     * @param {number} index - スポットのインデックス
     * @param {string} name - 新しいスポット名
     * @param {boolean} skipFormatting - フォーマット処理をスキップするか
     * @param {boolean} skipRedrawInput - 入力ボックスの再描画をスキップするか
     */
    updateSpotName(index, name, skipFormatting = false, skipRedrawInput = false) {
        if (index >= 0 && index < this.spots.length) {
            // スポット名がブランクの場合はスポットを削除
            if (!name || name.trim() === '') {
                if (!skipRedrawInput) {
                    // フォーカス離脱時（blur）でブランクの場合は削除
                    this.removeSpot(index);
                    return;
                }
            }

            // フォーマット処理（blur時のみ実行）
            let formattedName = name;
            if (!skipFormatting && name && name.trim() !== '') {
                formattedName = Validators.formatSpotName(name);
            }

            this.spots[index].name = formattedName;
            // 入力中は入力ボックスの再生成を避けるため
            if (skipRedrawInput) {
                // 入力中はキャンバス再描画のみ（入力ボックス再生成はスキップ）
                this.redrawCanvasOnly();
            } else {
                // 通常の変更時は全て再描画
                this.notify('onChange', this.spots, false);
            }
        }
    }

    /**
     * キャンバスのみ再描画（入力ボックスの再生成なし）
     */
    redrawCanvasOnly() {
        // 直接キャンバス再描画のみを実行
        if (this.callbacks.onCanvasRedraw) {
            this.callbacks.onCanvasRedraw();
        }
    }

    /**
     * 末尾の未入力スポットを削除
     */
    removeTrailingEmptySpots() {
        if (this.spots.length === 0) return;
        
        let removed = false;
        for (let i = this.spots.length - 1; i >= 0; i--) {
            const spot = this.spots[i];
            if ((spot.name ?? '') === '') {
                this.spots.splice(i, 1);
                removed = true;
            } else {
                break;
            }
        }
        
        if (removed) {
            // インデックスを再割り当て
            this.spots.forEach((spot, i) => {
                spot.index = i;
            });
            this.notify('onChange');
            this.notify('onCountChange', this.spots.length);
        }
    }


    /**
     * スポット用のデフォルトファイル名を生成
     * @param {string} imageFileName - 画像ファイル名
     * @returns {string} スポットファイル名
     */
    generateSpotFilename(imageFileName) {
        const baseFileName = imageFileName || 'spots';
        return `${baseFileName}_spots.json`;
    }

    /**
     * スポット名で部分一致検索を行う
     * @param {string} searchText - 検索テキスト
     * @returns {Array} 部分一致したスポットの配列
     */
    findSpotsByPartialName(searchText) {
        if (!searchText || searchText.trim() === '') {
            return [];
        }

        const searchLower = searchText.toLowerCase();
        return this.spots.filter(spot => {
            const spotName = (spot.name || '').toLowerCase();
            return spotName.includes(searchLower);
        });
    }
}
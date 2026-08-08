import { Validators } from '../utils/Validators.js';
import { BaseManager } from '../core/BaseManager.js';

/**
 * 重複スポット判定の距離しきい値（キャンバス座標のピクセル）
 * 同名かつこの距離以内にあるスポットを重複とみなす
 * （MapEditorの「重複スポット抽出」が同名かつ30m以内としているのに相当）
 */
export const DUPLICATE_SPOT_DISTANCE = 30;

/**
 * スポット管理クラス
 * 名称を持つ地図上の特定の点（スポット）の管理を行う
 */
export class SpotManager extends BaseManager {
    constructor() {
        super();
        this.spots = [];
    }

    /**
     * スポットを追加
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {string} name - スポット名（デフォルト: 空文字列）
     * @param {boolean} skipRedrawInput - 入力ボックスの再描画をスキップするかどうか (デフォルト: false)
     * @returns {Object} 追加されたスポット
     */
    addSpot(x, y, name = '', skipRedrawInput = false) {
        const spot = {
            x: Math.round(x),
            y: Math.round(y),
            name: name,
            index: this.spots.length
        };

        this.spots.push(spot);
        this.notify('onChange', undefined, skipRedrawInput);
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
     * 指定した矩形範囲内のスポットを検索
     * @param {number} x1 - 矩形の始点X座標
     * @param {number} y1 - 矩形の始点Y座標
     * @param {number} x2 - 矩形の終点X座標
     * @param {number} y2 - 矩形の終点Y座標
     * @returns {Array} 範囲内のスポット情報の配列 [{index, spot}, ...]
     */
    findSpotsInRectangle(x1, y1, x2, y2) {
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);

        const spotsInRect = [];
        this.spots.forEach((spot, index) => {
            if (spot.x >= left && spot.x <= right &&
                spot.y >= top && spot.y <= bottom) {
                spotsInRect.push({ index, spot });
            }
        });

        return spotsInRect;
    }

    /**
     * 指定した矩形範囲内の重複スポット（同名かつ近接）をグループ単位で検索
     * 各グループでは最初に見つかったスポットを残し、それ以外を削除対象とする
     * @param {number} x1 - 矩形の始点X座標
     * @param {number} y1 - 矩形の始点Y座標
     * @param {number} x2 - 矩形の終点X座標
     * @param {number} y2 - 矩形の終点Y座標
     * @param {number} distanceLimit - 重複とみなす距離のしきい値（ピクセル）
     * @returns {Array} 重複グループの配列 [{name, keepIndex, removeIndexes}, ...]
     */
    findDuplicateSpotsInRectangle(x1, y1, x2, y2, distanceLimit = DUPLICATE_SPOT_DISTANCE) {
        // 名称が未入力のスポットは重複判定の対象外
        const candidates = this.findSpotsInRectangle(x1, y1, x2, y2)
            .filter(({ spot }) => (spot.name || '').trim() !== '');

        // 同名のスポットごとにグループ化
        const membersByName = new Map();
        candidates.forEach(({ index, spot }) => {
            const name = spot.name.trim();
            if (!membersByName.has(name)) {
                membersByName.set(name, []);
            }
            membersByName.get(name).push({ index, spot });
        });

        const duplicateGroups = [];
        membersByName.forEach((members, name) => {
            if (members.length < 2) return;

            // 同名の中でも、近接しているもの同士のみを重複とみなす
            const grouped = new Set();
            members.forEach((base, i) => {
                if (grouped.has(base.index)) return;

                const removeIndexes = [];
                for (let j = i + 1; j < members.length; j++) {
                    const other = members[j];
                    if (grouped.has(other.index)) continue;

                    const distance = Math.hypot(other.spot.x - base.spot.x, other.spot.y - base.spot.y);
                    if (distance <= distanceLimit) {
                        grouped.add(other.index);
                        removeIndexes.push(other.index);
                    }
                }

                if (removeIndexes.length > 0) {
                    grouped.add(base.index);
                    duplicateGroups.push({ name, keepIndex: base.index, removeIndexes });
                }
            });
        });

        return duplicateGroups;
    }

    /**
     * 複数のスポットをまとめて削除
     * @param {Array<number>} indices - 削除するスポットのインデックス配列
     * @returns {number} 削除した件数
     */
    removeSpots(indices) {
        // 重複を除いたうえで降順に並べ替え（削除時に配列が崩れないように）
        const targetIndices = [...new Set(indices)]
            .filter(index => index >= 0 && index < this.spots.length)
            .sort((a, b) => b - a);

        if (targetIndices.length === 0) return 0;

        targetIndices.forEach(index => {
            this.spots.splice(index, 1);
        });

        // インデックスを再割り当て
        this.spots.forEach((spot, i) => {
            spot.index = i;
        });

        this.notify('onChange');
        this.notify('onCountChange', this.spots.length);

        return targetIndices.length;
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
     * スポット名で完全一致検索を行う
     * @param {string} spotName - スポット名
     * @returns {Object|null} 一致したスポット、見つからない場合はnull
     */
    findSpotByName(spotName) {
        if (!spotName || spotName.trim() === '') {
            return null;
        }

        const spot = this.spots.find(s => s.name === spotName);
        return spot || null;
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
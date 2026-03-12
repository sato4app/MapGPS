import { BaseManager } from '../core/BaseManager.js';

/**
 * エリアデータの管理を行うクラス（複数エリア対応）
 */
export class AreaManager extends BaseManager {
    constructor() {
        super();
        // 複数エリアを管理
        this.areas = [];
        // 現在選択されているエリアのインデックス（-1 = 未選択）
        this.selectedAreaIndex = -1;
    }

    /**
     * 全エリアを取得
     * @returns {Array} 全エリアの配列
     */
    getAllAreas() {
        return this.areas;
    }

    /**
     * 選択中のエリアを取得
     * @returns {Object|null} 選択中のエリア、または null
     */
    getSelectedArea() {
        if (this.selectedAreaIndex >= 0 && this.selectedAreaIndex < this.areas.length) {
            return this.areas[this.selectedAreaIndex];
        }
        return null;
    }

    /**
     * エリアを選択
     * @param {number} index - エリアのインデックス（-1 = 未選択）
     */
    selectArea(index) {
        this.selectedAreaIndex = index;
        this.notify('onSelectionChange', index);

        // 選択されたエリアの情報を通知
        if (index >= 0 && index < this.areas.length) {
            const area = this.areas[index];
            this.notify('onAreaInfoChange', {
                name: area.areaName
            });
            this.notify('onCountChange', area.vertices ? area.vertices.length : 0);
        } else {
            // 未選択の場合はクリア
            this.notify('onAreaInfoChange', { name: '' });
            this.notify('onCountChange', 0);
        }
        this.notify('onChange');
    }

    /**
     * エリアを追加
     * @param {Object} area - エリアデータ {areaName, vertices}
     */
    addArea(area) {
        // isModifiedフラグを初期化（デフォルト: false）
        if (area.isModified === undefined) {
            area.isModified = false;
        }
        if (!area.vertices) {
            area.vertices = [];
        }
        if (!area.areaName) {
            area.areaName = `エリア ${this.areas.length + 1}`;
        }
        this.areas.push(area);
        this.notify('onAreaListChange', this.areas);
    }

    /**
     * エリアを削除
     * @param {number} index - 削除するエリアのインデックス
     */
    deleteArea(index) {
        if (index < 0 || index >= this.areas.length) {
            console.warn('Invalid area index:', index);
            return;
        }

        this.areas.splice(index, 1);

        // 削除したエリアが選択中だった場合、選択を解除
        if (this.selectedAreaIndex === index) {
            this.selectedAreaIndex = -1;
            this.notify('onAreaInfoChange', { name: '' });
            this.notify('onCountChange', 0);
            this.notify('onSelectionChange', -1);
        } else if (this.selectedAreaIndex > index) {
            // 削除したエリアより後ろのエリアが選択されていた場合、インデックスを調整
            this.selectedAreaIndex--;
            this.notify('onSelectionChange', this.selectedAreaIndex);
        }

        this.notify('onAreaListChange', this.areas);
        this.notify('onChange');
    }

    /**
     * 頂点を追加（選択中のエリアにのみ追加）
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @returns {Object} 追加されたポイント
     */
    addVertex(x, y) {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea) {
            console.warn('No area selected. Cannot add vertex.');
            this.notify('onNoAreaSelected', 'エリアを選択してから頂点を追加してください');
            return null;
        }

        const point = {
            x: Math.round(x),
            y: Math.round(y)
        };

        if (!selectedArea.vertices) {
            selectedArea.vertices = [];
        }

        // 2頂点以上ある場合は最近傍辺の間に挿入、それ以外は末尾に追加
        if (selectedArea.vertices.length >= 2) {
            const n = selectedArea.vertices.length;
            const px = point.x;
            const py = point.y;
            let bestEdgeIndex = 0;
            let bestDist = Infinity;

            for (let i = 0; i < n; i++) {
                const a = selectedArea.vertices[i];
                const b = selectedArea.vertices[(i + 1) % n];
                const dist = this._distanceToSegment(px, py, a.x, a.y, b.x, b.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestEdgeIndex = i;
                }
            }
            selectedArea.vertices.splice(bestEdgeIndex + 1, 0, point);
        } else {
            selectedArea.vertices.push(point);
        }

        this.notify('onChange');
        this.notify('onCountChange', selectedArea.vertices.length);

        // 更新状態をチェック
        this.checkAndUpdateModifiedState();

        return point;
    }

    /**
     * 指定位置に最も近い頂点を検索（選択中のエリアのみ）
     * @param {number} x - X座標（キャンバス座標）
     * @param {number} y - Y座標（キャンバス座標）
     * @param {number} threshold - 判定閾値（デフォルト: 10px）
     * @returns {{index: number, point: Object} | null} 見つかった頂点と配列インデックス、見つからない場合はnull
     */
    findVertexAt(x, y, threshold = 10) {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea || !selectedArea.vertices) {
            return null;
        }

        for (let i = 0; i < selectedArea.vertices.length; i++) {
            const point = selectedArea.vertices[i];
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
     * 指定インデックスの頂点を取得（選択中のエリアのみ）
     * @param {number} index - 頂点の配列インデックス
     * @returns {Object|null} 頂点データ、またはnull
     */
    getAreaVertex(index) {
        const selectedArea = this.getSelectedArea();
        if (selectedArea && selectedArea.vertices && index >= 0 && index < selectedArea.vertices.length) {
            return selectedArea.vertices[index];
        }
        return null;
    }

    /**
     * 頂点の座標を更新（選択中のエリアのみ）
     * @param {number} index - 頂点の配列インデックス
     * @param {number} x - 新しいX座標
     * @param {number} y - 新しいY座標
     */
    updateVertex(index, x, y) {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea || !selectedArea.vertices) {
            return;
        }

        if (index >= 0 && index < selectedArea.vertices.length) {
            selectedArea.vertices[index].x = Math.round(x);
            selectedArea.vertices[index].y = Math.round(y);
            this.notify('onChange');

            // 更新状態をチェック
            this.checkAndUpdateModifiedState();
        }
    }

    /**
     * 頂点を削除（選択中のエリアのみ）
     * @param {number} index - 削除する頂点の配列インデックス
     * @returns {boolean} 削除成功したかどうか
     */
    removeVertex(index) {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea || !selectedArea.vertices) {
            return false;
        }

        if (index >= 0 && index < selectedArea.vertices.length) {
            selectedArea.vertices.splice(index, 1);

            this.notify('onChange');
            this.notify('onCountChange', selectedArea.vertices.length);

            // 更新状態をチェック
            this.checkAndUpdateModifiedState();
            return true;
        }
        return false;
    }

    /**
     * 頂点を一括削除（選択中のエリアのみ）
     * @param {Array<number>} indices - 削除する頂点のインデックス配列
     */
    removeVertices(indices) {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea || !selectedArea.vertices) {
            return 0;
        }

        let deletedCount = 0;
        const sortedIndices = [...indices].sort((a, b) => b - a);

        for (const index of sortedIndices) {
            if (index >= 0 && index < selectedArea.vertices.length) {
                selectedArea.vertices.splice(index, 1);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            this.notify('onChange');
            this.notify('onCountChange', selectedArea.vertices.length);
            this.checkAndUpdateModifiedState();
        }

        return deletedCount;
    }

    /**
     * 移動した頂点を最も近い辺の間に再挿入する
     * @param {number} areaIndex - 対象エリアのインデックス
     * @param {number} vertexIndex - 移動した頂点の配列インデックス
     */
    reinsertNearestEdge(areaIndex, vertexIndex) {
        if (areaIndex < 0 || areaIndex >= this.areas.length) return;

        const area = this.areas[areaIndex];
        if (!area.vertices || area.vertices.length < 2) return;

        // 移動した頂点を取り出す
        const [movedVertex] = area.vertices.splice(vertexIndex, 1);
        const px = movedVertex.x;
        const py = movedVertex.y;

        const n = area.vertices.length;
        if (n < 2) {
            // 残り頂点が1つ以下の場合は末尾に戻す
            area.vertices.push(movedVertex);
            return;
        }

        // 最近傍辺を探す（閉じた多角形: 辺は 0-1, 1-2, ..., n-1-0）
        let bestEdgeIndex = 0;
        let bestDist = Infinity;

        for (let i = 0; i < n; i++) {
            const a = area.vertices[i];
            const b = area.vertices[(i + 1) % n];
            const dist = this._distanceToSegment(px, py, a.x, a.y, b.x, b.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestEdgeIndex = i;
            }
        }

        // bestEdgeIndex+1 の位置に挿入（辺 bestEdgeIndex → bestEdgeIndex+1 の間）
        area.vertices.splice(bestEdgeIndex + 1, 0, movedVertex);
    }

    /**
     * 点から線分への最短距離を計算
     * @param {number} px - 点のX座標
     * @param {number} py - 点のY座標
     * @param {number} ax - 線分の始点X
     * @param {number} ay - 線分の始点Y
     * @param {number} bx - 線分の終点X
     * @param {number} by - 線分の終点Y
     * @returns {number} 最短距離
     */
    _distanceToSegment(px, py, ax, ay, bx, by) {
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) {
            return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
        }
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const closestX = ax + t * dx;
        const closestY = ay + t * dy;
        return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
    }

    /**
     * エリア名を設定（選択中のエリアのみ）
     * @param {string} name - エリア名
     */
    setAreaName(name) {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea) {
            console.warn('No area selected. Cannot set area name.');
            return;
        }

        selectedArea.areaName = name;
        this.notify('onAreaListChange', this.areas);
        this.checkAndUpdateModifiedState();
    }

    /**
     * 更新状態をチェックして必要に応じてフラグを設定
     */
    checkAndUpdateModifiedState() {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea) return;

        const hasName = selectedArea.areaName && selectedArea.areaName.trim().length > 0;
        const hasVertices = selectedArea.vertices && selectedArea.vertices.length >= 3;

        if (hasName && hasVertices) {
            if (!selectedArea.isModified) {
                selectedArea.isModified = true;
                this.notify('onModifiedStateChange', { isModified: true, areaIndex: this.selectedAreaIndex });
                this.notify('onAreaListChange', this.areas);
            }
        }
    }

    /**
     * 全エリアを削除
     */
    clearAreas() {
        this.areas = [];
        this.selectedAreaIndex = -1;
        this.notify('onAreaListChange', this.areas);
        this.notify('onChange');
        this.notify('onSelectionChange', -1);
        this.notify('onAreaInfoChange', { name: '' });
        this.notify('onCountChange', 0);
    }

    /**
     * エリア情報を検証
     */
    validateArea() {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea) {
            return { isValid: false, message: 'エリアが選択されていません。' };
        }

        if (!selectedArea.areaName || selectedArea.areaName.trim() === '') {
            return { isValid: false, message: 'エリア名を入力してください。' };
        }

        if (!selectedArea.vertices || selectedArea.vertices.length < 3) {
            return { isValid: false, message: 'エリアを作成するには少なくとも3つの頂点が必要です。' };
        }

        return { isValid: true };
    }
}

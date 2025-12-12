import { CoordinateUtils } from './Coordinates.js';

/**
 * ドラッグ&ドロップ機能を管理するクラス
 */
export class DragDropHandler {
    constructor() {
        this.isDragging = false;
        this.draggedObjectType = null;  // 'point' | 'spot' | 'routePoint'
        this.draggedObjectIndex = -1;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // ドラッグ移動判定用
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.hasMoved = false;
        this.DRAG_THRESHOLD = 3; // 3px以上移動したらドラッグ扱い
    }

    /**
     * ドラッグ開始処理
     * @param {string} objectType - ドラッグするオブジェクトの種類（'point' | 'spot' | 'routePoint'）
     * @param {number} objectIndex - オブジェクトのインデックス
     * @param {number} mouseX - マウスX座標
     * @param {number} mouseY - マウスY座標
     * @param {Object} object - ドラッグするオブジェクト
     */
    startDrag(objectType, objectIndex, mouseX, mouseY, object) {
        this.isDragging = true;
        this.draggedObjectType = objectType;
        this.draggedObjectIndex = objectIndex;
        this.dragOffsetX = mouseX - object.x;
        this.dragOffsetY = mouseY - object.y;

        // ドラッグ開始座標を保存
        this.dragStartX = mouseX;
        this.dragStartY = mouseY;
        this.hasMoved = false;
    }

    /**
     * ドラッグ中の更新処理
     * @param {number} mouseX - マウスX座標
     * @param {number} mouseY - マウスY座標
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {Object} spotManager - SpotManagerインスタンス
     * @param {Object} routeManager - RouteManagerインスタンス
     * @returns {boolean} 位置が更新されたかどうか
     */
    updateDrag(mouseX, mouseY, pointManager, spotManager, routeManager) {
        if (!this.isDragging) return false;

        // 移動距離を計算
        if (!this.hasMoved) {
            const dx = mouseX - this.dragStartX;
            const dy = mouseY - this.dragStartY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > this.DRAG_THRESHOLD) {
                this.hasMoved = true;
            }
        }

        const newX = mouseX - this.dragOffsetX;
        const newY = mouseY - this.dragOffsetY;

        if (this.draggedObjectType === 'point') {
            const points = pointManager.getPoints();
            if (this.draggedObjectIndex < points.length) {
                points[this.draggedObjectIndex].x = Math.round(newX);
                points[this.draggedObjectIndex].y = Math.round(newY);
                return true;
            }
        } else if (this.draggedObjectType === 'spot') {
            spotManager.updateSpotPosition(this.draggedObjectIndex, newX, newY);
            return true;
        } else if (this.draggedObjectType === 'routePoint') {
            routeManager.updateRoutePoint(this.draggedObjectIndex, newX, newY);
            return true;
        }

        return false;
    }

    /**
     * ドラッグ終了処理
     * @param {Object} inputManager - InputManagerインスタンス
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {Function} onPointDragEndCallback - ポイントドラッグ終了時のコールバック（オプション）
     * @param {Function} onSpotDragEndCallback - スポットドラッグ終了時のコールバック（オプション）
     * @param {Function} onRoutePointDragEndCallback - ルート中間点ドラッグ終了時のコールバック（オプション）
     * @returns {{wasDragging: boolean, hasMoved: boolean}} ドラッグ情報
     */
    endDrag(inputManager, pointManager, onPointDragEndCallback, onSpotDragEndCallback, onRoutePointDragEndCallback) {
        if (!this.isDragging) return { wasDragging: false, hasMoved: false };

        const wasDragging = true;
        const draggedIndex = this.draggedObjectIndex;
        const draggedType = this.draggedObjectType;
        const hasMoved = this.hasMoved; // reset()前に保存

        // ポイント移動後に入力ボックスを再描画
        if (this.draggedObjectType === 'point') {
            inputManager.redrawInputBoxes(pointManager.getPoints());
            // ポイントデータ変更を通知
            pointManager.notify('onChange', pointManager.getPoints());

            // ドラッグ終了コールバック実行（ポイントインデックスを渡す）
            if (onPointDragEndCallback && typeof onPointDragEndCallback === 'function') {
                onPointDragEndCallback(draggedIndex);
            }
        } else if (this.draggedObjectType === 'spot') {
            // スポットドラッグ終了コールバック実行（スポットインデックスを渡す）
            if (onSpotDragEndCallback && typeof onSpotDragEndCallback === 'function') {
                onSpotDragEndCallback(draggedIndex);
            }
        } else if (this.draggedObjectType === 'routePoint') {
            // ルート中間点ドラッグ終了コールバック実行
            if (onRoutePointDragEndCallback && typeof onRoutePointDragEndCallback === 'function') {
                onRoutePointDragEndCallback(draggedIndex);
            }
        }

        this.reset();
        return { wasDragging, hasMoved };
    }

    /**
     * ドラッグ状態をリセット
     */
    reset() {
        this.isDragging = false;
        this.draggedObjectType = null;
        this.draggedObjectIndex = -1;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.hasMoved = false;
    }

    /**
     * 現在ドラッグ中かどうかを取得
     * @returns {boolean} ドラッグ中かどうか
     */
    isDraggingObject() {
        return this.isDragging;
    }

    /**
     * ドラッグ中のオブジェクト情報を取得
     * @returns {{type: string, index: number} | null} ドラッグ中のオブジェクト情報
     */
    getDraggedObjectInfo() {
        if (!this.isDragging) return null;
        return {
            type: this.draggedObjectType,
            index: this.draggedObjectIndex
        };
    }

    /**
     * 実際にドラッグ移動が行われたかを取得
     * @returns {boolean} 閾値以上移動したかどうか
     */
    hasDragged() {
        return this.hasMoved;
    }
}
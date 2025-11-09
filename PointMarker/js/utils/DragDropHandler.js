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
     * @returns {boolean} ドラッグが終了されたかどうか
     */
    endDrag(inputManager, pointManager) {
        if (!this.isDragging) return false;

        const wasDragging = true;

        // ポイント移動後に入力ボックスを再描画
        if (this.draggedObjectType === 'point') {
            inputManager.redrawInputBoxes(pointManager.getPoints());
            // ポイントデータ変更を通知
            pointManager.notify('onChange', pointManager.getPoints());
        }

        this.reset();
        return wasDragging;
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
}
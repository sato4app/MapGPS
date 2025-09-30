/**
 * 座標変換とスケーリングのユーティリティクラス
 */
export class CoordinateUtils {
    /**
     * キャンバス座標を画像座標に変換
     * @param {number} canvasX - キャンバスX座標
     * @param {number} canvasY - キャンバスY座標
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @param {number} imageWidth - 元画像幅
     * @param {number} imageHeight - 元画像高さ
     * @returns {{x: number, y: number}} 画像座標
     */
    static canvasToImage(canvasX, canvasY, canvasWidth, canvasHeight, imageWidth, imageHeight) {
        const scaleX = imageWidth / canvasWidth;
        const scaleY = imageHeight / canvasHeight;
        return {
            x: Math.round(canvasX * scaleX),
            y: Math.round(canvasY * scaleY)
        };
    }

    /**
     * 画像座標をキャンバス座標に変換
     * @param {number} imageX - 画像X座標
     * @param {number} imageY - 画像Y座標
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @param {number} imageWidth - 元画像幅
     * @param {number} imageHeight - 元画像高さ
     * @returns {{x: number, y: number}} キャンバス座標
     */
    static imageToCanvas(imageX, imageY, canvasWidth, canvasHeight, imageWidth, imageHeight) {
        const scaleX = canvasWidth / imageWidth;
        const scaleY = canvasHeight / imageHeight;
        return {
            x: Math.round(imageX * scaleX),
            y: Math.round(imageY * scaleY)
        };
    }

    /**
     * マウス座標をキャンバス座標に変換
     * @param {MouseEvent} event - マウスイベント
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     * @returns {{x: number, y: number}} キャンバス座標
     */
    static mouseToCanvas(event, canvas) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * (canvas.width / rect.width),
            y: (event.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    /**
     * キャンバス座標をスクリーン座標に変換
     * @param {number} canvasX - キャンバスX座標
     * @param {number} canvasY - キャンバスY座標
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     * @returns {{x: number, y: number}} スクリーン座標
     */
    static canvasToScreen(canvasX, canvasY, canvas) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        return {
            x: canvasX * scaleX + rect.left,
            y: canvasY * scaleY + rect.top
        };
    }
}
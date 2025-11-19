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
     * マウス座標をキャンバス座標に変換（ズーム・パン対応）
     * @param {MouseEvent} event - マウスイベント
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     * @param {number} scale - ズーム倍率（デフォルト: 1.0）
     * @param {number} offsetX - X方向オフセット（デフォルト: 0）
     * @param {number} offsetY - Y方向オフセット（デフォルト: 0）
     * @returns {{x: number, y: number}} キャンバス座標
     */
    static mouseToCanvas(event, canvas, scale = 1.0, offsetX = 0, offsetY = 0) {
        const rect = canvas.getBoundingClientRect();
        const rawX = (event.clientX - rect.left) * (canvas.width / rect.width);
        const rawY = (event.clientY - rect.top) * (canvas.height / rect.height);

        // ズーム・パンの逆変換を適用
        return {
            x: (rawX - offsetX) / scale,
            y: (rawY - offsetY) / scale
        };
    }

    /**
     * キャンバス座標をスクリーン座標に変換（ズーム・パン対応）
     * @param {number} canvasX - キャンバスX座標
     * @param {number} canvasY - キャンバスY座標
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     * @param {number} scale - ズーム倍率（デフォルト: 1.0）
     * @param {number} offsetX - X方向オフセット（デフォルト: 0）
     * @param {number} offsetY - Y方向オフセット（デフォルト: 0）
     * @returns {{x: number, y: number}} スクリーン座標
     */
    static canvasToScreen(canvasX, canvasY, canvas, scale = 1.0, offsetX = 0, offsetY = 0) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;

        // ズーム・パン変換を適用
        const transformedX = canvasX * scale + offsetX;
        const transformedY = canvasY * scale + offsetY;

        return {
            x: transformedX * scaleX + rect.left,
            y: transformedY * scaleY + rect.top
        };
    }
}
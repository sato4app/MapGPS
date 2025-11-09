import { Validators } from '../utils/Validators.js';

/**
 * バリデーション機能を統合管理するクラス
 */
export class ValidationManager {
    /**
     * ポイントIDの重複チェック
     * @param {Array} points - ポイント配列
     * @returns {Object} 検証結果 {isValid: boolean, message: string}
     */
    static checkDuplicatePointIds(points) {
        const idCounts = {};
        const duplicates = [];

        for (const point of points) {
            if (point.id && point.id.trim()) {
                const id = point.id.trim();
                idCounts[id] = (idCounts[id] || 0) + 1;
                if (idCounts[id] === 2) {
                    duplicates.push(id);
                }
            }
        }

        if (duplicates.length > 0) {
            return {
                isValid: false,
                message: `重複するポイントIDがあります: ${duplicates.join(', ')}`
            };
        }

        return { isValid: true, message: '' };
    }

    /**
     * ルートポイントのバリデーションフィードバックを更新
     * @param {HTMLElement} inputElement - 入力要素
     * @param {string} value - 入力値
     * @param {Object} pointManager - ポイントマネージャー
     */
    static updateRoutePointValidationFeedback(inputElement, value, pointManager) {
        // スタイルをクリア
        ValidationManager.clearInputElementStyles(inputElement);

        if (!value.trim()) {
            return; // 空の場合はバリデーションなし
        }

        // 形式チェック
        if (!Validators.isValidPointIdFormat(value)) {
            ValidationManager.setInputElementError(inputElement, 'X-nn形式で入力してください（例：A-01, J-12）');
            return;
        }

        // 存在チェック
        const registeredIds = pointManager.getRegisteredIds();
        if (!registeredIds.includes(value)) {
            ValidationManager.setInputElementError(inputElement,
                `ポイント「${value}」が見つかりません`, true);
            return;
        }

        // 正常な場合は緑の枠線
        inputElement.style.borderColor = '#4caf50';
        inputElement.style.borderWidth = '2px';
        if (inputElement.title) {
            inputElement.title = '';
        }
    }

    /**
     * 入力要素のスタイルをクリア
     * @param {HTMLElement} inputElement - 入力要素
     */
    static clearInputElementStyles(inputElement) {
        inputElement.style.borderColor = '';
        inputElement.style.borderWidth = '';
        inputElement.style.backgroundColor = '';
        if (inputElement.title) {
            inputElement.title = '';
        }
    }

    /**
     * 入力要素にエラー表示を設定
     * @param {HTMLElement} inputElement - 入力要素
     * @param {string} message - エラーメッセージ
     * @param {boolean} redBorder - 赤い枠線を表示するかどうか
     */
    static setInputElementError(inputElement, message, redBorder = false) {
        if (redBorder) {
            inputElement.style.borderColor = '#f44336';
            inputElement.style.borderWidth = '2px';
        } else {
            inputElement.style.backgroundColor = '#ffebee';
        }
        inputElement.title = message;
    }

    /**
     * 開始・終了ポイントの両方のバリデーションを更新
     * @param {Object} routeManager - ルートマネージャー
     * @param {Object} pointManager - ポイントマネージャー
     */
    static updateBothRoutePointsValidation(routeManager, pointManager) {
        const startPointInput = document.getElementById('startPointInput');
        const endPointInput = document.getElementById('endPointInput');

        const startValue = startPointInput.value.trim();
        const endValue = endPointInput.value.trim();

        // まず通常のバリデーションを実行
        ValidationManager.updateRoutePointValidationFeedback(startPointInput, startValue, pointManager);
        ValidationManager.updateRoutePointValidationFeedback(endPointInput, endValue, pointManager);

        // 両方とも有効で同じ値の場合は重複エラー
        if (startValue && endValue &&
            Validators.isValidPointIdFormat(startValue) &&
            Validators.isValidPointIdFormat(endValue) &&
            startValue === endValue) {

            ValidationManager.setInputElementError(startPointInput,
                '開始ポイントと終了ポイントに同じIDが設定されています', true);
            ValidationManager.setInputElementError(endPointInput,
                '開始ポイントと終了ポイントに同じIDが設定されています', true);
        }
    }
}
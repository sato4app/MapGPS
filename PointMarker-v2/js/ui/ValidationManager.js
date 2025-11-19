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
     * @param {Object} spotManager - スポットマネージャー（オプション）
     * @returns {Array<string>} 複数一致したスポット名の配列（なければ空配列）
     */
    static updateRoutePointValidationFeedback(inputElement, value, pointManager, spotManager = null) {
        // スタイルをクリア
        ValidationManager.clearInputElementStyles(inputElement);

        if (!value.trim()) {
            return []; // 空の場合はバリデーションなし
        }

        // まずポイントIDとして存在チェック
        const registeredIds = pointManager.getRegisteredIds();
        if (registeredIds.includes(value)) {
            // ポイントIDとして存在する場合は緑の枠線
            inputElement.style.borderColor = '#4caf50';
            inputElement.style.borderWidth = '2px';
            if (inputElement.title) {
                inputElement.title = '';
            }
            return [];
        }

        // スポット名として部分一致チェック
        if (spotManager) {
            const matchingSpots = spotManager.findSpotsByPartialName(value);
            if (matchingSpots.length === 1) {
                // スポット名として1件のみ該当する場合は緑の枠線
                inputElement.style.borderColor = '#4caf50';
                inputElement.style.borderWidth = '2px';
                if (inputElement.title) {
                    inputElement.title = '';
                }
                return [];
            } else if (matchingSpots.length > 1) {
                // 複数件該当する場合はピンク背景
                const spotNames = matchingSpots.map(s => s.name);
                const spotNamesStr = spotNames.join('、');
                ValidationManager.setInputElementError(inputElement,
                    `複数のスポット名が該当します: ${spotNamesStr}`, false);
                return spotNames; // 複数一致したスポット名を返す
            }
        }

        // ポイントIDでもスポット名でも該当しない場合はエラー
        // 形式チェック（X-nn形式かどうか）
        if (Validators.isValidPointIdFormat(value)) {
            // X-nn形式だが存在しない場合は赤枠
            ValidationManager.setInputElementError(inputElement,
                `ポイント「${value}」が見つかりません`, true);
        } else {
            // X-nn形式でもなく、スポット名でも該当しない場合はピンク背景
            ValidationManager.setInputElementError(inputElement,
                `該当するポイントまたはスポットが見つかりません`, false);
        }
        return [];
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
     * @param {Object} routeManager - ルートマネージャー（未使用だが互換性のため残す）
     * @param {Object} pointManager - ポイントマネージャー
     * @param {Object} spotManager - スポットマネージャー（オプション）
     * @returns {Object} 複数一致したスポット名の情報 { start: Array<string>, end: Array<string> }
     */
    static updateBothRoutePointsValidation(routeManager, pointManager, spotManager = null) {
        const startPointInput = document.getElementById('startPointInput');
        const endPointInput = document.getElementById('endPointInput');

        const startValue = startPointInput.value.trim();
        const endValue = endPointInput.value.trim();

        // まず通常のバリデーションを実行（複数一致したスポット名を取得）
        const startMatchingSpots = ValidationManager.updateRoutePointValidationFeedback(startPointInput, startValue, pointManager, spotManager);
        const endMatchingSpots = ValidationManager.updateRoutePointValidationFeedback(endPointInput, endValue, pointManager, spotManager);

        // 両方とも同じ値の場合は重複エラー
        if (startValue && endValue && startValue === endValue) {
            ValidationManager.setInputElementError(startPointInput,
                '開始ポイントと終了ポイントに同じIDが設定されています', true);
            ValidationManager.setInputElementError(endPointInput,
                '開始ポイントと終了ポイントに同じIDが設定されています', true);
        }

        return {
            start: startMatchingSpots,
            end: endMatchingSpots
        };
    }
}
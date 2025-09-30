/**
 * バリデーション機能を提供するクラス
 */
export class Validators {
    /**
     * ポイントIDが「X-nn」形式（英大文字1桁-数字2桁）かどうかをチェック
     * @param {string} value - 検証する値
     * @returns {boolean} 有効な形式かどうか
     */
    static isValidPointIdFormat(value) {
        if (!value || value.trim() === '') {
            return true;
        }
        
        const validPattern = /^[A-Z]-\d{2}$/;
        return validPattern.test(value);
    }

    /**
     * ポイントIDを「X-nn」形式に自動修正する
     * @param {string} value - 修正する値
     * @returns {string} 修正された値
     */
    static formatPointId(value) {
        if (!value || value.trim() === '') {
            return value;
        }
        
        // 1. 全角英数字を半角英数字に変換
        let convertedValue = this.convertFullWidthToHalfWidth(value);
        
        // 2. 英小文字を英大文字に変換
        convertedValue = convertedValue.toUpperCase();
        
        // 完全な「X-nn」形式（2桁数字）の場合
        const fullMatch = convertedValue.match(/^([A-Z])[-]?(\d{2})$/);
        if (fullMatch) {
            const letter = fullMatch[1];
            const numbers = fullMatch[2];
            return `${letter}-${numbers}`;
        }
        
        // 不完全な入力「X-n」（1桁数字）の場合
        const partialMatch = convertedValue.match(/^([A-Z])[-]?(\d{1})$/);
        if (partialMatch) {
            const letter = partialMatch[1];
            const number = partialMatch[2];
            // 1桁の場合は0埋めしてフォーマット
            return `${letter}-${number.padStart(2, '0')}`;
        }
        
        // ハイフンなしの「X数字」形式の場合
        const noHyphenMatch = convertedValue.match(/^([A-Z])(\d{1,2})$/);
        if (noHyphenMatch) {
            const letter = noHyphenMatch[1];
            const numbers = noHyphenMatch[2].padStart(2, '0');
            return `${letter}-${numbers}`;
        }
        
        // 数字のみの場合は変換しない
        if (convertedValue.match(/^\d+$/)) {
            return convertedValue;
        }
        
        return convertedValue;
    }
    
    /**
     * 全角英文字と全角数字、全角ハイフンを半角に変換する
     * @param {string} str - 変換する文字列
     * @returns {string} 変換後の文字列
     */
    static convertFullWidthToHalfWidth(str) {
        return str.replace(/[Ａ-Ｚａ-ｚ０-９－−‐―]/g, function(char) {
            if (char >= 'Ａ' && char <= 'Ｚ') {
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            if (char >= 'ａ' && char <= 'ｚ') {
                // 全角小文字を半角小文字に変換（大文字変換は後で行う）
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            if (char >= '０' && char <= '９') {
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            if (char === '－' || char === '−' || char === '‐' || char === '―') {
                return '-';
            }
            return char;
        });
    }

    /**
     * ファイルがPNG形式かどうかをチェック
     * @param {File} file - チェックするファイル
     * @returns {boolean} PNG形式かどうか
     */
    static isPngFile(file) {
        return file && file.type.includes('png');
    }

    /**
     * ファイルがJSON形式かどうかをチェック
     * @param {File} file - チェックするファイル
     * @returns {boolean} JSON形式かどうか
     */
    static isJsonFile(file) {
        return file && file.type.includes('json');
    }

    /**
     * JSONデータがポイント形式として有効かどうかをチェック
     * @param {Object} data - チェックするJSONデータ
     * @returns {boolean} 有効なポイントデータかどうか
     */
    static isValidPointData(data) {
        return data && data.points && Array.isArray(data.points);
    }

    /**
     * JSONデータがルート形式として有効かどうかをチェック
     * @param {Object} data - チェックするJSONデータ
     * @returns {boolean} 有効なルートデータかどうか
     */
    static isValidRouteData(data) {
        return data && data.points && Array.isArray(data.points) && data.routeInfo;
    }

    /**
     * JSONデータがスポット形式として有効かどうかをチェック
     * @param {Object} data - チェックするJSONデータ
     * @returns {boolean} 有効なスポットデータかどうか
     */
    static isValidSpotData(data) {
        if (!data) return false;
        
        // 新しい形式: data.spots
        if (data.spots && Array.isArray(data.spots)) {
            return true;
        }
        
        // 旧形式: data.points with type: 'spot'
        if (data.points && Array.isArray(data.points) && 
            data.points.some(point => point.type === 'spot')) {
            return true;
        }
        
        return false;
    }
}
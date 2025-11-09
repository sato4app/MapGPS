/**
 * データ処理とフォーマットのユーティリティクラス
 */
export class DataUtils {
    /**
     * ポイントIDを「X-nn」形式に自動修正する（漢字・カナは変換しない）
     * @param {string} value - 修正する値
     * @returns {string} 修正された値
     */
    static formatPointId(value) {
        if (!value || typeof value !== 'string') {
            return value;
        }

        const original = value.trim();
        if (original === '') {
            return value;
        }

        // 1. 全角英数字を半角に変換（英文字は大文字化）
        let converted = this.convertFullWidthToHalfWidth(original);

        // 漢字・ひらがな・カタカナが含まれる場合は、全角英数字変換のみ実行してそのまま返す
        if (/[ぁ-ん]|[ァ-ヶ]|[一-龯]/.test(converted)) {
            return converted;
        }

        // 2. スペースを全角・半角とも削除
        converted = converted.replace(/[\s　]/g, '');

        if (converted === '') {
            return original;
        }

        // 3. 末尾が1桁の数字の場合のみ、左をゼロで埋める（例："1"→"01"）
        // 最後の2文字が数字の場合は0パディングしない
        const lastTwoDigitsPattern = /\d{2}$/;
        const singleDigitEndPattern = /^(.*)(\d)$/;
        const singleDigitEndMatch = converted.match(singleDigitEndPattern);

        if (singleDigitEndMatch && !singleDigitEndMatch[1].endsWith('-') && !lastTwoDigitsPattern.test(converted)) {
            // ハイフンの直後でなく、最後の2文字が数字でない場合のみパディング
            const prefix = singleDigitEndMatch[1];
            const digit = singleDigitEndMatch[2];
            converted = `${prefix}${digit.padStart(2, '0')}`;
        }

        // 4. 末尾が2桁以内の数字で、全体が3文字までの場合、数字の前に"-"を付ける
        if (converted.length <= 3 && !converted.includes('-')) {
            const shortPattern = /^([A-Z]+)(\d{1,2})$/;
            const shortMatch = converted.match(shortPattern);

            if (shortMatch) {
                const letters = shortMatch[1];
                let numbers = shortMatch[2];
                // 1桁の数字の場合は0パディング
                if (numbers.length === 1) {
                    numbers = '0' + numbers;
                }
                return `${letters}-${numbers}`;
            }
        }

        return converted;
    }

    /**
     * 全角英文字と全角数字、全角ハイフンを半角に変換する（英文字は大文字化）
     * @param {string} str - 変換する文字列
     * @returns {string} 変換後の文字列
     */
    static convertFullWidthToHalfWidth(str) {
        return str.replace(/[Ａ-Ｚａ-ｚ０-９－−‐―]/g, function(char) {
            if (char >= 'Ａ' && char <= 'Ｚ') {
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            if (char >= 'ａ' && char <= 'ｚ') {
                const halfWidthChar = String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
                return halfWidthChar.toUpperCase();
            }
            if (char >= '０' && char <= '９') {
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            if (char === '－' || char === '−' || char === '‐' || char === '―') {
                return '-';
            }
            return char;
        }).replace(/[a-z]/g, function(char) {
            // 半角小文字も大文字に変換
            return char.toUpperCase();
        });
    }

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
     * 緯度経度を10進数形式に変換
     * @param {string|number} value - 変換する値
     * @returns {number} 10進数の座標値
     */
    static parseLatLng(value) {
        if (typeof value === 'number') {
            return value;
        }

        if (typeof value === 'string') {
            // DMS形式の場合の変換処理
            const dmsMatch = value.match(/(\d+)[°度]\s*(\d+)[\'分]\s*([\d.]+)[\"秒]/);
            if (dmsMatch) {
                const degrees = parseFloat(dmsMatch[1]);
                const minutes = parseFloat(dmsMatch[2]);
                const seconds = parseFloat(dmsMatch[3]);
                return degrees + minutes / 60 + seconds / 3600;
            }

            // 通常の数値文字列として解析
            return parseFloat(value);
        }

        return NaN;
    }

    /**
     * 標高値を正規化（数値の場合は小数点1位まで、123.0は123にする）
     * @param {string|number} elevation - 標高値
     * @returns {string} 正規化された標高値
     */
    static normalizeElevation(elevation) {
        if (!elevation || elevation === '') {
            return '';
        }

        const numValue = parseFloat(elevation);
        if (!isNaN(numValue)) {
            // 小数点1位まで表示し、.0の場合は整数表示
            const formatted = numValue.toFixed(1);
            return formatted.endsWith('.0') ? String(Math.round(numValue)) : formatted;
        }

        // 数値として扱えない場合はそのまま返す
        return String(elevation);
    }

    /**
     * セルの値を安全に取得
     * @param {Array} row - データ行
     * @param {number} index - 列インデックス
     * @returns {string} セル値
     */
    static getCellValue(row, index) {
        if (index === undefined || index >= row.length) {
            return '';
        }
        const value = row[index];
        return value !== undefined && value !== null ? String(value).trim() : '';
    }

    /**
     * 空行かどうかをチェック
     * @param {Array} row - データ行
     * @returns {boolean} 空行かどうか
     */
    static isEmptyRow(row) {
        return row.every(cell =>
            cell === undefined ||
            cell === null ||
            String(cell).trim() === ''
        );
    }

    /**
     * テンプレート文字列をパラメータで置換
     * @param {string} template - テンプレート文字列（例: 'ポイント {id} を追加しました'）
     * @param {Object} params - 置換パラメータ（例: {id: 'A-01'}）
     * @returns {string} 置換後の文字列
     */
    static formatMessage(template, params = {}) {
        return template.replace(/\{(\w+)\}/g, (match, key) => {
            return params[key] !== undefined ? params[key] : match;
        });
    }
}
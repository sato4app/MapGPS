/**
 * UI関連のユーティリティ機能を提供するクラス
 */
export class UIHelper {
    /**
     * 指定したポイントに対応する入力フィールドにフォーカスを当てる
     * @param {number} pointIndex - ポイントのインデックス
     */
    static focusInputForPoint(pointIndex) {
        const inputElement = document.querySelector(`input[data-point-index="${pointIndex}"]`);
        if (inputElement) {
            inputElement.focus();
            // カーソルを末尾に設定
            inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
        }
    }

    /**
     * 指定したスポットに対応する入力フィールドにフォーカスを当てる
     * @param {number} spotIndex - スポットのインデックス
     */
    static focusInputForSpot(spotIndex) {
        const inputElement = document.querySelector(`input[data-spot-index="${spotIndex}"]`);
        if (inputElement) {
            inputElement.focus();
            // カーソルを末尾に設定
            inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
        }
    }

    /**
     * メッセージを画面中央に表示
     * @param {string} message - 表示するメッセージ
     * @param {string} type - メッセージタイプ ('info', 'warning', 'error')
     */
    static showMessage(message, type = 'info') {
        // 既存のメッセージ要素があれば削除
        const existingMessage = document.getElementById('messageOverlay');
        if (existingMessage) {
            existingMessage.remove();
        }

        // メッセージオーバーレイ要素を作成
        const messageOverlay = document.createElement('div');
        messageOverlay.id = 'messageOverlay';
        messageOverlay.className = `message-overlay message-${type}`;
        messageOverlay.textContent = message;

        // body要素に追加
        document.body.appendChild(messageOverlay);

        // 表示時間の設定
        let displayDuration = 3000; // デフォルト3秒
        switch (type) {
            case 'warning':
                displayDuration = 4500; // 警告は4.5秒
                break;
            case 'error':
                displayDuration = 6000; // エラーは6秒
                break;
        }

        // 指定時間後に自動削除
        setTimeout(() => {
            if (messageOverlay.parentNode) {
                messageOverlay.remove();
            }
        }, displayDuration);
    }

    /**
     * 警告メッセージを表示
     * @param {string} message - 警告メッセージ
     */
    static showWarning(message) {
        UIHelper.showMessage(message, 'warning');
    }

    /**
     * エラーメッセージを表示
     * @param {string} message - エラーメッセージ
     */
    static showError(message) {
        UIHelper.showMessage(message, 'error');
    }
}
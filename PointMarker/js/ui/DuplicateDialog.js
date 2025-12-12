/**
 * DuplicateDialog.js
 * 重複検出時のユーザー選択ダイアログを管理するクラス
 */

export class DuplicateDialog {
    constructor() {
        this.dialog = null;
        this.overlay = null;
        this.resolveCallback = null;
        this.createDialogElements();
    }

    /**
     * ダイアログ要素を作成
     */
    createDialogElements() {
        // オーバーレイ
        this.overlay = document.createElement('div');
        this.overlay.id = 'duplicateDialogOverlay';
        this.overlay.className = 'duplicate-dialog-overlay';
        this.overlay.style.display = 'none';

        // ダイアログ
        this.dialog = document.createElement('div');
        this.dialog.id = 'duplicateDialog';
        this.dialog.className = 'duplicate-dialog';

        this.overlay.appendChild(this.dialog);
        document.body.appendChild(this.overlay);
    }

    /**
     * ポイント重複ダイアログを表示
     * @param {Object} existing - 既存のポイントデータ
     * @param {Object} attempted - 追加しようとしたポイントデータ
     * @returns {Promise<string>} 'update'|'cancel'|'rename'
     */
    async showPointDuplicateDialog(existing, attempted) {
        const html = `
            <div class="duplicate-dialog-header">
                <span class="duplicate-dialog-icon">⚠️</span>
                <h3>ポイントIDの重複検出</h3>
            </div>
            <div class="duplicate-dialog-body">
                <p class="duplicate-dialog-message">
                    ポイントID <strong>"${existing.id}"</strong> は既に存在します。
                </p>
                <div class="duplicate-dialog-comparison">
                    <div class="duplicate-dialog-item">
                        <h4>既存のポイント</h4>
                        <p>ID: <span class="highlight">${existing.id}</span></p>
                        <p>座標: (${Math.round(existing.x)}, ${Math.round(existing.y)})</p>
                    </div>
                    <div class="duplicate-dialog-arrow">→</div>
                    <div class="duplicate-dialog-item">
                        <h4>新しいポイント</h4>
                        <p>ID: <span class="highlight">${attempted.id}</span></p>
                        <p>座標: (${Math.round(attempted.x)}, ${Math.round(attempted.y)})</p>
                    </div>
                </div>
                <p class="duplicate-dialog-question">どうしますか？</p>
            </div>
            <div class="duplicate-dialog-footer">
                <button class="duplicate-dialog-btn duplicate-dialog-btn-update" data-action="update">
                    既存の位置を更新
                </button>
                <button class="duplicate-dialog-btn duplicate-dialog-btn-rename" data-action="rename">
                    別のIDで追加
                </button>
                <button class="duplicate-dialog-btn duplicate-dialog-btn-cancel" data-action="cancel">
                    キャンセル
                </button>
            </div>
        `;

        return this.showDialog(html);
    }

    /**
     * ルート重複ダイアログを表示
     * @param {Object} existing - 既存のルートデータ
     * @param {Object} attempted - 追加しようとしたルートデータ
     * @returns {Promise<string>} 'update'|'cancel'
     */
    async showRouteDuplicateDialog(existing, attempted) {
        const html = `
            <div class="duplicate-dialog-header">
                <span class="duplicate-dialog-icon">⚠️</span>
                <h3>ルートの重複検出</h3>
            </div>
            <div class="duplicate-dialog-body">
                <p class="duplicate-dialog-message">
                    同じ開始・終了ポイントのルートが既に存在します。
                </p>
                <div class="duplicate-dialog-comparison">
                    <div class="duplicate-dialog-item">
                        <h4>既存のルート</h4>
                        <p>開始: <span class="highlight">${existing.startPoint}</span></p>
                        <p>終了: <span class="highlight">${existing.endPoint}</span></p>
                        <p>中間点: ${existing.waypointCount || 0}個</p>
                    </div>
                    <div class="duplicate-dialog-arrow">→</div>
                    <div class="duplicate-dialog-item">
                        <h4>新しいルート</h4>
                        <p>開始: <span class="highlight">${attempted.startPoint}</span></p>
                        <p>終了: <span class="highlight">${attempted.endPoint}</span></p>
                        <p>中間点: ${(attempted.waypoints || []).length}個</p>
                    </div>
                </div>
                <p class="duplicate-dialog-question">どうしますか？</p>
            </div>
            <div class="duplicate-dialog-footer">
                <button class="duplicate-dialog-btn duplicate-dialog-btn-update" data-action="update">
                    既存のルートを更新
                </button>
                <button class="duplicate-dialog-btn duplicate-dialog-btn-cancel" data-action="cancel">
                    キャンセル
                </button>
            </div>
        `;

        return this.showDialog(html);
    }

    /**
     * スポット重複ダイアログを表示
     * @param {Object} existing - 既存のスポットデータ
     * @param {Object} attempted - 追加しようとしたスポットデータ
     * @returns {Promise<string>} 'update'|'cancel'|'keep'
     */
    async showSpotDuplicateDialog(existing, attempted) {
        const html = `
            <div class="duplicate-dialog-header">
                <span class="duplicate-dialog-icon">⚠️</span>
                <h3>スポットの重複検出</h3>
            </div>
            <div class="duplicate-dialog-body">
                <p class="duplicate-dialog-message">
                    同じ名称と座標のスポットが既に存在します。
                </p>
                <div class="duplicate-dialog-comparison">
                    <div class="duplicate-dialog-item">
                        <h4>既存のスポット</h4>
                        <p>名称: <span class="highlight">${existing.name}</span></p>
                        <p>座標: (${Math.round(existing.x)}, ${Math.round(existing.y)})</p>
                    </div>
                    <div class="duplicate-dialog-arrow">→</div>
                    <div class="duplicate-dialog-item">
                        <h4>新しいスポット</h4>
                        <p>名称: <span class="highlight">${attempted.name}</span></p>
                        <p>座標: (${Math.round(attempted.x)}, ${Math.round(attempted.y)})</p>
                    </div>
                </div>
                <p class="duplicate-dialog-question">どうしますか？</p>
            </div>
            <div class="duplicate-dialog-footer">
                <button class="duplicate-dialog-btn duplicate-dialog-btn-keep" data-action="keep">
                    既存のスポットを保持
                </button>
                <button class="duplicate-dialog-btn duplicate-dialog-btn-cancel" data-action="cancel">
                    キャンセル
                </button>
            </div>
        `;

        return this.showDialog(html);
    }

    /**
     * ダイアログを表示して、ユーザーの選択を待つ
     * @param {string} html - ダイアログHTML
     * @returns {Promise<string>} ユーザーの選択 ('update'|'cancel'|'rename'|'keep')
     */
    showDialog(html) {
        return new Promise((resolve) => {
            this.resolveCallback = resolve;

            // HTMLを設定
            this.dialog.innerHTML = html;

            // ボタンのイベントリスナーを設定
            const buttons = this.dialog.querySelectorAll('[data-action]');
            buttons.forEach(button => {
                button.addEventListener('click', (e) => {
                    const action = e.target.getAttribute('data-action');
                    this.closeDialog(action);
                });
            });

            // オーバーレイのクリックでキャンセル
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.closeDialog('cancel');
                }
            });

            // Escapeキーでキャンセル
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    this.closeDialog('cancel');
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);

            // ダイアログを表示
            this.overlay.style.display = 'flex';
            this.dialog.style.animation = 'duplicateDialogSlideIn 0.3s ease-out';
        });
    }

    /**
     * ダイアログを閉じる
     * @param {*} value - 返す値（アクション名、入力値など）
     */
    closeDialog(value) {
        this.dialog.style.animation = 'duplicateDialogSlideOut 0.2s ease-in';

        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.dialog.innerHTML = '';

            if (this.resolveCallback) {
                this.resolveCallback(value);
                this.resolveCallback = null;
            }
        }, 200);
    }

    /**
     * 新しいIDを入力させるダイアログ
     * @param {string} oldId - 元のID
     * @returns {Promise<string|null>} 新しいID（キャンセル時はnull）
     */
    async promptNewId(oldId) {
        const html = `
            <div class="duplicate-dialog-header">
                <span class="duplicate-dialog-icon">✏️</span>
                <h3>新しいポイントIDを入力</h3>
            </div>
            <div class="duplicate-dialog-body">
                <p class="duplicate-dialog-message">
                    "${oldId}" は既に使用されています。<br>
                    別のポイントIDを入力してください。
                </p>
                <div class="duplicate-dialog-input-group">
                    <label for="newPointId">新しいポイントID:</label>
                    <input
                        type="text"
                        id="newPointId"
                        class="duplicate-dialog-input"
                        placeholder="例: A-14"
                        value="${oldId}"
                    />
                    <p class="duplicate-dialog-hint">※ 形式: X-nn (例: A-01, B-12)</p>
                </div>
            </div>
            <div class="duplicate-dialog-footer">
                <button class="duplicate-dialog-btn duplicate-dialog-btn-primary" data-action="ok">
                    OK
                </button>
                <button class="duplicate-dialog-btn duplicate-dialog-btn-cancel" data-action="cancel">
                    キャンセル
                </button>
            </div>
        `;

        return new Promise((resolve) => {
            this.resolveCallback = resolve;

            this.dialog.innerHTML = html;

            const input = this.dialog.querySelector('#newPointId');
            const okBtn = this.dialog.querySelector('[data-action="ok"]');
            const cancelBtn = this.dialog.querySelector('[data-action="cancel"]');

            // 入力フィールドにフォーカス
            setTimeout(() => input.focus(), 100);

            // OKボタン
            okBtn.addEventListener('click', () => {
                const newId = input.value.trim();
                if (newId) {
                    this.closeDialog(newId);
                } else {
                    alert('IDを入力してください');
                }
            });

            // キャンセルボタン
            cancelBtn.addEventListener('click', () => {
                this.closeDialog(null);
            });

            // Enterキーで確定
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const newId = input.value.trim();
                    if (newId) {
                        this.closeDialog(newId);
                    }
                } else if (e.key === 'Escape') {
                    this.closeDialog(null);
                }
            });

            // ダイアログを表示
            this.overlay.style.display = 'flex';
            this.dialog.style.animation = 'duplicateDialogSlideIn 0.3s ease-out';
        });
    }

}

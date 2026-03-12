/**
 * マーカーサイズ設定マネージャー
 * 各マーカーのサイズ設定を管理し、localStorageに保存
 */
export class MarkerSettingsManager {
    constructor() {
        // デフォルトのマーカーサイズ
        this.defaultSizes = {
            point: 6,
            selectedWaypoint: 6,
            unselectedWaypoint: 4,
            unselectedWaypoint: 4,
            spot: 12,
            areaVertex: 6
        };

        // 現在のマーカーサイズ
        this.currentSizes = { ...this.defaultSizes };

        // DOM要素
        this.dialog = null;
        this.overlay = null;
        this.inputs = {};

        // コールバック
        this.onSettingsChange = null;

        // localStorageキー
        this.storageKey = 'pointMarkerSettings';

        this.init();
    }

    /**
     * 初期化
     */
    init() {
        // DOM要素の取得
        this.dialog = document.getElementById('markerSettingsDialog');
        this.overlay = this.dialog;

        if (!this.dialog) {
            console.error('MarkerSettingsManager: markerSettingsDialog 要素が見つかりません');
            return;
        }

        this.inputs = {
            point: document.getElementById('pointSizeInput'),
            selectedWaypoint: document.getElementById('selectedWaypointSizeInput'),
            unselectedWaypoint: document.getElementById('unselectedWaypointSizeInput'),
            unselectedWaypoint: document.getElementById('unselectedWaypointSizeInput'),
            spot: document.getElementById('spotSizeInput'),
            areaVertex: document.getElementById('areaVertexSizeInput')
        };

        this.sliders = {
            point: document.getElementById('pointSizeSlider'),
            selectedWaypoint: document.getElementById('selectedWaypointSizeSlider'),
            unselectedWaypoint: document.getElementById('unselectedWaypointSizeSlider'),
            unselectedWaypoint: document.getElementById('unselectedWaypointSizeSlider'),
            spot: document.getElementById('spotSizeSlider'),
            areaVertex: document.getElementById('areaVertexSizeSlider')
        };

        // タブ要素
        this.tabs = document.querySelectorAll('.settings-tab-btn');
        this.tabContents = document.querySelectorAll('.settings-tab-content');

        // データベース操作ボタン
        this.databaseLoadBtn = document.getElementById('databaseLoadBtn');
        this.databaseExportBtn = document.getElementById('databaseExportBtn');
        this.databaseCancelBtn = document.getElementById('databaseCancelBtn');

        // フッター要素
        this.dialogFooter = this.dialog.querySelector('.settings-dialog-footer');

        // ボタン要素の取得
        this.okBtn = document.getElementById('settingsOkBtn');
        this.cancelBtn = document.getElementById('settingsCancelBtn');
        this.resetBtn = document.getElementById('settingsResetBtn');

        if (!this.okBtn || !this.cancelBtn || !this.resetBtn) {
            console.error('MarkerSettingsManager: ボタン要素が見つかりません');
            return;
        }

        // イベントリスナーの設定
        this.setupEventListeners();

        // localStorageから設定を読み込み
        this.loadSettings();
    }

    /**
     * イベントリスナーの設定
     */
    setupEventListeners() {
        // OKボタン
        this.okBtn.addEventListener('click', () => {
            this.applySettings();
        });

        // キャンセルボタン
        this.cancelBtn.addEventListener('click', () => {
            this.closeDialog();
        });

        // 初期値に戻すボタン
        this.resetBtn.addEventListener('click', () => {
            this.resetToDefaultAndApply();
        });

        // スライダーと数値入力欄の同期
        this.setupSliderSync('point');
        this.setupSliderSync('selectedWaypoint');
        this.setupSliderSync('unselectedWaypoint');
        this.setupSliderSync('unselectedWaypoint');
        this.setupSliderSync('spot');
        this.setupSliderSync('areaVertex');

        // タブ切り替え
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;
                this.switchTab(targetTab);
            });
        });

        // オーバーレイクリックで閉じる
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.closeDialog();
            }
        });

        // Escapeキーで閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dialog.style.display !== 'none') {
                this.closeDialog();
            }
        });

        // データベースタブのキャンセルボタン
        if (this.databaseCancelBtn) {
            this.databaseCancelBtn.addEventListener('click', () => {
                this.closeDialog();
            });
        }
    }

    /**
     * スライダーと数値入力欄の同期設定
     * @param {string} key - マーカータイプのキー
     */
    setupSliderSync(key) {
        const slider = this.sliders[key];
        const input = this.inputs[key];

        // スライダー変更時 → 数値入力欄を更新
        slider.addEventListener('input', () => {
            input.value = parseFloat(slider.value).toFixed(1);
        });

        // 数値入力欄変更時 → スライダーを更新
        input.addEventListener('input', () => {
            const value = parseFloat(input.value);
            if (!isNaN(value)) {
                slider.value = value;
            }
        });
    }

    /**
     * タブを切り替える
     * @param {string} tabId - タブID ('marker-settings' | 'database-settings')
     */
    switchTab(tabId) {
        // ボタンのアクティブ状態を更新
        this.tabs.forEach(tab => {
            if (tab.dataset.tab === tabId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // コンテンツの表示状態を更新
        this.tabContents.forEach(content => {
            if (content.id === `tab-${tabId}`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        // フッターの表示切り替え
        if (tabId === 'database-settings') {
            this.dialogFooter.style.display = 'none';
        } else {
            this.dialogFooter.style.display = 'flex';
        }
    }

    /**
     * データベース操作のリスナーを設定
     * @param {Object} callbacks - { onLoad: Function, onExport: Function }
     */
    setupDatabaseListeners(callbacks) {
        if (this.databaseLoadBtn && callbacks.onLoad) {
            this.databaseLoadBtn.addEventListener('click', callbacks.onLoad);
        }
        if (this.databaseExportBtn && callbacks.onExport) {
            this.databaseExportBtn.addEventListener('click', callbacks.onExport);
        }
    }

    /**
     * ダイアログを開く
     */
    openDialog() {
        if (!this.dialog) {
            console.error('MarkerSettingsManager: ダイアログ要素が存在しません');
            return;
        }

        // 現在の設定値を入力フィールドとスライダーに反映（小数点1桁まで表示）
        this.inputs.point.value = this.currentSizes.point.toFixed(1);
        this.sliders.point.value = this.currentSizes.point;

        this.inputs.selectedWaypoint.value = this.currentSizes.selectedWaypoint.toFixed(1);
        this.sliders.selectedWaypoint.value = this.currentSizes.selectedWaypoint;

        this.inputs.unselectedWaypoint.value = this.currentSizes.unselectedWaypoint.toFixed(1);
        this.sliders.unselectedWaypoint.value = this.currentSizes.unselectedWaypoint;

        this.inputs.spot.value = this.currentSizes.spot.toFixed(1);
        this.sliders.spot.value = this.currentSizes.spot;

        this.inputs.areaVertex.value = this.currentSizes.areaVertex.toFixed(1);
        this.sliders.areaVertex.value = this.currentSizes.areaVertex;

        // ダイアログを表示
        this.dialog.style.display = 'flex';
    }

    /**
     * ダイアログを閉じる
     */
    closeDialog() {
        this.dialog.style.display = 'none';
    }

    /**
     * 設定を適用
     */
    applySettings() {
        // 入力値を取得（実数値として解析）
        const newSizes = {
            point: parseFloat(this.inputs.point.value),
            selectedWaypoint: parseFloat(this.inputs.selectedWaypoint.value),
            unselectedWaypoint: parseFloat(this.inputs.unselectedWaypoint.value),
            unselectedWaypoint: parseFloat(this.inputs.unselectedWaypoint.value),
            spot: parseFloat(this.inputs.spot.value),
            areaVertex: parseFloat(this.inputs.areaVertex.value)
        };

        // バリデーション
        if (!this.validateSizes(newSizes)) {
            alert('入力値が範囲外です。正しい値を入力してください。');
            return;
        }

        // 現在のサイズを更新
        this.currentSizes = newSizes;

        // localStorageに保存
        this.saveSettings();

        // コールバックを実行
        if (this.onSettingsChange) {
            this.onSettingsChange(this.currentSizes);
        }

        // ダイアログを閉じる
        this.closeDialog();
    }

    /**
     * サイズのバリデーション
     */
    validateSizes(sizes) {
        // 各値が存在し、数値であることを確認
        if (typeof sizes.point !== 'number' ||
            typeof sizes.selectedWaypoint !== 'number' ||
            typeof sizes.unselectedWaypoint !== 'number' ||
            typeof sizes.spot !== 'number' ||
            typeof sizes.areaVertex !== 'number') {
            return false;
        }

        // ポイント: 2-12px
        if (sizes.point < 2 || sizes.point > 12) return false;

        // 選択ルート中間点: 2-12px
        if (sizes.selectedWaypoint < 2 || sizes.selectedWaypoint > 12) return false;

        // 非選択ルート中間点: 2-12px
        if (sizes.unselectedWaypoint < 2 || sizes.unselectedWaypoint > 12) return false;

        // スポット: 4-20px
        if (sizes.spot < 4 || sizes.spot > 20) return false;

        // エリア頂点: 2-12px
        if (sizes.areaVertex < 2 || sizes.areaVertex > 12) return false;

        return true;
    }

    /**
     * localStorageに設定を保存
     */
    saveSettings() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.currentSizes));
        } catch (error) {
            console.error('localStorageへの保存に失敗しました:', error);
        }
    }

    /**
     * localStorageから設定を読み込み
     */
    loadSettings() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);

                // デフォルト値とマージして、新しい設定項目（areaVertex等）が欠落しないようにする
                const merged = { ...this.defaultSizes, ...parsed };

                // バリデーション
                if (this.validateSizes(merged)) {
                    this.currentSizes = merged;
                } else {
                    console.warn('保存されたマーカーサイズ設定が無効です。デフォルト値を使用します。');
                    // 無効な場合はデフォルト値を使用（currentSizesは既にコンストラクタでデフォルト値で初期化されている）
                }
            }
        } catch (error) {
            console.error('localStorageからの読み込みに失敗しました:', error);
        }
    }

    /**
     * 現在のマーカーサイズを取得
     */
    getSizes() {
        return { ...this.currentSizes };
    }

    /**
     * 設定変更時のコールバックを設定
     */
    setCallback(callback) {
        this.onSettingsChange = callback;
    }

    /**
     * 設定をリセット
     */
    resetToDefault() {
        this.currentSizes = { ...this.defaultSizes };
        this.saveSettings();

        if (this.onSettingsChange) {
            this.onSettingsChange(this.currentSizes);
        }
    }

    /**
     * 初期値に戻して適用
     */
    resetToDefaultAndApply() {
        // デフォルト値を入力フィールドとスライダーに反映（小数点1桁表示、確認なし）
        this.inputs.point.value = this.defaultSizes.point.toFixed(1);
        this.sliders.point.value = this.defaultSizes.point;

        this.inputs.selectedWaypoint.value = this.defaultSizes.selectedWaypoint.toFixed(1);
        this.sliders.selectedWaypoint.value = this.defaultSizes.selectedWaypoint;

        this.inputs.unselectedWaypoint.value = this.defaultSizes.unselectedWaypoint.toFixed(1);
        this.sliders.unselectedWaypoint.value = this.defaultSizes.unselectedWaypoint;

        this.inputs.spot.value = this.defaultSizes.spot.toFixed(1);
        this.sliders.spot.value = this.defaultSizes.spot;

        this.inputs.areaVertex.value = this.defaultSizes.areaVertex.toFixed(1);
        this.sliders.areaVertex.value = this.defaultSizes.areaVertex;
    }
}

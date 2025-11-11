/**
 * レイアウトと編集モードの管理を行うクラス
 */
export class LayoutManager {
    constructor() {
        this.currentLayout = 'overlay';  // デフォルトをオーバーレイに変更
        this.currentEditingMode = 'point';
        this.callbacks = {
            onLayoutChange: null,
            onModeChange: null
        };

        this.initializeEventListeners();
        this.updateDisplay();
    }

    /**
     * コールバック関数を設定
     * @param {string} event - イベント名
     * @param {Function} callback - コールバック関数
     */
    setCallback(event, callback) {
        this.callbacks[event] = callback;
    }

    /**
     * 変更通知を発行
     * @param {string} event - イベント名
     * @param {any} data - イベントデータ
     */
    notify(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event](data);
        }
    }

    /**
     * イベントリスナーを初期化
     */
    initializeEventListeners() {
        // レイアウト選択機能は削除されました（オーバーレイ固定）

        const editingModeRadios = document.querySelectorAll('input[name="editingMode"]');
        editingModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.setEditingMode(e.target.value);
                }
            });
        });
    }

    /**
     * レイアウトを変更
     * @param {string} layout - レイアウトモード ('sidebar' | 'overlay')
     */
    setLayout(layout) {
        this.currentLayout = layout;
        this.updateLayoutDisplay();
        this.notify('onLayoutChange', layout);
    }

    /**
     * 編集モードを変更
     * @param {string} mode - 編集モード ('point' | 'route' | 'spot')
     */
    setEditingMode(mode) {
        this.currentEditingMode = mode;
        this.updateEditingModeDisplay();
        this.notify('onModeChange', mode);
    }

    /**
     * 現在のレイアウトを取得
     * @returns {string} 現在のレイアウト
     */
    getCurrentLayout() {
        return this.currentLayout;
    }

    /**
     * 現在の編集モードを取得
     * @returns {string} 現在の編集モード
     */
    getCurrentEditingMode() {
        return this.currentEditingMode;
    }

    /**
     * レイアウト表示を更新
     */
    updateLayoutDisplay() {
        const mainContent = document.querySelector('.main-content');
        mainContent.setAttribute('data-layout', this.currentLayout);

        // レイアウト選択ラジオボタンは削除されました（オーバーレイ固定）
    }

    /**
     * 編集モード表示を更新
     */
    updateEditingModeDisplay() {
        const pointEditor = document.getElementById('pointEditor');
        const routeEditor = document.getElementById('routeEditor');
        const spotEditor = document.getElementById('spotEditor');
        
        // 全パネルを一旦非表示
        pointEditor.style.display = 'none';
        routeEditor.style.display = 'none';
        spotEditor.style.display = 'none';
        
        // 選択されたモードのパネルのみ表示
        if (this.currentEditingMode === 'point') {
            pointEditor.style.display = 'flex';
        } else if (this.currentEditingMode === 'route') {
            routeEditor.style.display = 'block';
        } else if (this.currentEditingMode === 'spot') {
            spotEditor.style.display = 'flex';
        }
        
        const radio = document.querySelector(`input[name="editingMode"][value="${this.currentEditingMode}"]`);
        if (radio) {
            radio.checked = true;
        }
    }

    /**
     * 表示状態を初期化
     */
    updateDisplay() {
        this.updateLayoutDisplay();
        this.updateEditingModeDisplay();
    }

    /**
     * 編集モードをポイント編集に設定（画像読み込み後のデフォルト）
     */
    setDefaultPointMode() {
        const radio = document.querySelector('input[name="editingMode"][value="point"]');
        if (radio) {
            radio.checked = true;
        }
        this.setEditingMode('point');
    }
}
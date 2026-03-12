import { UIHelper } from './UIHelper.js';

export class AreaUIManager {
    /**
     * @param {PointMarkerApp} app - アプリケーションのメインインスタンス
     */
    constructor(app) {
        this.app = app;
    }

    /**
     * エリア選択ドロップダウンを更新
     * @param {Array} areas - エリア配列
     */
    updateAreaDropdown(areas) {
        const dropdown = document.getElementById('areaSelectDropdown');
        if (!dropdown) return;

        const currentSelectedIndex = this.app.areaManager.selectedAreaIndex;
        dropdown.innerHTML = '<option value="">-- エリアを選択 --</option>';

        // エリアを表示名・元インデックスのペアで昇順ソートして追加
        const sortedAreas = areas
            .map((area, index) => ({
                originalIndex: index,
                displayName: area.areaName || `エリア ${index + 1}`
            }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));

        sortedAreas.forEach(({ originalIndex, displayName }) => {
            const option = document.createElement('option');
            option.value = originalIndex.toString();
            option.textContent = displayName;
            dropdown.appendChild(option);
        });

        dropdown.value = currentSelectedIndex >= 0 ? currentSelectedIndex.toString() : '';

        // エリア名入力フィールドも連動更新
        this.updateAreaNameInput();
    }

    /**
     * 新しいエリアを追加
     */
    handleAddArea() {
        const defaultName = `エリア ${this.app.areaManager.getAllAreas().length + 1}`;
        const areaName = window.prompt('エリア名を入力してください', defaultName);

        if (areaName === null) {
            return; // Cancelled
        }

        const newArea = {
            areaName: areaName.trim() || defaultName,
            vertices: []
        };
        this.app.areaManager.addArea(newArea);
        const newIndex = this.app.areaManager.getAllAreas().length - 1;
        this.app.areaManager.selectArea(newIndex);

        UIHelper.showMessage('新しいエリアを追加しました。画像上で頂点をクリックして追加してください');
    }

    /**
     * エリア名入力フィールドを更新
     */
    updateAreaNameInput() {
        const input = document.getElementById('areaNameInput');
        if (!input) return;

        const selectedIndex = this.app.areaManager.selectedAreaIndex;
        if (selectedIndex >= 0) {
            const area = this.app.areaManager.getSelectedArea();
            if (area) {
                input.value = area.areaName || '';
                input.disabled = false;
            }
        } else {
            input.value = '';
            input.disabled = true;
        }
    }

    /**
     * エリア名変更時の処理
     * @param {string} newName - 新しいエリア名
     */
    handleAreaNameChange(newName) {
        const index = this.app.areaManager.selectedAreaIndex;
        if (index < 0) return;

        if (newName !== null) {
            this.app.areaManager.setAreaName(newName);
            UIHelper.showMessage(`エリア名を「${newName}」に変更しました`);
        }
    }

    /**
     * エリアを削除
     */
    handleDeleteArea() {
        const index = this.app.areaManager.selectedAreaIndex;
        if (index < 0) {
            UIHelper.showError('エリアが選択されていません');
            return;
        }

        const area = this.app.areaManager.getSelectedArea();
        if (confirm(`エリア「${area.areaName}」を削除しますか？`)) {
            // Firebase連携: 削除 (将来的な実装のためにIDチェックは維持)
            if (area.firestoreId) {
                // 将来的にFirebase削除処理が必要な場合はここに記述
            }

            this.app.areaManager.deleteArea(index);
            UIHelper.showMessage('エリアを削除しました');
        }
    }
}

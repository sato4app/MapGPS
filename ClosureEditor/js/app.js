// ClosureEditor エントリーポイント
// 通行止め・通行困難地点の位置指定 → 属性編集 → ファイル出力 → 公開 を1画面で行う。

import { APP_VERSION } from './constants.js';
import { initializeMap } from './mapCore.js';
import { showMessage } from './message.js';
import * as Closure from './closureEditor.js';
import * as Basemap from './basemap.js';
import { setupClosureFileLoad, setupClosureFileExport } from './fileIO.js';
import { setupPublish } from './publish.js';

// ===== 初期化 =====
const { map, closureLayer } = initializeMap();

Closure.init(map, closureLayer);
Basemap.init(map);
setupClosureFileLoad();
setupClosureFileExport();
setupPublish();

document.getElementById('appVersion').textContent = `版 ${APP_VERSION}`;
Closure.updateClosureDropdown();

// ===== 登録地点パネルのイベント =====

// 登録地点ドロップダウン
document.getElementById('closureSelect').addEventListener('change', function () {
    Closure.highlightClosure(this.value);
});

// 選択地点名のフォーカス離脱時の処理
document.getElementById('selectedClosureName').addEventListener('blur', function () {
    const feature = Closure.getSelectedFeature();
    const newName = this.value.trim();
    if (!feature) return;
    if (!newName) {
        // 空欄のままにはできない。現在の名称に戻す
        this.value = feature.properties.name || '';
        return;
    }
    if (feature.properties.name === newName) return;

    feature.properties.name = newName;
    Closure.touchUpdatedAt(feature);
    Closure.updateClosureDropdown();
    Closure.updateClosurePopup(feature);

    showMessage('登録地点名を更新しました', 'success');
});

// 備考（note）のフォーカス離脱時の処理
document.getElementById('closureNote').addEventListener('blur', function () {
    const feature = Closure.getSelectedFeature();
    if (!feature) return;

    const newNote = this.value.trim();
    if (newNote === (feature.properties.note || '')) return;

    feature.properties.note = newNote;
    Closure.touchUpdatedAt(feature);
    Closure.updateClosurePopup(feature);

    showMessage('備考を更新しました', 'success');
});

// 区分（kind）ラジオボタン
document.querySelectorAll('input[name="closureKind"]').forEach(radio => {
    radio.addEventListener('change', function () {
        const feature = Closure.getSelectedFeature();
        if (!feature) return;

        feature.properties.kind = this.value;
        // 区分に応じてマーカーの形状を更新（選択中はハイライト色を維持）
        Closure.refreshSelectedClosureIcon();
        Closure.touchUpdatedAt(feature);
        Closure.updateClosurePopup(feature);
        Closure.updateClosureDropdown();

        showMessage('区分を更新しました', 'success');
    });
});

// 登録理由（reason）ラジオボタン
document.querySelectorAll('input[name="closureReason"]').forEach(radio => {
    radio.addEventListener('change', function () {
        const feature = Closure.getSelectedFeature();
        if (!feature) return;

        feature.properties.reason = this.value;
        Closure.touchUpdatedAt(feature);
        Closure.updateClosurePopup(feature);

        showMessage('登録理由を更新しました', 'success');
    });
});

// 追加・移動ボタン
document.getElementById('addMoveClosureBtn').addEventListener('click', function () {
    Closure.toggleAddMoveMode();
});

// 削除ボタン
document.getElementById('deleteClosureBtn').addEventListener('click', function () {
    Closure.deleteSelectedClosure();
});

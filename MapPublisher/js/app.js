// MapPublisher エントリーポイント
//
// MapEditor / DownloadArea が出力したファイルを読み込み → 内容を確認 → 公開する。
// 地点の登録・編集や領域の指定は行わない（それぞれ MapEditor / DownloadArea の役割）。

import { APP_VERSION } from './constants.js';
import { initializeMap } from './mapCore.js';
import { showMessage } from './message.js';
import * as MapData from './mapData.js';
import * as ClosureData from './closureData.js';
import * as TileData from './tileData.js';
import { setupMapDataLoad, setupClosureLoad, setupTileLoad } from './fileIO.js';
import { setupPublish } from './publish.js';

// ===== 初期化 =====
const { map } = initializeMap();

MapData.init(map);
ClosureData.init(map);
TileData.init(map);

document.getElementById('appVersion').textContent = `版 ${APP_VERSION}`;

// ===== 件数サマリの表示 =====

function updateMapDataSummary() {
    const summary = document.getElementById('mapDataCounts');
    const note = document.getElementById('mapDataExcluded');

    if (!MapData.isLoaded()) {
        summary.textContent = '未読み込み';
        note.textContent = '';
        return;
    }

    const parts = MapData.getCounts().map(c => `${c.label} ${c.count}`);
    summary.textContent = `${parts.join(' / ')}（計 ${MapData.getTotal()}件）`;
    note.textContent = MapData.getExcludedSummary();
}

function updateClosureSummary() {
    const summary = document.getElementById('closureCounts');
    const note = document.getElementById('closureNote');

    if (!ClosureData.isLoaded()) {
        summary.textContent = '未読み込み';
        note.textContent = '';
        return;
    }

    const counts = ClosureData.getCounts();
    summary.textContent = `通行止め ${counts.closed} / 通行困難 ${counts.difficult}`
        + `（計 ${counts.total}件）`;

    const normalized = ClosureData.getNormalizedCount();
    note.textContent = normalized > 0 ? `区分未設定 ${normalized}件を通行止めとして扱います` : '';
}

// ズームレベルの選択候補は読み込んだファイルの内容で決まる（z14〜z18 を想定）。
// 読み込み・消去・公開中データへの復元のたびに作り直す。
function updateTileZoomOptions() {
    const select = document.getElementById('tileZoomSelect');
    const levels = TileData.getZoomLevels();
    const selected = TileData.getZoom();

    select.innerHTML = '';
    levels.forEach(level => {
        const option = document.createElement('option');
        option.value = String(level.z);
        option.textContent = `z${level.z}`;
        option.selected = level.z === selected;
        select.appendChild(option);
    });

    // 未読み込みのときは選ぶものがない
    select.disabled = levels.length === 0;
}

// タイル一覧はレイヤー別の枚数を出す。合計だけでは、レイヤーが1つ欠けた
// マニフェストや別範囲のファイルとの取り違えに気づけないため。
function updateTileSummary() {
    const summary = document.getElementById('tileCounts');

    updateTileZoomOptions();

    if (!TileData.isLoaded()) {
        summary.textContent = '未読み込み';
        return;
    }

    const parts = TileData.getLayerCounts().map(l => `${l.key} ${l.count}`);
    summary.textContent = `${parts.join(' / ')}（計 ${TileData.getTotal()}枚）`;
}

// 公開に失敗して公開中のデータへ戻したときなど、読み込み済みデータが
// 入れ替わったら3つとも描き直す
function updateAllSummaries() {
    updateMapDataSummary();
    updateClosureSummary();
    updateTileSummary();
}

// ===== ファイル読み込み・公開 =====

setupMapDataLoad(updateMapDataSummary);
setupClosureLoad(updateClosureSummary);
setupTileLoad(updateTileSummary);
setupPublish(updateAllSummaries);

// ===== データセットの開閉 =====
// 同じ name を持つ <details> は1つだけ開く（HTML標準）。未対応のブラウザでは
// 3つとも開けてしまいパネルが地図を覆うため、そのときだけ他を閉じる。
// 開閉は地図の表示とは無関係（index.html の注記を参照）。

if (!('name' in document.createElement('details'))) {
    const sections = document.querySelectorAll('.panel-section');

    sections.forEach(section => {
        section.addEventListener('toggle', function () {
            if (!this.open) return;
            sections.forEach(other => {
                if (other !== this) other.open = false;
            });
        });
    });
}

// ===== 表示切り替え・消去 =====

document.getElementById('mapDataVisible').addEventListener('change', function () {
    MapData.setVisible(this.checked);
});

document.getElementById('closureVisible').addEventListener('change', function () {
    ClosureData.setVisible(this.checked);
});

document.getElementById('tileVisible').addEventListener('change', function () {
    TileData.setVisible(this.checked);
});

// 描けるのは1レベル分のみ。選び直したらそのレベルの領域へ描き替える
document.getElementById('tileZoomSelect').addEventListener('change', function () {
    TileData.setZoom(Number(this.value));
});

document.getElementById('clearMapDataBtn').addEventListener('click', function () {
    if (!MapData.isLoaded()) {
        showMessage('読み込んだハイキングマップデータはありません', 'warning');
        return;
    }
    MapData.clear();
    updateMapDataSummary();
    showMessage('ハイキングマップデータを消去しました', 'success');
});

document.getElementById('clearClosureBtn').addEventListener('click', function () {
    if (!ClosureData.isLoaded()) {
        showMessage('読み込んだ登録地点はありません', 'warning');
        return;
    }
    ClosureData.clear();
    updateClosureSummary();
    showMessage('登録地点を消去しました', 'success');
});

document.getElementById('clearTileBtn').addEventListener('click', function () {
    if (!TileData.isLoaded()) {
        showMessage('読み込んだタイル一覧はありません', 'warning');
        return;
    }
    TileData.clear();
    updateTileSummary();
    showMessage('タイル一覧を消去しました', 'success');
});

// 初期表示
updateAllSummaries();

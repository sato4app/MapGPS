// GeoJSON ファイルの読み込みと出力
//
// 読み込みはどちらのデータセットも「置換」方式（各データモジュールの load を参照）。
// 出力は公開スキーマへ整形した結果を保存する。公開前の内容確認と、
// 公開に失敗したときの控えの2つの用途がある。

import { showMessage } from './message.js';
import { getDateString, getDateTimeIso, saveBlobAsFile } from './utils.js';
import * as MapData from './mapData.js';
import * as ClosureData from './closureData.js';

// ===== 読み込み =====

async function readJson(file) {
    try {
        return JSON.parse(await file.text());
    } catch {
        throw new Error('JSONとして読み込めません');
    }
}

// ファイル選択のイベントを配線する。読み込み後に onLoaded を呼ぶ。
function bindFileInput(inputId, handler, onLoaded) {
    document.getElementById(inputId).addEventListener('change', async function () {
        const file = this.files[0];
        if (!file) return;

        try {
            const json = await readJson(file);
            handler(json, file.name);
            onLoaded();
        } catch (error) {
            console.error('読み込みエラー:', error);
            showMessage(`読み込みエラー (${file.name}): ${error.message}`, 'error');
        } finally {
            // 同じファイルを選び直せるように値を消す
            this.value = '';
        }
    });
}

export function setupMapDataLoad(onLoaded) {
    bindFileInput('mapDataFileInput', (json, fileName) => {
        const result = MapData.load(json);

        if (result.total === 0) {
            showMessage(`${fileName}: 公開対象のデータが見つかりませんでした`, 'warning');
            return;
        }

        const parts = MapData.getCounts().map(c => `${c.label} ${c.count}`);
        const excluded = MapData.getExcludedSummary();
        const msg = `${result.total}件を読み込みました（${parts.join(' / ')}）`;

        showMessage(excluded ? `${msg}\n${excluded}は公開しません` : msg, 'success');
    }, onLoaded);
}

export function setupClosureLoad(onLoaded) {
    bindFileInput('closureFileInput', (json, fileName) => {
        const result = ClosureData.load(json);

        if (result.total === 0) {
            showMessage(`${fileName}: 通行止め・通行困難地点が見つかりませんでした`, 'warning');
            return;
        }

        const counts = ClosureData.getCounts();
        const msg = `${result.total}件を読み込みました（通行止め ${counts.closed} / 通行困難 ${counts.difficult}）`;

        // 区分が未選択・不正だった地点は既定値へ寄せている。黙って変えると気づけないため知らせる
        if (result.normalized > 0) {
            showMessage(`${msg}\n区分が未設定の${result.normalized}件を「通行止め」として扱います`, 'warning');
        } else {
            showMessage(msg, 'success');
        }
    }, onLoaded);
}

// ===== 出力 =====

// 出力ファイル名: MapData-yyyymmdd_P{ポイント}_R{ルート}_S{スポット}.geojson
export function buildMapDataFileName() {
    const c = Object.fromEntries(MapData.getCounts().map(x => [x.type, x.count]));
    return `MapData-${getDateString()}`
        + `_P${c['ポイントGPS'] || 0}_R${c.route || 0}_S${c.spot || 0}.geojson`;
}

// 出力ファイル名: Closure-yyyymmdd_C{通行止め}_D{通行困難}.geojson
export function buildClosureFileName() {
    const counts = ClosureData.getCounts();
    return `Closure-${getDateString()}_C${counts.closed}_D${counts.difficult}.geojson`;
}

// 公開スキーマへ整形した内容を保存する。
// version はサーバーが採番するため、出力ファイルには含めない（updatedAt は出力日時）。
export async function saveAsFile(data, filename) {
    const body = {
        type: 'FeatureCollection',
        updatedAt: getDateTimeIso(),
        features: data.features
    };
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/geo+json' });
    return saveBlobAsFile(blob, filename);
}

export function setupExportButtons() {
    document.getElementById('exportMapDataBtn').addEventListener('click', async function () {
        if (!MapData.isLoaded()) {
            showMessage('出力するハイキングマップデータがありません', 'warning');
            return;
        }
        const saved = await saveAsFile(MapData.buildPublishData(), buildMapDataFileName());
        if (saved) showMessage('公開スキーマへ整形して出力しました', 'success');
    });

    document.getElementById('exportClosureBtn').addEventListener('click', async function () {
        if (!ClosureData.isLoaded()) {
            showMessage('出力する登録地点がありません', 'warning');
            return;
        }
        const saved = await saveAsFile(ClosureData.buildPublishData(), buildClosureFileName());
        if (saved) showMessage('公開スキーマへ整形して出力しました', 'success');
    });
}

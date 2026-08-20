// 公開（公開API へのPOST）
//
// 公開APIの仕様は minoh-hiking `docs/publish-api-202608.md`（契約バージョン 2.0）に従う。
// このファイルに API の検証ルール（座標範囲・id一意・type の妥当性）を再実装しないこと。
// 判定はサーバーに任せ、失敗時は API が返した日本語メッセージをそのまま表示する
// （二重管理を避けるため。仕様書 §11「実装しないこと」）。
//
// version も同じ理由でクライアント側では扱わない。採番はサーバーの責務であり、
// 予測値を出すと採番ロジックを二重に持つことになる（仕様書 §4）。

import { API_URLS, PUBLISH_TOKEN_KEY, MAPDATA_TYPES, MAPDATA_TYPE_LABELS } from './constants.js';
import { showMessage } from './message.js';
import * as MapData from './mapData.js';
import * as ClosureData from './closureData.js';
import { saveAsFile, buildMapDataFileName, buildClosureFileName } from './fileIO.js';

// ===== 件数の内訳 =====
// 読み込んだデータと公開中のデータの双方に同じ関数を当て、同じ粒度で比べられるようにする。

function breakdownMapData(geojson) {
    const counts = {};
    (geojson.features || []).forEach(f => {
        const type = f && f.properties && f.properties.type;
        if (type) counts[type] = (counts[type] || 0) + 1;
    });
    return MAPDATA_TYPES.map(type => ({
        label: MAPDATA_TYPE_LABELS[type] || type,
        count: counts[type] || 0
    }));
}

function breakdownClosures(geojson) {
    let closed = 0;
    let difficult = 0;
    (geojson.features || []).forEach(f => {
        if (f && f.properties && f.properties.kind === 'difficult') difficult++;
        else closed++;
    });
    return [
        { label: '通行止め', count: closed },
        { label: '通行困難', count: difficult }
    ];
}

// ===== データセット定義 =====

const DATASETS = {
    mapdata: {
        key: 'mapdata',
        label: 'ハイキングマップデータ',
        url: API_URLS.mapdata,
        displayId: 'mapDataPublished',
        buttonId: 'publishMapDataBtn',
        isLoaded: () => MapData.isLoaded(),
        build: () => MapData.buildPublishData(),
        breakdown: breakdownMapData,
        fileName: buildMapDataFileName
    },
    closures: {
        key: 'closures',
        label: '通行止め・通行困難地点',
        url: API_URLS.closures,
        displayId: 'closurePublished',
        buttonId: 'publishClosureBtn',
        isLoaded: () => ClosureData.isLoaded(),
        build: () => ClosureData.buildPublishData(),
        breakdown: breakdownClosures,
        fileName: buildClosureFileName
    }
};

// ===== 現在公開中の情報 =====

// マニフェスト（全データセットの version・件数）を取得する。失敗時は null
async function fetchManifest() {
    try {
        const res = await fetch(API_URLS.manifest, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn('マニフェストの取得に失敗:', err);
        return null;
    }
}

// 個別データセットの公開データを取得する。失敗時は null
async function fetchPublished(dataset) {
    try {
        const res = await fetch(dataset.url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn(`${dataset.label}の公開データ取得に失敗:`, err);
        return null;
    }
}

function renderPublishedDisplay(dataset, info) {
    const display = document.getElementById(dataset.displayId);
    if (!info) {
        display.value = '取得できません';
        return;
    }
    display.value = info.version
        ? `${info.version}（${info.count}件）`
        : `未公開（${info.count}件）`;
}

// 「現在公開中」表示の更新。マニフェストが無ければ各データセットを直接取得する。
export async function refreshPublishedDisplays(notify = false) {
    Object.values(DATASETS).forEach(d => {
        document.getElementById(d.displayId).value = '取得中...';
    });

    const manifest = await fetchManifest();
    let ok = 0;

    for (const dataset of Object.values(DATASETS)) {
        let info = null;

        if (manifest && manifest[dataset.key]) {
            const m = manifest[dataset.key];
            info = { version: m.version || '', count: m.count ?? 0 };
        } else {
            // マニフェスト未実装・取得失敗時の代替経路
            const data = await fetchPublished(dataset);
            if (data) {
                info = {
                    version: data.version || '',
                    count: Array.isArray(data.features) ? data.features.length : 0
                };
            }
        }

        renderPublishedDisplay(dataset, info);
        if (info) ok++;
    }

    if (notify) {
        if (ok === Object.keys(DATASETS).length) {
            showMessage('現在公開中の情報を取得しました', 'success');
        } else if (ok > 0) {
            showMessage('一部のデータセットの情報を取得できませんでした', 'warning');
        } else {
            showMessage('現在公開中の情報を取得できませんでした', 'warning');
        }
    }
}

// ===== 公開前の確認 =====

// クライアント側の検証は最小限にとどめる（仕様書 §11）。
function validateMinimal(data) {
    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        return 'FeatureCollection 形式の geojson ではありません';
    }
    return null;
}

function formatBreakdown(breakdown) {
    return breakdown.map(b => `${b.label} ${b.count}`).join(' / ');
}

// 確認ダイアログ。version は自動採番のため巻き戻しの判別に使えない。
// 代わりに種別ごとの件数差分を示し、誤ったファイルからの公開に気づけるようにする。
function buildConfirmMessage(dataset, published, publishedBreakdown, next) {
    const lines = [`${dataset.label}をユーザーへ公開します。`, ''];

    if (published) {
        const version = published.version || '未公開';
        lines.push(`現在公開中: ${version}`);
        if (publishedBreakdown) {
            lines.push(`  ${formatBreakdown(publishedBreakdown)}（計 ${published.count}件）`);
        } else {
            lines.push(`  計 ${published.count}件`);
        }
    } else {
        lines.push('現在公開中: 取得できませんでした');
    }

    lines.push('');
    lines.push('これから公開: バージョンはサーバーが採番します');
    lines.push(`  ${formatBreakdown(next.breakdown)}（計 ${next.count}件）`);

    // 減少はデータの取り違えである可能性が高いため、種別ごとに明示する
    if (publishedBreakdown) {
        const decreases = next.breakdown
            .map((b, i) => ({ label: b.label, before: publishedBreakdown[i].count, after: b.count }))
            .filter(d => d.after < d.before);

        if (decreases.length > 0) {
            lines.push('');
            lines.push('【注意】件数が減ります:');
            decreases.forEach(d => {
                lines.push(`  ${d.label} ${d.before} → ${d.after}（${d.after - d.before}）`);
            });
        }
    }

    if (next.count === 0) {
        lines.push('');
        lines.push('【注意】0件のため、公開中のデータがすべて地図から消えます。');
    }

    lines.push('', 'よろしいですか？');
    return lines.join('\n');
}

// ===== 公開 =====

// APIのエラー応答から表示用メッセージを取り出す
async function readApiError(res) {
    try {
        const body = await res.json();
        if (body && body.error) return body.error;
    } catch { /* JSON でない応答はステータスのみ表示 */ }
    return `HTTP ${res.status}`;
}

// 公開に失敗したとき、整形済みデータを端末に保存できるようにする
// （作業のやり直し防止・開発担当者への連携用の控え）
async function offerBackupDownload(dataset, data) {
    const filename = dataset.fileName();
    if (!confirm(`今回のデータをこの端末に保存しますか？（ファイル名: ${filename}）\n`
        + '保存しておくと、あとで公開をやり直したり、開発担当者に渡して調べてもらえます。')) {
        return;
    }
    await saveAsFile(data, filename);
}

async function publishDataset(dataset) {
    if (!dataset.isLoaded()) {
        showMessage(`公開する${dataset.label}が読み込まれていません`, 'warning');
        return;
    }

    const data = dataset.build();

    const invalid = validateMinimal(data);
    if (invalid) {
        showMessage(`公開できません: ${invalid}`, 'error');
        return;
    }

    // 確認ダイアログに並記するため、その場で最新の公開データを取得する。
    // 種別ごとの内訳を出すには本体が要るため、ここでは本体を取りに行く
    // （公開は頻度が低く、確認の確実さを優先する）。
    const publishedData = await fetchPublished(dataset);
    const published = publishedData
        ? {
            version: publishedData.version || '',
            count: Array.isArray(publishedData.features) ? publishedData.features.length : 0
        }
        : null;
    const publishedBreakdown = publishedData ? dataset.breakdown(publishedData) : null;

    const next = { breakdown: dataset.breakdown(data), count: data.features.length };

    if (!confirm(buildConfirmMessage(dataset, published, publishedBreakdown, next))) {
        return;
    }

    let token = localStorage.getItem(PUBLISH_TOKEN_KEY) || '';
    if (!token) {
        token = (prompt('公開トークンを入力してください（この端末に保存されます）') || '').trim();
        if (!token) return;
    }

    try {
        const res = await fetch(dataset.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-publish-token': token },
            body: JSON.stringify(data)
        });

        // 失敗時はエラーコード（E01〜E05）付きで案内する。運用担当者が開発担当者へ
        // コードを伝えるだけで原因を切り分けられるようにする。
        if (res.status === 401) {
            // E01: 入力した公開トークンが違う。運用担当者が再入力で解決できる
            localStorage.removeItem(PUBLISH_TOKEN_KEY);
            alert('【E01】公開トークンが正しくありません。\n\n'
                + 'もう一度「公開」を押して、正しいトークンを入力してください。\n'
                + 'トークンが分からないときは、開発担当者に確認してください。');
            return;
        }
        if (!res.ok) {
            const detail = await readApiError(res);
            if (res.status === 400) {
                // E03: 送信データの不備。データ側を直せば解決できる
                alert(`【E03】公開データに不備があります。\n\n理由: ${detail}\n\n`
                    + 'MapEditor で出力し直したファイルを読み込んで、やり直してください。');
                return;
            }
            if (res.status === 503) {
                // E02: サーバー側の公開トークン未設定。操作では直らず開発担当者対応
                alert('【E02】公開機能がサーバー側でまだ設定されていません。\n\n'
                    + 'この画面の操作では直りません。\n'
                    + '開発担当者に「エラー E02（公開トークン未設定）」と伝えてください。');
                return;
            }
            if (res.status === 404) {
                // E06: エンドポイント未実装。移行作業中に起こりうる
                alert(`【E06】公開先が見つかりません（${dataset.label}）。\n\n`
                    + 'サーバー側の公開機能がまだ用意されていない可能性があります。\n'
                    + '開発担当者に「エラー E06（エンドポイント未実装）」と伝えてください。');
                return;
            }
            // E04: 公開ストアへの保存失敗。多くは時間をおくと回復。続く場合は開発担当者対応
            alert(`【E04】公開データの保存に失敗しました（サーバー側）。\n\n詳細: ${detail}\n\n`
                + '少し時間をおいて、もう一度「公開」をお試しください。\n'
                + '何度も続くときは、開発担当者に「エラー E04（公開ストア保存失敗）」と伝えてください。');
            await offerBackupDownload(dataset, data);
            return;
        }

        localStorage.setItem(PUBLISH_TOKEN_KEY, token);
        const result = await res.json().catch(() => ({}));
        await refreshPublishedDisplays();

        alert(`${dataset.label} バージョン ${result.version || '(不明)'}`
            + `（${result.count ?? data.features.length}件）をユーザーへ公開しました。\n`
            + '各端末には次回のマップ表示時に反映されます。\n\n'
            + '公開後の確認は minoh-hiking の地図で行ってください。');
    } catch (err) {
        // E05: API に接続できない（通信断・CORS・サーバー障害など）
        alert('【E05】公開サーバーに接続できませんでした（通信エラー）。\n\n'
            + 'まず通信状況を確認して、もう一度お試しください。\n'
            + `続くときは、開発担当者に「エラー E05（通信エラー）: ${err.message}」と伝えてください。`);
        await offerBackupDownload(dataset, data);
    }
}

// 端末に保存した公開トークンを消去する（共用端末を離れるときなどに使う）
function clearToken() {
    if (!localStorage.getItem(PUBLISH_TOKEN_KEY)) {
        showMessage('この端末に公開トークンは保存されていません', 'warning');
        return;
    }
    if (!confirm('この端末に保存した公開トークンを消去しますか？\n次回の公開時に再入力が必要になります。')) {
        return;
    }
    localStorage.removeItem(PUBLISH_TOKEN_KEY);
    showMessage('公開トークンを消去しました', 'success');
}

export function setupPublish() {
    // 二重送信の防止。確認ダイアログ・トークン入力を挟む間も押せないようにする
    Object.values(DATASETS).forEach(dataset => {
        document.getElementById(dataset.buttonId).addEventListener('click', async function () {
            this.disabled = true;
            try {
                await publishDataset(dataset);
            } finally {
                this.disabled = false;
            }
        });
    });

    document.getElementById('clearTokenBtn').addEventListener('click', clearToken);
    document.getElementById('reloadPublishedBtn')
        .addEventListener('click', () => refreshPublishedDisplays(true));

    // 起動時に現在公開中の情報を表示しておく（失敗しても操作は継続できる）
    refreshPublishedDisplays();
}

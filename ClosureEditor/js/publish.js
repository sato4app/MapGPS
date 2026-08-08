// 公開（公開API へのPOST）
//
// 公開APIの仕様は minoh-hiking 設計書 §5（契約バージョン 1.0）に従う。
// 依存している契約項目は docs/funcspec-202607.md §6 を参照。
// このファイルに API の検証ルール（座標範囲・id一意・version必須）を再実装しないこと。
// 判定はサーバーに任せ、失敗時は API が返した日本語メッセージをそのまま表示する
// （二重管理を避けるため。docs/funcspec-202607.md §5「実装しないこと」）。

import { CLOSURE_API_URL, CLOSURE_TOKEN_KEY } from './constants.js';
import { showMessage } from './message.js';
import { saveBlobAsFile } from './utils.js';
import { buildExportData, buildExportFileName, getVersionInput } from './fileIO.js';

// ===== 現在公開中の情報 =====

// 公開ストアの最新データを取得する（認証不要）。取得できなければ null
async function fetchPublished() {
    try {
        const res = await fetch(CLOSURE_API_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
            version: (data && data.version) || '',
            count: (data && Array.isArray(data.features)) ? data.features.length : 0
        };
    } catch (err) {
        console.warn('現在公開中のデータの取得に失敗:', err);
        return null;
    }
}

// 「現在公開中」表示の更新。戻り値は取得した情報（失敗時 null）
async function refreshPublishedDisplay(notify = false) {
    const display = document.getElementById('publishedVersionDisplay');
    display.value = '取得中...';

    const published = await fetchPublished();
    if (!published) {
        display.value = '取得できません';
        if (notify) showMessage('現在公開中のバージョンを取得できませんでした', 'warning');
        return null;
    }

    display.value = published.version
        ? `${published.version}（${published.count}件）`
        : `未公開（${published.count}件）`;
    if (notify) showMessage('現在公開中のバージョンを取得しました', 'success');
    return published;
}

// ===== 公開 =====

// クライアント側の検証は最小限にとどめる（docs/funcspec-202607.md §5）。
// minoh-hiking 現行の validateClosureGeoJSON と同等の確認のみ。
function validateMinimal(data) {
    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        return 'FeatureCollection 形式の geojson ではありません';
    }
    if (data.features.length > 0 && !data.features.some(f => f?.geometry?.type === 'Point')) {
        return 'Point 地物が含まれていません';
    }
    return null;
}

// 公開前の確認ダイアログ。現在公開中と、これから公開する版を並記して
// 古いファイルからの公開（巻き戻し）に気づけるようにする（機能仕様 §3.4.1）。
function buildConfirmMessage(published, version, count) {
    const current = published
        ? (published.version ? `${published.version}（${published.count}件）` : `未公開（${published.count}件）`)
        : '取得できませんでした';

    const lines = [
        '通行止め・通行困難地点をユーザーへ公開します。',
        '',
        `現在公開中: ${current}`,
        `これから公開: ${version || '（バージョン未入力）'}（${count}件）`
    ];
    if (count === 0) {
        lines.push('', '【注意】0件のため、公開中の全地点が地図から消えます。');
    }
    lines.push('', 'よろしいですか？');
    return lines.join('\n');
}

// APIのエラー応答から表示用メッセージを取り出す
async function readApiError(res) {
    try {
        const body = await res.json();
        if (body && body.error) return body.error;
    } catch { /* JSON でない応答はステータスのみ表示 */ }
    return `HTTP ${res.status}`;
}

// 公開に失敗したとき、編集内容を端末に保存できるようにする
// （作業のやり直し防止・開発担当者への連携用のバックアップ）
async function offerBackupDownload(data) {
    const filename = buildExportFileName();
    if (!confirm(`今回のデータをこの端末に保存しますか？（ファイル名: ${filename}）\n`
        + '保存しておくと、あとで公開をやり直したり、開発担当者に渡して調べてもらえます。')) {
        return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' });
    await saveBlobAsFile(blob, filename);
}

async function publishClosureData() {
    const version = getVersionInput();
    const data = buildExportData(version);

    const invalid = validateMinimal(data);
    if (invalid) {
        showMessage(`公開できません: ${invalid}`, 'error');
        return;
    }

    // 確認ダイアログに並記するため、その場で最新の公開状況を取得する
    const published = await refreshPublishedDisplay();

    if (!confirm(buildConfirmMessage(published, version, data.features.length))) {
        return;
    }

    let token = localStorage.getItem(CLOSURE_TOKEN_KEY) || '';
    if (!token) {
        token = (prompt('公開トークンを入力してください（この端末に保存されます）') || '').trim();
        if (!token) return;
    }

    try {
        const res = await fetch(CLOSURE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-publish-token': token },
            body: JSON.stringify(data)
        });

        // 失敗時はエラーコード（E01〜E05）付きで案内する。運用担当者が開発担当者へ
        // コードを伝えるだけで原因を切り分けられるようにする（利用者の手引 §9）。
        if (res.status === 401) {
            // E01: 入力した公開トークンが違う。運用担当者が再入力で解決できる
            localStorage.removeItem(CLOSURE_TOKEN_KEY);
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
                    + 'バージョンを変えたか、地点の座標・IDが正しいかを確認し、\n'
                    + 'データを直してからやり直してください。');
                return;
            }
            if (res.status === 503) {
                // E02: サーバー側の公開トークン未設定。操作では直らず開発担当者対応
                alert('【E02】公開機能がサーバー側でまだ設定されていません。\n\n'
                    + 'この画面の操作では直りません。\n'
                    + '開発担当者に「エラー E02（公開トークン未設定）」と伝えてください。');
                return;
            }
            // E04: 公開ストアへの保存失敗。多くは時間をおくと回復。続く場合は開発担当者対応
            alert(`【E04】公開データの保存に失敗しました（サーバー側）。\n\n詳細: ${detail}\n\n`
                + '少し時間をおいて、もう一度「公開」をお試しください。\n'
                + '何度も続くときは、開発担当者に「エラー E04（公開ストア保存失敗）」と伝えてください。');
            await offerBackupDownload(data);
            return;
        }

        localStorage.setItem(CLOSURE_TOKEN_KEY, token);
        const result = await res.json().catch(() => ({}));
        await refreshPublishedDisplay();
        alert(`バージョン ${result.version || version}（${result.count ?? data.features.length}件）をユーザーへ公開しました。\n`
            + '各端末には次回のマップ表示時に反映されます。\n\n'
            + '公開後の確認は minoh-hiking の地図で行ってください。');
    } catch (err) {
        // E05: API に接続できない（通信断・CORS・サーバー障害など）
        alert('【E05】公開サーバーに接続できませんでした（通信エラー）。\n\n'
            + 'まず通信状況を確認して、もう一度お試しください。\n'
            + `続くときは、開発担当者に「エラー E05（通信エラー）: ${err.message}」と伝えてください。`);
        await offerBackupDownload(data);
    }
}

// 端末に保存した公開トークンを消去する（共用端末を離れるときなどに使う）
function clearToken() {
    if (!localStorage.getItem(CLOSURE_TOKEN_KEY)) {
        showMessage('この端末に公開トークンは保存されていません', 'warning');
        return;
    }
    if (!confirm('この端末に保存した公開トークンを消去しますか？\n次回の公開時に再入力が必要になります。')) {
        return;
    }
    localStorage.removeItem(CLOSURE_TOKEN_KEY);
    showMessage('公開トークンを消去しました', 'success');
}

export function setupPublish() {
    // 二重送信の防止。確認ダイアログ・トークン入力を挟む間も押せないようにする
    document.getElementById('publishBtn').addEventListener('click', async function () {
        this.disabled = true;
        try {
            await publishClosureData();
        } finally {
            this.disabled = false;
        }
    });
    document.getElementById('clearTokenBtn').addEventListener('click', clearToken);
    document.getElementById('reloadPublishedBtn').addEventListener('click', () => refreshPublishedDisplay(true));

    // 起動時に現在公開中のバージョンを表示しておく（失敗しても操作は継続できる）
    refreshPublishedDisplay();
}

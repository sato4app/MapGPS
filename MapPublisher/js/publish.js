// 公開（公開API へのPOST）
//
// 公開APIの仕様は minoh-hiking `docs/publish-api-202608.md`（契約バージョン 3.0）に従う。
// このファイルに API の検証ルール（座標範囲・id一意・type の妥当性・タイルの z や
// tile_count の照合）を再実装しないこと。
// 判定はサーバーに任せ、失敗時は API が返した日本語メッセージをそのまま表示する
// （二重管理を避けるため。仕様書 §11「実装しないこと」）。
//
// version は契約 3.0 で送信側が決めることになった（仕様書 §4）。既定値の算出と
// 形式の判定は js/version.js に置く。サーバーも同じ形式判定と重複拒否を行うため、
// 画面のチェックは「送る前に気づける」ようにするためのもので、最後の砦ではない。
//
// 画面は「いまユーザーに見えているもの」を映すことを原則とする。公開に失敗したときは
// 読み込んだデータを捨てて公開中の状態へ戻し、地図と件数が公開されていない内容を
// 映したままになるのを防ぐ。

import {
    API_URLS, PUBLISH_TOKEN_KEY, MAPDATA_TYPES, MAPDATA_TYPE_LABELS, TILE_COUNT_UNIT
} from './constants.js';
import { showMessage } from './message.js';
import { getDateString } from './utils.js';
import { isValidVersion, nextVersion } from './version.js';
import * as MapData from './mapData.js';
import * as ClosureData from './closureData.js';
import * as TileData from './tileData.js';
import { saveAsFile } from './fileIO.js';

// 読み込み済みデータが入れ替わったときに件数サマリを描き直す関数。setupPublish で受け取る
let notifyDataChanged = () => {};

// ===== 件数・内訳・体裁の確認 =====
// 内訳は読み込んだデータと公開中のデータの双方に同じ関数を当て、同じ粒度で比べられるようにする。

// GeoJSON データセット（mapdata / closures）は Feature 数を数える
function countFeatures(geojson) {
    return Array.isArray(geojson && geojson.features) ? geojson.features.length : 0;
}

// クライアント側の検証は最小限にとどめる（仕様書 §11）。
// tiles は GeoJSON ではないため、体裁の確認もデータセットごとに持つ。
function validateGeoJson(data) {
    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        return 'FeatureCollection 形式の geojson ではありません';
    }
    return null;
}

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

// タイル一覧はレイヤー別の枚数で示す。壊れたマニフェストや取り違えは、
// 合計だけを見ても気づきにくく、レイヤー別なら公開直前に捕まえられる。
function breakdownTiles(manifest) {
    return TileData.layerCountsOf(manifest).map(l => ({ label: l.key, count: l.count }));
}

// ===== 出力ファイル名 =====
// 出力するのは公開済みデータのため、日付ではなくバージョンで識別できるようにする
// （同じ日に別のバージョンを取り出しても名前がぶつからない）。

// バージョンが取れないとき（未公開・応答に version が無い）は日付で代用する
function fileVersion(published) {
    return published.version || getDateString();
}

// ===== データセット定義 =====

// 公開処理・確認ダイアログ・「現在公開中」表示・公開済みデータの出力・失敗時の復元は、
// この表を回すだけで済むようにしてある。データセットを増やすときは1件足す。
//
// validate / count / restore をデータセット側に持たせているのは、tiles が
// GeoJSON ではないため（契約 2.1 §3.6）。共通処理から FeatureCollection の
// 決め打ちを外し、形の違いはこの表に閉じ込める。
//
// 並び順は index.html のパネルと揃える（更新頻度の高い順）。
const DATASETS = {
    closures: {
        key: 'closures',
        label: '通行止め・通行困難地点',
        url: API_URLS.closures,
        unit: '件',
        sourceApp: 'MapEditor',
        displayId: 'closurePublished',
        buttonId: 'publishClosureBtn',
        versionInputId: 'closureVersion',
        exportButtonId: 'exportClosureBtn',
        isLoaded: () => ClosureData.isLoaded(),
        build: () => ClosureData.buildPublishData(),
        restore: json => ClosureData.load(json),
        validate: validateGeoJson,
        count: countFeatures,
        breakdown: breakdownClosures,
        fileName: p => {
            const b = breakdownClosures(p);
            return `Closure-${fileVersion(p)}_C${b[0].count}_D${b[1].count}.geojson`;
        }
    },
    mapdata: {
        key: 'mapdata',
        label: 'ハイキングマップデータ',
        url: API_URLS.mapdata,
        unit: '件',
        sourceApp: 'MapEditor',
        displayId: 'mapDataPublished',
        buttonId: 'publishMapDataBtn',
        versionInputId: 'mapDataVersion',
        exportButtonId: 'exportMapDataBtn',
        isLoaded: () => MapData.isLoaded(),
        build: () => MapData.buildPublishData(),
        restore: json => MapData.load(json),
        validate: validateGeoJson,
        count: countFeatures,
        breakdown: breakdownMapData,
        fileName: p => {
            const b = breakdownMapData(p);
            return `MapData-${fileVersion(p)}`
                + `_P${b[0].count}_R${b[1].count}_S${b[2].count}.geojson`;
        }
    },
    tiles: {
        key: 'tiles',
        label: '地図タイルのダウンロード領域',
        url: API_URLS.tiles,
        unit: TILE_COUNT_UNIT,
        sourceApp: 'DownloadArea',
        displayId: 'tilePublished',
        buttonId: 'publishTileBtn',
        versionInputId: 'tileVersion',
        exportButtonId: 'exportTileBtn',
        isLoaded: () => TileData.isLoaded(),
        build: () => TileData.buildPublishData(),
        restore: json => TileData.load(json),
        validate: TileData.findFormatProblem,
        count: TileData.countTilesOf,
        breakdown: breakdownTiles,
        // レイヤー別の枚数は5つあり名前に入れると長すぎるため、レイヤー数と合計だけを付ける
        fileName: p => `TileManifest-${fileVersion(p)}`
            + `_L${TileData.layerCountsOf(p).length}_T${TileData.countTilesOf(p)}.json`
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
        ? `${info.version}（${info.count}${dataset.unit}）`
        : `未公開（${info.count}${dataset.unit}）`;
}

// ===== 公開バージョンの入力欄 =====

function versionInput(dataset) {
    return document.getElementById(dataset.versionInputId);
}

// 「現在公開中」から既定値（+1）を入れる。
// 運用者が手で書き換えたあとは触らない。`.08` の次を `.10` にするといった
// 意図した番号が、再取得のたびに消えてしまわないようにするため。
function fillDefaultVersion(dataset, publishedVersion) {
    const input = versionInput(dataset);
    if (input.dataset.edited === 'true') return;
    input.value = nextVersion(publishedVersion);
}

// 公開に成功したら手編集の印を消し、次の既定値が入るようにする
function clearVersionEdited(dataset) {
    versionInput(dataset).dataset.edited = '';
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
                info = { version: data.version || '', count: dataset.count(data) };
            }
        }

        renderPublishedDisplay(dataset, info);
        // 取得できなかったときは既定値を作れない。入力欄はそのまま残す
        if (info) {
            fillDefaultVersion(dataset, info.version);
            ok++;
        }
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

// ===== 公開済みデータの出力 =====

// いま公開されているデータをそのままファイルに保存する。
// 公開前に押せば前回公開分、公開後に押せば今回公開分が出る。
//
// 読み込んだデータではなくサーバーの応答を保存するため、version と updatedAt も
// 含めて「公開されている姿」がそのまま残る。整形は行わない（公開スキーマの正本は
// サーバーが持っており、ここで作り直すと二重管理になる）。
async function exportPublished(dataset) {
    const data = await fetchPublished(dataset);

    if (!data) {
        showMessage(`公開中の${dataset.label}を取得できませんでした`, 'warning');
        return;
    }
    if (!data.version) {
        showMessage(`${dataset.label}はまだ公開されていません`, 'warning');
        return;
    }

    const saved = await saveAsFile(data, dataset.fileName(data));
    if (saved) {
        showMessage(`公開中の${dataset.label}（${data.version}）を出力しました`, 'success');
    }
}

// ===== 公開前の確認 =====

function formatBreakdown(breakdown) {
    return breakdown.map(b => `${b.label} ${b.count}`).join(' / ');
}

// 内訳の減少を拾う。tiles のレイヤーは増減も並び順の変化もありうるため、
// 位置ではなく名前で突き合わせる（無くなった内訳は 0 への減少として扱う）。
function findDecreases(publishedBreakdown, nextBreakdown) {
    const before = new Map(publishedBreakdown.map(b => [b.label, b.count]));
    const decreases = nextBreakdown
        .map(b => ({ label: b.label, before: before.get(b.label) ?? 0, after: b.count }))
        .filter(d => d.after < d.before);

    const nextLabels = new Set(nextBreakdown.map(b => b.label));
    publishedBreakdown
        .filter(b => !nextLabels.has(b.label) && b.count > 0)
        .forEach(b => decreases.push({ label: b.label, before: b.count, after: 0 }));

    return decreases;
}

// 確認ダイアログ。version は運用者が決めるが、番号を見ても内容の取り違えは分からない
// （古いファイルから新しい番号で公開できてしまう）。種別ごとの件数差分を並記し、
// 誤ったファイルからの公開に気づけるようにする。
function buildConfirmMessage(dataset, published, publishedBreakdown, next) {
    const lines = [`${dataset.label}をユーザーへ公開します。`, ''];

    if (published) {
        const version = published.version || '未公開';
        lines.push(`現在公開中: ${version}`);
        // 未公開のときは内訳が空になる。空の内訳を並べても読み取れないため合計だけ出す
        if (publishedBreakdown && publishedBreakdown.length > 0) {
            lines.push(`  ${formatBreakdown(publishedBreakdown)}（計 ${published.count}${dataset.unit}）`);
        } else {
            lines.push(`  計 ${published.count}${dataset.unit}`);
        }
    } else {
        lines.push('現在公開中: 取得できませんでした');
    }

    lines.push('');
    lines.push(`これから公開: ${next.version}`);
    lines.push(`  ${formatBreakdown(next.breakdown)}（計 ${next.count}${dataset.unit}）`);

    // 減少はデータの取り違えである可能性が高いため、種別ごとに明示する
    if (publishedBreakdown) {
        const decreases = findDecreases(publishedBreakdown, next.breakdown);

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
        lines.push(`【注意】0${dataset.unit}のため、公開中のデータがすべて地図から消えます。`);
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

// 公開APIへ送る。成功したら true。失敗したときはエラーコード（E01〜E06）付きで案内して
// false を返す。運用担当者が開発担当者へコードを伝えるだけで原因を切り分けられるようにする。
//
// 失敗すると読み込んだデータは破棄されるため、案内はいずれも
// 「ファイルを読み込み直してやり直す」流れに揃える。
async function sendPublish(dataset, data, token, next) {
    try {
        const res = await fetch(dataset.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-publish-token': token },
            body: JSON.stringify(data)
        });

        if (res.status === 401) {
            // E01: 入力した公開トークンが違う。運用担当者が再入力で解決できる
            localStorage.removeItem(PUBLISH_TOKEN_KEY);
            alert('【E01】公開トークンが正しくありません。\n\n'
                + 'ファイルを読み込み直し、もう一度「公開」を押して、'
                + '正しいトークンを入力してください。\n'
                + 'トークンが分からないときは、開発担当者に確認してください。');
            return false;
        }
        if (!res.ok) {
            const detail = await readApiError(res);
            if (res.status === 400) {
                // E03: 送信データの不備。データ側を直せば解決できる
                alert(`【E03】公開データに不備があります。\n\n理由: ${detail}\n\n`
                    + `${dataset.sourceApp} で出力し直したファイルを読み込んで、やり直してください。`);
                return false;
            }
            if (res.status === 503) {
                // E02: サーバー側の公開トークン未設定。操作では直らず開発担当者対応
                alert('【E02】公開機能がサーバー側でまだ設定されていません。\n\n'
                    + 'この画面の操作では直りません。\n'
                    + '開発担当者に「エラー E02（公開トークン未設定）」と伝えてください。');
                return false;
            }
            if (res.status === 404) {
                // E06: エンドポイント未実装。移行作業中に起こりうる
                alert(`【E06】公開先が見つかりません（${dataset.label}）。\n\n`
                    + 'サーバー側の公開機能がまだ用意されていない可能性があります。\n'
                    + '開発担当者に「エラー E06（エンドポイント未実装）」と伝えてください。');
                return false;
            }
            // E04: 公開ストアへの保存失敗。多くは時間をおくと回復。続く場合は開発担当者対応
            alert(`【E04】公開データの保存に失敗しました（サーバー側）。\n\n詳細: ${detail}\n\n`
                + '少し時間をおいて、ファイルを読み込み直してからもう一度お試しください。\n'
                + '何度も続くときは、開発担当者に「エラー E04（公開ストア保存失敗）」と伝えてください。');
            return false;
        }

        localStorage.setItem(PUBLISH_TOKEN_KEY, token);
        const result = await res.json().catch(() => ({}));
        // 手編集の印を消してから再取得する。次の既定値が公開した番号の +1 になる
        clearVersionEdited(dataset);
        await refreshPublishedDisplays();

        alert(`${dataset.label} バージョン ${result.version || '(不明)'}`
            + `（${result.count ?? next.count}${dataset.unit}）をユーザーへ公開しました。\n`
            + '各端末には次回のマップ表示時に反映されます。\n\n'
            + '公開後の確認は minoh-hiking の地図で行ってください。');
        return true;
    } catch (err) {
        // E05: API に接続できない（通信断・CORS・サーバー障害など）
        alert('【E05】公開サーバーに接続できませんでした（通信エラー）。\n\n'
            + 'まず通信状況を確認して、ファイルを読み込み直してからもう一度お試しください。\n'
            + `続くときは、開発担当者に「エラー E05（通信エラー）: ${err.message}」と伝えてください。`);
        return false;
    }
}

// 公開に失敗したときに、読み込んだデータを捨てて公開中の状態へ戻す。
// 公開されていない内容が地図と件数に残っていると、いま何が公開されているのか
// 分からなくなるため。
//
// ただし通信エラーのときは公開中のデータも取得できない。戻しようがないので
// 読み込んだデータはそのまま残し、画面が公開状態と食い違っていることを知らせる。
async function restoreToPublished(dataset) {
    const data = await fetchPublished(dataset);
    await refreshPublishedDisplays();

    if (!data) {
        showMessage(`公開中の${dataset.label}を取得できませんでした。`
            + '\n画面には読み込んだデータが残っています', 'warning');
        return;
    }

    try {
        dataset.restore(data);
    } catch (error) {
        console.error('公開中のデータの読み込みに失敗:', error);
        showMessage(`公開中の${dataset.label}を読み込めませんでした: ${error.message}`, 'error');
        return;
    }

    notifyDataChanged();
    showMessage(`公開中の${dataset.label}に戻しました`, 'warning');
}

async function publishDataset(dataset) {
    if (!dataset.isLoaded()) {
        showMessage(`公開する${dataset.label}が読み込まれていません`, 'warning');
        return;
    }

    // 公開バージョンは送信側が決める（契約 §4.2）。形式はここで確かめる。
    // サーバーでも同じ判定を行うが、送る前に気づけるほうが直しやすい
    const version = versionInput(dataset).value.trim();
    if (!isValidVersion(version)) {
        showMessage('公開バージョンは yyyy.nn 形式で入力してください（例: 2026.01）', 'error');
        versionInput(dataset).focus();
        return;
    }

    // version は公開時に決まるため、データモジュールではなくここで足す。
    //
    // ★ version は必ず展開の「後ろ」に置く。tiles は読み込んだ tile_manifest.json を
    //   そのまま送るため、DownloadArea が入れた version（`yyyy-MM` 形式）が残っている。
    //   前に置くとファイル側の値で上書きされ、画面で指定した番号が送られない。
    const data = { ...dataset.build(), version };

    const invalid = dataset.validate(data);
    if (invalid) {
        showMessage(`公開できません: ${invalid}`, 'error');
        return;
    }

    // 確認ダイアログに並記するため、その場で最新の公開データを取得する。
    // 種別ごとの内訳を出すには本体が要るため、ここでは本体を取りに行く
    // （公開は頻度が低く、確認の確実さを優先する）。
    const publishedData = await fetchPublished(dataset);
    const published = publishedData
        ? { version: publishedData.version || '', count: dataset.count(publishedData) }
        : null;
    const publishedBreakdown = publishedData ? dataset.breakdown(publishedData) : null;

    // 同じ番号では公開させない。利用者アプリの更新判定は等値比較のみで、
    // 番号を据え置くと公開しても端末に届かない（契約 §4.3。サーバーも 400 で拒否する）
    if (published && published.version === version) {
        showMessage(`バージョン ${version} はすでに公開されています。番号を進めてください`, 'error');
        versionInput(dataset).focus();
        return;
    }

    const next = { version, breakdown: dataset.breakdown(data), count: dataset.count(data) };

    if (!confirm(buildConfirmMessage(dataset, published, publishedBreakdown, next))) {
        return;
    }

    let token = localStorage.getItem(PUBLISH_TOKEN_KEY) || '';
    if (!token) {
        token = (prompt('公開トークンを入力してください（この端末に保存されます）') || '').trim();
        if (!token) return;
    }

    const ok = await sendPublish(dataset, data, token, next);

    // 失敗したら読み込んだデータを捨て、画面を公開中の状態へ戻す
    if (!ok) await restoreToPublished(dataset);
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

// クリックしている間はボタンを押せなくする。確認ダイアログ・トークン入力・
// 通信を挟む間の二重実行を防ぐ。
function bindBusyButton(id, handler) {
    document.getElementById(id).addEventListener('click', async function () {
        this.disabled = true;
        try {
            await handler();
        } finally {
            this.disabled = false;
        }
    });
}

// onDataChanged: 読み込み済みデータが入れ替わったときに件数サマリを描き直す（app.js が渡す）
export function setupPublish(onDataChanged) {
    notifyDataChanged = onDataChanged || (() => {});

    Object.values(DATASETS).forEach(dataset => {
        bindBusyButton(dataset.buttonId, () => publishDataset(dataset));
        bindBusyButton(dataset.exportButtonId, () => exportPublished(dataset));

        versionInput(dataset).addEventListener('input', function () {
            this.dataset.edited = 'true';
        });
    });

    document.getElementById('clearTokenBtn').addEventListener('click', clearToken);
    document.getElementById('reloadPublishedBtn')
        .addEventListener('click', () => refreshPublishedDisplays(true));

    // 起動時に現在公開中の情報を表示しておく（失敗しても操作は継続できる）
    refreshPublishedDisplays();
}

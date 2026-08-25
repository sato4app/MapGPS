// 地図タイルのダウンロード領域（tiles）の保持・件数
//
// DownloadArea が出力した tile_manifest.json を読み込み、そのまま公開する。
// 公開スキーマの正本は minoh-hiking `docs/publish-api-202608.md` §3.6。
// GeoJSON ではないため、他の2つと違って整形も地図描画も行わない
// （タイル一覧は地点でもルートでもなく、地図に重ねて確認する対象がない）。

const state = {
    manifest: null   // 読み込んだ tile_manifest.json（そのまま保持する）
};

// ===== 体裁の確認 =====

// 「読ませたファイルが tile_manifest.json かどうか」だけを見る。問題が無ければ null。
// z の範囲・座標の妥当性・tile_count の一致といった検証ルールは再実装しない
// （契約 §11。判定はサーバーに任せ、失敗時は API の日本語メッセージをそのまま出す）。
//
// 読み込み時と公開直前の双方から呼び、同じ判定を使う。
export function findFormatProblem(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json)
        || !json.layers || typeof json.layers !== 'object' || Array.isArray(json.layers)) {
        return 'タイル一覧（layers を持つ tile_manifest.json）ではありません';
    }
    if (Object.keys(json.layers).length === 0) {
        return 'レイヤーが1つもありません';
    }
    return null;
}

// ===== 件数 =====
// 読み込んだデータと公開中のデータの双方に当てるため、state ではなく引数から数える。

// レイヤー1つ分のタイル枚数。tiles が配列でなければ 0 として数える
// （不正な中身の判定はサーバーの責務。ここでは表示のために数えるだけ）
function layerTileCount(layer) {
    return layer && Array.isArray(layer.tiles) ? layer.tiles.length : 0;
}

// レイヤーごとの枚数を、マニフェストに現れる順で返す。
// レイヤーキーは表示にもそのまま使う（サーバーも命名を検証しない。constants.js を参照）
export function layerCountsOf(manifest) {
    if (!manifest || !manifest.layers || typeof manifest.layers !== 'object') return [];
    return Object.entries(manifest.layers)
        .map(([key, layer]) => ({ key, count: layerTileCount(layer) }));
}

// 全レイヤーのタイル枚数の合計（契約 §5.2 の count と同じ数え方）
export function countTilesOf(manifest) {
    return layerCountsOf(manifest).reduce((sum, l) => sum + l.count, 0);
}

// ===== 読み込み =====

// 読み込みは置換方式（公開が全置換のため。mapData.js の load を参照）
export function load(json) {
    const problem = findFormatProblem(json);
    if (problem) throw new Error(problem);

    state.manifest = json;
    return { total: getTotal(), layers: Object.keys(json.layers).length };
}

export function clear() {
    state.manifest = null;
}

export function isLoaded() {
    return state.manifest !== null;
}

export function getLayerCounts() {
    return layerCountsOf(state.manifest);
}

export function getTotal() {
    return countTilesOf(state.manifest);
}

// ===== 公開用整形 =====

// 整形しない。読み込んだ内容をそのまま送る（契約 §3.6）。
//
// 読み込んだファイルには DownloadArea が入れた version（`yyyy-MM` 形式）が残っているが、
// 公開する version は画面の入力欄で決まる（契約 3.0 §4）。publish.js が送信直前に
// 上書きするため、ここでは取り除かない。updatedAt はサーバーが付ける。
export function buildPublishData() {
    return state.manifest;
}

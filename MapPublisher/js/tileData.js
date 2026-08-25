// 地図タイルのダウンロード領域（tiles）の保持・表示・件数
//
// DownloadArea が出力した tile_manifest.json を読み込み、そのまま公開する。
// 公開スキーマの正本は minoh-hiking `docs/publish-api-202608.md` §3.6。
// GeoJSON ではないため整形は行わないが、地図には描く。
// タイル一覧は地点でもルートでもないものの、「どの範囲を配信するのか」は
// 地図に重ねないと確かめられず、取り違えにも気づけないため。
//
// 範囲はズームレベルごとに違う（詳細なレベルほど狭いことが多い）。
// 一度に描けるのは1レベル分で、どれを描くかは画面の選択に従う。

import { TILE_AREA_STYLE, TILE_DEFAULT_ZOOM } from './constants.js';

const state = {
    map: null,
    layer: null,
    manifest: null,  // 読み込んだ tile_manifest.json（そのまま保持する）
    zoom: null       // 地図に描くズームレベル（未読み込みのときは null）
};

export function init(map) {
    state.map = map;
}

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

// ===== ズームレベル =====

// レイヤーのズームレベル。z が数値ならそれを使い、無ければキー（z17_default 等）から拾う。
// レイヤーキーは読み替えない決まりだが（契約 §5.1）、ここで読むのは
// 表示するレベルを選ぶためだけで、件数表示や公開する中身には手を触れない。
function zoomOf(key, layer) {
    if (layer && typeof layer.z === 'number' && Number.isFinite(layer.z)) return layer.z;
    const matched = /z(\d+)/.exec(key);
    return matched ? Number(matched[1]) : null;
}

// マニフェストに現れるズームレベルを、重複を除いて昇順で返す（z14〜z18 を想定）。
// 同じ z のレイヤーが複数あれば（基本／詳細など）1つの選択肢にまとめ、枚数は合算する。
export function zoomLevelsOf(manifest) {
    const byZoom = new Map();

    if (manifest && manifest.layers && typeof manifest.layers === 'object') {
        Object.entries(manifest.layers).forEach(([key, layer]) => {
            const z = zoomOf(key, layer);
            if (z === null) return;
            byZoom.set(z, (byZoom.get(z) || 0) + layerTileCount(layer));
        });
    }

    return [...byZoom.entries()]
        .map(([z, count]) => ({ z, count }))
        .sort((a, b) => a.z - b.z);
}

// 既定のズームレベル。TILE_DEFAULT_ZOOM が無いファイルもありうるため、
// そのときは最も近いレベル（同じ距離なら詳細な側）を選ぶ。
function pickDefaultZoom(levels) {
    if (levels.length === 0) return null;

    return levels.reduce((best, level) => {
        const distance = Math.abs(level.z - TILE_DEFAULT_ZOOM);
        const bestDistance = Math.abs(best - TILE_DEFAULT_ZOOM);
        if (distance < bestDistance) return level.z;
        if (distance === bestDistance && level.z > best) return level.z;
        return best;
    }, levels[0].z);
}

// ===== 読み込み =====

// 読み込みは置換方式（公開が全置換のため。mapData.js の load を参照）
export function load(json) {
    const problem = findFormatProblem(json);
    if (problem) throw new Error(problem);

    state.manifest = json;
    // 選択候補はファイルごとに変わる。前のファイルで選んでいたレベルは引き継がず、
    // 読み込むたびに既定へ戻す（無いレベルが選ばれたままになるのを防ぐ）
    state.zoom = pickDefaultZoom(zoomLevelsOf(json));

    redraw();
    return { total: getTotal(), layers: Object.keys(json.layers).length };
}

export function clear() {
    state.manifest = null;
    state.zoom = null;
    redraw();
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

export function getZoomLevels() {
    return zoomLevelsOf(state.manifest);
}

export function getZoom() {
    return state.zoom;
}

// ===== 描画 =====
//
// 領域は「塗り」と「外周線」に分けて描く。
// 塗りは行ごとの帯にまとめ、外周線は隣にタイルが無い辺だけをつないで引く。
// 帯そのものに線を引くと領域の中に横線が並び、区切りがあるように見えてしまう。

// タイル格子の角 [x, y] の緯度経度。
// 地理院タイルも一般的なスリッピーマップと同じ規則（Web メルカトル）で並ぶ。
// タイル [x, y] の北西端は角 [x, y]、南東端は角 [x+1, y+1] にあたる。
function cornerLatLng(x, y, z) {
    const n = Math.pow(2, z);
    const lng = x / n * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    return { lat, lng };
}

// 指定したズームレベルのタイル座標を集める（同じ z のレイヤーは合わせる）。
// 数値の組でないものは描けないので除き、重複は取り除く
// （不正な中身の判定はサーバーの責務。ここでは描くために整えるだけ）。
function tilesAtZoom(manifest, z) {
    const seen = new Set();
    const tiles = [];

    Object.entries(manifest.layers).forEach(([key, layer]) => {
        if (zoomOf(key, layer) !== z) return;
        if (!layer || !Array.isArray(layer.tiles)) return;

        layer.tiles.forEach(tile => {
            if (!Array.isArray(tile) || typeof tile[0] !== 'number' || typeof tile[1] !== 'number') return;
            const key = `${tile[0]},${tile[1]}`;
            if (seen.has(key)) return;
            seen.add(key);
            tiles.push({ x: tile[0], y: tile[1] });
        });
    });

    return tiles;
}

// 整数の集まりを、連続する区間 [先頭, 末尾] の配列にする（昇順）。
// 塗りの帯（行内で連続する x）にも外周線（同じ向きに連続する辺）にも使う。
function consecutiveRuns(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const runs = [];
    let start = sorted[0];
    let prev = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === prev + 1) {
            prev = sorted[i];
            continue;
        }
        runs.push([start, prev]);
        start = sorted[i];
        prev = sorted[i];
    }
    runs.push([start, prev]);

    return runs;
}

// key -> 値の配列。同じ行・同じ列の要素を集めるために使う
function pushTo(map, key, value) {
    if (map.has(key)) map.get(key).push(value);
    else map.set(key, [value]);
}

// 塗り用の矩形。同じ行（y）で x が連続するタイルを1枚の矩形にまとめる。
// z18 では数千枚になることがあり、1枚ずつ矩形を作ると地図の操作が重くなる。
function fillRects(tiles, z) {
    const rows = new Map();   // y -> x の配列
    tiles.forEach(t => pushTo(rows, t.y, t.x));

    const rects = [];

    rows.forEach((xs, y) => {
        consecutiveRuns(xs).forEach(([x1, x2]) => {
            const northWest = cornerLatLng(x1, y, z);
            const southEast = cornerLatLng(x2 + 1, y + 1, z);
            rects.push([[southEast.lat, northWest.lng], [northWest.lat, southEast.lng]]);
        });
    });

    return rects;
}

// 外周線。隣にタイルが無い辺だけを集め、同じ向きに連続する分をつないで1本にする。
// 領域の境目がはっきりし、階段状の輪郭にタイルの粒度も残る。
function outlineLines(tiles, z) {
    const filled = new Set(tiles.map(t => `${t.x},${t.y}`));
    const has = (x, y) => filled.has(`${x},${y}`);

    const horizontal = new Map();   // 角の y -> 角の x の配列（上辺・下辺）
    const vertical = new Map();     // 角の x -> 角の y の配列（左辺・右辺）

    tiles.forEach(({ x, y }) => {
        if (!has(x, y - 1)) pushTo(horizontal, y, x);
        if (!has(x, y + 1)) pushTo(horizontal, y + 1, x);
        if (!has(x - 1, y)) pushTo(vertical, x, y);
        if (!has(x + 1, y)) pushTo(vertical, x + 1, y);
    });

    const lines = [];

    horizontal.forEach((xs, y) => {
        consecutiveRuns(xs).forEach(([x1, x2]) => {
            const from = cornerLatLng(x1, y, z);
            const to = cornerLatLng(x2 + 1, y, z);
            lines.push([[from.lat, from.lng], [to.lat, to.lng]]);
        });
    });

    vertical.forEach((ys, x) => {
        consecutiveRuns(ys).forEach(([y1, y2]) => {
            const from = cornerLatLng(x, y1, z);
            const to = cornerLatLng(x, y2 + 1, z);
            lines.push([[from.lat, from.lng], [to.lat, to.lng]]);
        });
    });

    return lines;
}

function redraw() {
    if (!state.map) return;

    if (state.layer) {
        state.map.removeLayer(state.layer);
        state.layer = null;
    }
    if (!state.manifest || state.zoom === null) return;

    const tiles = tilesAtZoom(state.manifest, state.zoom);
    if (tiles.length === 0) return;

    const layer = L.layerGroup();
    // 領域は背景であり、確認する対象は地点とルート。
    // クリックを奪わないよう interactive: false にする
    const common = { pane: 'tileAreas', interactive: false };

    fillRects(tiles, state.zoom).forEach(bounds => {
        layer.addLayer(L.rectangle(bounds, {
            ...common,
            stroke: false,
            fillColor: TILE_AREA_STYLE.fillColor,
            fillOpacity: TILE_AREA_STYLE.fillOpacity
        }));
    });

    outlineLines(tiles, state.zoom).forEach(latlngs => {
        layer.addLayer(L.polyline(latlngs, {
            ...common,
            color: TILE_AREA_STYLE.color,
            weight: TILE_AREA_STYLE.weight,
            opacity: TILE_AREA_STYLE.opacity
        }));
    });

    state.layer = layer;
    if (document.getElementById('tileVisible').checked) {
        layer.addTo(state.map);
    }
}

// 表示するズームレベルを変える（画面の選択に従う）
export function setZoom(z) {
    state.zoom = Number.isFinite(z) ? z : null;
    redraw();
}

export function setVisible(visible) {
    if (!state.layer) return;
    if (visible) state.layer.addTo(state.map);
    else state.map.removeLayer(state.layer);
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

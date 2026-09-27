// 地図上のマーカー描画（ハイキングマップデータ・通行止め地点で共通）
//
// 形状と既定色は minoh-hiking のマーカー設定に合わせてある。
// 本アプリは公開前の確認用であり、利用者が見る地図と同じ見え方にすることを優先する。

const WHITE = '#ffffff';
const GLYPH = '#111827'; // 標識の中の人・「!」の色

// 通行止め（ISO 7010 P004「No thoroughfare」・道路標識「歩行者通行止め」風）。
// 白地に色の輪と斜線、中に黒の歩く人。斜線は人の上に重ねる。
// 描画は (0,0)〜(s,s) の座標で行い、呼び出し側で当たり領域の中央へ移す。
// 人の形は 100 四方で設計して輪の内側に収める（小さいサイズでは読めなくてもよい）
function noThoroughfareSvg(color, s) {
    const c = s / 2;
    const sw = Math.max(2, s * 0.13);          // 輪・斜線の太さ
    const rr = s / 2 - 1 - sw / 2;             // 輪の中心半径（外側 1px は白の縁）
    const ri = rr - sw / 2;                    // 輪の内側の半径
    const k = (ri * 1.7) / 100;
    const o = c - 50 * k;
    const q = (x, y) => `${(o + x * k).toFixed(2)},${(o + y * k).toFixed(2)}`;
    const body =
        `M${q(52, 31)} L${q(46, 60)} `
        + `M${q(50, 36)} L${q(37, 50)} L${q(33, 62)} `
        + `M${q(50, 36)} L${q(62, 47)} L${q(72, 51)} `
        + `M${q(46, 60)} L${q(58, 76)} L${q(61, 93)} `
        + `M${q(46, 60)} L${q(37, 78)} L${q(25, 89)}`;
    const d = ri * 0.74;
    return `<circle cx="${c}" cy="${c}" r="${(s / 2 - 0.5).toFixed(2)}" fill="${WHITE}" />`
        + `<circle cx="${c}" cy="${c}" r="${rr.toFixed(2)}" fill="${WHITE}" stroke="${color}" stroke-width="${sw.toFixed(2)}" />`
        + `<path d="${body}" fill="none" stroke="${GLYPH}" stroke-width="${(13 * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" />`
        + `<circle cx="${(o + 56 * k).toFixed(2)}" cy="${(o + 15 * k).toFixed(2)}" r="${(11 * k).toFixed(2)}" fill="${GLYPH}" />`
        + `<line x1="${(c - d).toFixed(2)}" y1="${(c - d).toFixed(2)}" x2="${(c + d).toFixed(2)}" y2="${(c + d).toFixed(2)}" stroke="${color}" stroke-width="${(sw * 0.9).toFixed(2)}" />`;
}

// 警戒（日本の道路標識の警戒標識風）。色のひし形に黒の外枠と「!」、その外側にひし形に沿った白の縁。
// 黄色は地理院地図の等高線（黄土色）・県道（黄色）に溶け込むため、黒枠で輪郭を出し、
// 白の縁で背景の線から切り離す。白の縁は (0,0)〜(s,s) の外へ片側 WARNING_HALO だけはみ出すので、
// 当たり領域（CLOSURE_ICON_BOX）はその分を含めて確保する。
// 「!」はフォント差をなくすため文字ではなく棒と点で描く
function warningSvg(color, s) {
    const c = s / 2;
    const sw = Math.max(1.5, s * 0.09);       // 黒枠の太さ
    const ring = Math.max(1.5, s * 0.1);      // 黒枠の外に見える白の縁の幅
    const inset = sw / 2 + 0.5;
    const p = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
    const pts = `${p(c, inset)} ${p(s - inset, c)} ${p(c, s - inset)} ${p(inset, c)}`;
    const w = Math.max(2, s * 0.11);
    return `<polygon points="${pts}" fill="${WHITE}" stroke="${WHITE}" stroke-width="${(sw + ring * 2).toFixed(1)}" stroke-linejoin="round" />`
        + `<polygon points="${pts}" fill="${color}" stroke="${GLYPH}" stroke-width="${sw.toFixed(1)}" stroke-linejoin="round" />`
        + `<rect x="${(c - w / 2).toFixed(1)}" y="${(s * 0.27).toFixed(1)}" width="${w.toFixed(1)}" height="${(s * 0.3).toFixed(1)}" rx="${(w / 2).toFixed(1)}" fill="${GLYPH}" />`
        + `<circle cx="${c}" cy="${(s * 0.7).toFixed(1)}" r="${(w * 0.55).toFixed(1)}" fill="${GLYPH}" />`;
}

// 形状のSVG断片を返す。box は当たり領域の一辺、size は描画サイズ。
function shapeSvg(shape, color, size, box) {
    const offset = (box - size) / 2; // 当たり領域の中央に形状を置く

    if (shape === 'noThoroughfare') {
        return `<g transform="translate(${offset},${offset})">${noThoroughfareSvg(color, size)}</g>`;
    }
    if (shape === 'warning') {
        return `<g transform="translate(${offset},${offset})">${warningSvg(color, size)}</g>`;
    }
    if (shape === 'triangle') {
        return `<polygon points="${box / 2},${offset} ${offset + size},${offset + size} `
            + `${offset},${offset + size}" fill="${color}" />`;
    }
    if (shape === 'square') {
        return `<rect x="${offset}" y="${offset}" width="${size}" height="${size}" fill="${color}" />`;
    }
    // circle（既定）
    return `<circle cx="${box / 2}" cy="${box / 2}" r="${size / 2}" fill="${color}" />`;
}

// マーカーアイコンのHTMLを生成する。
// interactive なマーカーでは透明な矩形を敷いて当たり領域を確保する。
export function markerHtml(style, box, { hitArea = false } = {}) {
    const hit = hitArea
        ? `<rect x="0" y="0" width="${box}" height="${box}" fill="transparent" pointer-events="all" />`
        : '';
    return `<svg width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" style="display:block;">`
        + hit + shapeSvg(style.shape, style.color, style.size, box) + '</svg>';
}

// 点マーカーを生成する。
// pane / interactive / className は呼び出し側の用途に応じて指定する。
export function createPointMarker(latlng, style, options = {}) {
    const {
        box = style.size,
        pane,
        interactive = false,
        className = 'map-marker',
        hitArea = false
    } = options;

    const markerOptions = {
        interactive,
        keyboard: false,
        icon: L.divIcon({
            className,
            html: markerHtml(style, box, { hitArea }),
            iconSize: [box, box],
            iconAnchor: [box / 2, box / 2]
        })
    };
    if (pane) markerOptions.pane = pane;

    return L.marker(latlng, markerOptions);
}

// 地図上のマーカー描画（ハイキングマップデータ・通行止め地点で共通）
//
// 形状と既定色は minoh-hiking のマーカー設定に合わせてある。
// 本アプリは公開前の確認用であり、利用者が見る地図と同じ見え方にすることを優先する。

// 形状のSVG断片を返す。box は当たり領域の一辺、size は描画サイズ。
function shapeSvg(shape, color, size, box) {
    const offset = (box - size) / 2; // 当たり領域の中央に形状を置く

    if (shape === 'x') {
        const weight = Math.max(2, Math.round(size / 3));
        return `<line x1="${offset}" y1="${offset}" x2="${offset + size}" y2="${offset + size}" `
            + `stroke="${color}" stroke-width="${weight}" stroke-linecap="round" />`
            + `<line x1="${offset + size}" y1="${offset}" x2="${offset}" y2="${offset + size}" `
            + `stroke="${color}" stroke-width="${weight}" stroke-linecap="round" />`;
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

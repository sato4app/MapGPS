// 通行止め・通行困難地点（closures）の保持・表示・公開用整形
//
// 地点の登録・編集は MapEditor の役割。本アプリは読み込んで確認し、公開するだけ。
// 公開スキーマの正本は minoh-hiking `docs/publish-api-202608.md` §3.3。

import {
    CLOSURE_STYLES, CLOSURE_ICON_BOX, CLOSURE_KIND_LABELS, CLOSURE_DEFAULT_KIND
} from './constants.js';
import { createPointMarker } from './render.js';
import { roundCoord, escapeHtml } from './utils.js';

const state = {
    map: null,
    layer: null,
    features: [],
    normalizedCount: 0   // 読み込み時に kind を既定値へ寄せた件数
};

export function init(map) {
    state.map = map;
}

// ===== 読み込み =====

// 公開ストアから取得した geojson には properties.type が無いことがあるため、
// type では絞り込まず Point 地物をすべて取り込む。
function isImportable(feature) {
    return !!feature
        && !!feature.geometry
        && feature.geometry.type === 'Point'
        && Array.isArray(feature.geometry.coordinates);
}

// 読み込みは置換方式（地図データと同じ理由。mapData.js の load を参照）
export function load(json) {
    if (!json || json.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
        throw new Error('FeatureCollection 形式の geojson ではありません');
    }

    const features = [];
    let normalized = 0;
    let skipped = 0;

    json.features.forEach(f => {
        if (!isImportable(f)) {
            skipped++;
            return;
        }
        const p = f.properties || (f.properties = {});
        // 公開スキーマの kind は closed / difficult のみ。
        // 未選択・不正値は既定値へ寄せ、件数を呼び出し側へ返して気づけるようにする。
        if (p.kind !== 'closed' && p.kind !== 'difficult') {
            p.kind = CLOSURE_DEFAULT_KIND;
            normalized++;
        }
        // status は廃止済み。読み込んだ値は捨てる
        delete p.status;
        features.push(f);
    });

    state.features = features;
    state.normalizedCount = normalized;

    redraw();
    return { total: features.length, normalized, skipped };
}

export function clear() {
    state.features = [];
    state.normalizedCount = 0;
    redraw();
}

export function isLoaded() {
    return state.features.length > 0;
}

// ===== 件数 =====

export function getCounts() {
    const counts = { closed: 0, difficult: 0, total: state.features.length };
    state.features.forEach(f => {
        const kind = f.properties && f.properties.kind;
        if (kind === 'difficult') counts.difficult++;
        else counts.closed++;
    });
    return counts;
}

export function getNormalizedCount() {
    return state.normalizedCount;
}

// ===== 描画 =====

// ポップアップは公開後に minoh-hiking で見える内容に合わせる
function popupHtml(feature) {
    const p = feature.properties || {};
    const lines = [`<strong>${escapeHtml(p.name || p.id || '')}</strong>`];
    const kindLabel = CLOSURE_KIND_LABELS[p.kind];
    if (kindLabel) lines.push(escapeHtml(kindLabel));
    if (p.reason) lines.push(`理由: ${escapeHtml(p.reason)}`);
    if (p.note) lines.push(escapeHtml(p.note));
    if (p.updatedAt) lines.push(`更新日: ${escapeHtml(p.updatedAt)}`);
    return lines.join('<br>');
}

function redraw() {
    if (!state.map) return;

    if (state.layer) {
        state.map.removeLayer(state.layer);
        state.layer = null;
    }
    if (state.features.length === 0) return;

    const layer = L.layerGroup();

    state.features.forEach(feature => {
        const kind = feature.properties.kind;
        const style = CLOSURE_STYLES[kind] || CLOSURE_STYLES[CLOSURE_DEFAULT_KIND];
        const [lng, lat] = feature.geometry.coordinates;

        // 通行止め地点は地図データより前面に置く（既定の markerPane を使う）
        const marker = createPointMarker([lat, lng], style, {
            interactive: true,
            className: 'closure-marker',
            hitArea: true,
            box: CLOSURE_ICON_BOX
        });
        marker.bindPopup(popupHtml(feature));
        layer.addLayer(marker);
    });

    state.layer = layer;
    if (document.getElementById('closureVisible').checked) {
        layer.addTo(state.map);
    }
}

export function setVisible(visible) {
    if (!state.layer) return;
    if (visible) state.layer.addTo(state.map);
    else state.map.removeLayer(state.layer);
}

// ===== 公開用整形 =====

// 公開スキーマ（publish-api-202608.md §3.3）のプロパティ順に整形する
function toPublishFeature(feature) {
    const p = feature.properties || {};
    const props = {
        type: 'closure',
        id: p.id || '',
        name: p.name || '',
        kind: p.kind === 'difficult' ? 'difficult' : CLOSURE_DEFAULT_KIND
    };
    if (p.reason) props.reason = p.reason;
    if (p.note) props.note = p.note;
    if (p.relatedRoute) props.relatedRoute = p.relatedRoute;
    props.updatedAt = p.updatedAt || '';

    return {
        type: 'Feature',
        properties: props,
        geometry: {
            type: 'Point',
            coordinates: roundCoord(feature.geometry.coordinates)
        }
    };
}

// version と updatedAt はサーバーが付与するため送らない（契約 2.0）
export function buildPublishData() {
    return {
        type: 'FeatureCollection',
        features: state.features.map(toPublishFeature)
    };
}

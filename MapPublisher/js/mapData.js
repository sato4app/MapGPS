// 地図データ（ポイント・ルート・スポット）の保持・表示・公開用整形
//
// MapEditor が出力した作業用 GeoJSON を読み込み、公開スキーマへ整形して公開する。
// 公開スキーマの正本は minoh-hiking `docs/publish-api-202608.md` §3。
// 本アプリは編集を行わない（位置・属性の変更は MapEditor 側の役割）。

import {
    MAPDATA_TYPES, MAPDATA_STYLES, MAPDATA_TYPE_LABELS, EXCLUDED_TYPE_LABELS
} from './constants.js';
import { createPointMarker } from './render.js';
import { roundCoord, escapeHtml } from './utils.js';

const state = {
    map: null,
    layer: null,
    features: [],                 // 公開対象の Feature（読み込んだ生の形のまま保持）
    counts: {},                   // type -> 件数
    excluded: {}                  // 公開対象外の type -> 件数
};

export function init(map) {
    state.map = map;
}

// ===== 読み込み =====

// 読み込みは置換方式。公開が全置換であり、MapEditor は完全な1ファイルを出力するため、
// 読み込みも「置換」に揃える（追加式にすると同じファイルを2回読んで件数が倍になる）。
export function load(json) {
    if (!json || json.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
        throw new Error('FeatureCollection 形式の geojson ではありません');
    }

    const features = [];
    const counts = {};
    const excluded = {};

    json.features.forEach(f => {
        const type = f && f.properties && f.properties.type;
        if (!f || !f.geometry) return;

        if (MAPDATA_TYPES.includes(type)) {
            features.push(f);
            counts[type] = (counts[type] || 0) + 1;
        } else {
            const key = type || '(type なし)';
            excluded[key] = (excluded[key] || 0) + 1;
        }
    });

    state.features = features;
    state.counts = counts;
    state.excluded = excluded;

    redraw();
    return { counts, excluded, total: features.length };
}

export function clear() {
    state.features = [];
    state.counts = {};
    state.excluded = {};
    redraw();
}

export function isLoaded() {
    return state.features.length > 0;
}

// ===== 件数 =====

// 公開スキーマの type 順に { type, label, count } を返す
export function getCounts() {
    return MAPDATA_TYPES.map(type => ({
        type,
        label: MAPDATA_TYPE_LABELS[type] || type,
        count: state.counts[type] || 0
    }));
}

export function getTotal() {
    return state.features.length;
}

// 公開対象外として除去した件数の内訳（表示用の文字列。無ければ空文字）
export function getExcludedSummary() {
    const entries = Object.entries(state.excluded);
    if (entries.length === 0) return '';
    const parts = entries.map(([type, n]) => `${EXCLUDED_TYPE_LABELS[type] || type} ${n}`);
    return `公開対象外 ${parts.join(' / ')}`;
}

// ===== 描画 =====

// ルート線は開始点・終了点の座標を補って描く（利用者アプリと同じ見え方にする）
function routeLatLngs(feature) {
    const p = feature.properties || {};
    const coords = (feature.geometry.coordinates || []).slice();

    if (Array.isArray(p.startPointGPS)) coords.unshift(p.startPointGPS);
    if (Array.isArray(p.endPointGPS)) coords.push(p.endPointGPS);

    return coords
        .filter(c => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number')
        .map(c => [c[1], c[0]]);
}

function popupHtml(feature) {
    const p = feature.properties || {};
    if (p.type === 'route') {
        return `<strong>${escapeHtml(p.id || '')}</strong>`;
    }
    if (p.type === 'spot') {
        return `<strong>${escapeHtml(p.name || '')}</strong>`;
    }
    // ポイントGPS は現地の標識と対応する id を併記する
    return `<strong>${escapeHtml(p.id || '')}</strong><br>${escapeHtml(p.name || '')}`;
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
        const type = feature.properties.type;
        const style = MAPDATA_STYLES[type];
        if (!style) return;

        if (type === 'route') {
            const latlngs = routeLatLngs(feature);
            if (latlngs.length < 2) return;
            const line = L.polyline(latlngs, {
                pane: 'mapDataLines',
                color: style.color,
                weight: style.weight,
                opacity: style.opacity
            });
            line.bindPopup(popupHtml(feature));
            layer.addLayer(line);
            return;
        }

        const coords = feature.geometry.coordinates;
        if (!Array.isArray(coords) || typeof coords[0] !== 'number') return;
        const marker = createPointMarker([coords[1], coords[0]], style, {
            pane: 'mapDataMarkers',
            interactive: true,
            className: 'map-marker',
            hitArea: true,
            box: Math.max(style.size, 16)
        });
        marker.bindPopup(popupHtml(feature));
        layer.addLayer(marker);
    });

    state.layer = layer;
    if (document.getElementById('mapDataVisible').checked) {
        layer.addTo(state.map);
    }
}

export function setVisible(visible) {
    if (!state.layer) return;
    if (visible) state.layer.addTo(state.map);
    else state.map.removeLayer(state.layer);
}

// ===== 公開用整形 =====

// geometry の座標を小数点以下5桁に丸める（内部の保持は読み込んだ精度のまま）
function roundGeometry(geometry) {
    return {
        type: geometry.type,
        coordinates: roundCoord(geometry.coordinates)
    };
}

// 公開スキーマ（publish-api-202608.md §3.2）へ整形する。
// 編集用の識別子（spot の id など）はここで落とす。
function toPublishFeature(feature) {
    const p = feature.properties || {};
    const type = p.type;

    if (type === 'ポイントGPS') {
        // id は現地の標識と対応する利用者向けの識別子のため残す。
        // pointId は全件で id と同値のため出力しない。
        const props = { type, id: p.id || '', name: p.name || '' };
        if (p.description != null && String(p.description).trim() !== '') {
            props.description = p.description;
        }
        return { type: 'Feature', properties: props, geometry: roundGeometry(feature.geometry) };
    }

    if (type === 'spot') {
        // id / source / description は出力しない（どこからも参照されず、値も定数のため）
        return {
            type: 'Feature',
            properties: { type, name: p.name || '' },
            geometry: roundGeometry(feature.geometry)
        };
    }

    if (type === 'route') {
        // startPoint / endPoint（ID参照）は出力しない。端点は座標で渡す。
        return {
            type: 'Feature',
            properties: {
                type,
                id: p.id || '',
                startPointGPS: Array.isArray(p.startPointGPS) ? roundCoord(p.startPointGPS) : null,
                endPointGPS: Array.isArray(p.endPointGPS) ? roundCoord(p.endPointGPS) : null
            },
            geometry: roundGeometry(feature.geometry)
        };
    }

    return null;
}

// 公開・ファイル出力で共通に使う FeatureCollection。
// version と updatedAt はサーバーが付与するため送らない（契約 2.0）。
export function buildPublishData() {
    return {
        type: 'FeatureCollection',
        features: state.features.map(toPublishFeature).filter(Boolean)
    };
}

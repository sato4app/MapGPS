// アプリケーション全体で使用する定数定義

// 版日付（MapGPS のカードに表示する版と揃える）
export const APP_VERSION = '2026-07-28';

// デフォルト設定
export const DEFAULTS = {
    // 地図設定
    MAP_CENTER: [34.853667, 135.472041], // 箕面大滝
    MAP_ZOOM: 15,
    MAP_MAX_ZOOM: 18,

    // 地理院地図タイル
    GSI_TILE_URL: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    GSI_ATTRIBUTION: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>'
};

// ===== 通行止め・通行困難地点（closures）の表示 =====

// マーカーの既定スタイル。minoh-hiking の既定値（CLOSURE_FALLBACK_STYLES）に合わせ、
// 公開後にユーザーが見る地図との見え方を揃える。
// unknown（区分未選択）は minoh-hiking には無い編集専用の状態。
export const CLOSURE_STYLES = {
    closed: { color: '#DC2626', shape: 'x', size: 10 },
    difficult: { color: '#F59E0B', shape: 'triangle', size: 16 },
    unknown: { color: '#6B7280', shape: 'question', size: 16 }
};

// マーカーアイコンの当たり領域（px）。✖印のように描画部分が細い形状でも
// 掴んでドラッグできるよう、実際の描画サイズより大きい正方形を確保する。
export const CLOSURE_ICON_BOX = 24;

// 選択中マーカーのハイライト色（アクア）
export const CLOSURE_HIGHLIGHT_COLOR = '#00ffff';

// 区分（kind）の表示ラベル
export const CLOSURE_KIND_LABELS = {
    closed: '通行止め',
    difficult: '通行困難',
    unknown: '未選択'
};

// ===== 背景（ハイキングマップ）の表示 =====

// minoh-hiking のマーカー設定の既定値（config.js の MARKER_TYPES）に合わせる
export const BASEMAP_STYLES = {
    route: { color: '#007d00', weight: 3, opacity: 0.85 },
    spot: { color: '#1E90FF', shape: 'square', size: 10 },
    emergency: { color: '#00AA00', shape: 'circle', size: 12 },
    area: { color: '#00ffff', weight: 2, opacity: 0.9, fillOpacity: 0.1 }
};

// 統合 GeoJSON（GeoReferencer 由来）で使われる closure 以外の type。
// 統合 GeoJSON を誤って「登録地点のファイル読み込み」で選んでも取り込まないための除外リスト。
export const NON_CLOSURE_TYPES = [
    'ポイントGPS', 'point', 'route', 'route_waypoint', 'spot', 'スポット', 'area'
];

// ===== 公開API =====
// 仕様の正本は minoh-hiking 設計書 §5（対応する契約バージョン: 1.0）。
// 依存している契約項目は docs/funcspec-202607.md §6 を参照。
// ここに検証ルールを再実装しないこと。
export const CLOSURE_API_URL = 'https://minoh-hiking.vercel.app/api/closures';

// 公開トークンの保存先（この端末のみ。認証失敗〈401〉時は削除して再入力を促す）
export const CLOSURE_TOKEN_KEY = 'closure-editor.publish-token';

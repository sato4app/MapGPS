// アプリケーション全体で使用する定数定義

// 版日付（MapGPS のカードに表示する版と揃える）
export const APP_VERSION = '2026-08-18';

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

// ===== 公開API =====
// 仕様の正本は minoh-hiking `docs/publish-api-202608.md`（契約バージョン 2.0）。
// 検証ルール・エラー文言をここに再実装しないこと。判定はサーバーに任せ、
// 失敗時は API が返した日本語メッセージをそのまま表示する。
const API_ORIGIN = 'https://minoh-hiking.vercel.app';

export const API_URLS = {
    manifest: `${API_ORIGIN}/api/manifest`,
    mapdata: `${API_ORIGIN}/api/mapdata`,
    closures: `${API_ORIGIN}/api/closures`
};

// 公開トークンの保存先（この端末のみ。認証失敗〈401〉時は削除して再入力を促す）
// 2データセット共通（サーバー側の環境変数 MAP_PUBLISH_TOKEN と同一）
export const PUBLISH_TOKEN_KEY = 'map-publisher.publish-token';

// ===== 公開スキーマ =====
// 正本は publish-api-202608.md §3。ここには「どの type を公開するか」だけを持つ。

// ハイキングマップデータとして公開する type（これ以外は公開時に除去する）
export const MAPDATA_TYPES = ['ポイントGPS', 'route', 'spot'];

// 公開対象外の type の表示名（除外件数の内訳表示で使用）
export const EXCLUDED_TYPE_LABELS = {
    route_waypoint: 'ルート中間点',
    area: 'エリア',
    closure: '通行止め地点'
};

// 公開対象外のうち、除外を知らせないもの。
// `point`（画像変換済みポイント）は `ポイントGPS` と同じ地点を別に持っているだけで、
// 除外は仕様どおりであり運用者が対応することもない。毎回知らせても判断材料にならず、
// 本当に確認してほしい除外（エリア・通行止め地点の混入など）が埋もれる。
export const SILENT_EXCLUDED_TYPES = ['point'];

// ===== ハイキングマップデータ（mapdata）の表示 =====
// minoh-hiking のマーカー設定の既定値（config.js の MARKER_TYPES）に合わせ、
// 公開後にユーザーが見る地図との見え方を揃える。
export const MAPDATA_STYLES = {
    'ポイントGPS': { color: '#00AA00', shape: 'circle', size: 12 },
    spot: { color: '#1E90FF', shape: 'square', size: 10 },
    route: { color: '#007d00', weight: 3, opacity: 0.85 }
};

// 件数表示のラベル（公開スキーマの type 順に並べる）
export const MAPDATA_TYPE_LABELS = {
    'ポイントGPS': 'ポイント',
    route: 'ルート',
    spot: 'スポット'
};

// ===== 通行止め・通行困難地点（closures）の表示 =====

// マーカーの既定スタイル。minoh-hiking の既定値に合わせる。
export const CLOSURE_STYLES = {
    closed: { color: '#DC2626', shape: 'x', size: 10 },
    difficult: { color: '#F59E0B', shape: 'triangle', size: 16 }
};

// マーカーアイコンの当たり領域（px）。✖印のように描画部分が細い形状でも
// クリックしやすいよう、実際の描画サイズより大きい正方形を確保する。
export const CLOSURE_ICON_BOX = 24;

// 区分（kind）の表示ラベル
export const CLOSURE_KIND_LABELS = {
    closed: '通行止め',
    difficult: '通行困難'
};

// 区分の既定値。MapEditor の CLOSURE_DEFAULT_KIND と揃える。
// 公開スキーマでは kind は closed / difficult のみで、未選択は存在しない。
export const CLOSURE_DEFAULT_KIND = 'closed';

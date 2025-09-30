// アプリケーション全体で使用する定数定義

// 設定定数
export const CONFIG = {
    // 地図初期化設定
    MAP_INITIALIZATION_TIMEOUT: 5000, // ms
    MAP_INITIALIZATION_INTERVAL: 100, // ms
    
    // モジュール初期化遅延
    POINT_OVERLAY_INIT_DELAY: 100, // ms
    
    // ファイルタイプ
    ACCEPTED_IMAGE_TYPES: ['image/png'],
    ACCEPTED_EXCEL_EXTENSIONS: ['.xlsx'],
    ACCEPTED_JSON_EXTENSIONS: ['.json'],
    
    // UI設定
    MESSAGE_BOX_Z_INDEX: 10000,
    OVERLAY_CONTROLS_Z_INDEX: 1000,
};

// デフォルト設定
export const DEFAULTS = {
    // 地図設定
    MAP_CENTER: [34.853667, 135.472041], // 箕面大滝
    MAP_ZOOM: 15,
    MAP_MAX_ZOOM: 18,

    // 地理院地図タイル
    GSI_TILE_URL: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    GSI_ATTRIBUTION: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',

    // スタイル設定
    POINT_STYLE: {
        radius: 6,
        fillColor: '#006400',
        color: '#006400',
        weight: 0,
        stroke: false,
        opacity: 1,
        fillOpacity: 1
    },

    LINE_STYLE: {
        color: '#3388ff',
        weight: 3,
        opacity: 0.8,
        fillOpacity: 0.3
    },

    // フィーチャータイプ別スタイル設定
    FEATURE_STYLES: {
        // ポイントGPS: 緑(#008000)、円形、半径6px（枠なし）
        'ポイントGPS': {
            radius: 6,
            fillColor: '#008000',
            color: '#008000',
            weight: 0,
            stroke: false,
            opacity: 1,
            fillOpacity: 1
        },
        // ルート中間点: 橙色(#f58220)、菱形（ダイヤモンド型）、8x8px（枠なし）
        'route_waypoint': {
            radius: 4,
            fillColor: '#f58220',
            color: '#f58220',
            weight: 0,
            stroke: false,
            opacity: 1,
            fillOpacity: 0.8,
            shape: 'diamond'
        },
        // スポット: 青色(#0000ff)、正方形、12x12px（枠なし）
        'spot': {
            radius: 12,
            fillColor: '#0000ff',
            color: '#0000ff',
            weight: 0,
            stroke: false,
            opacity: 1,
            fillOpacity: 0.8,
            shape: 'square'
        }
    },

    // ファイル設定
    SUPPORTED_FILE_TYPES: ['.geojson', '.json'],
    EXPORT_FILENAME: 'export.geojson',

    // UI設定
    CONTROL_PANEL_WIDTH: 320
};

// イベント名
export const EVENTS = {
    DOM_CONTENT_LOADED: 'DOMContentLoaded',
    FILE_CHANGE: 'change',
    BUTTON_CLICK: 'click',
    MAP_READY: 'mapready',
    DATA_LOADED: 'dataloaded'
};

// CSS クラス名
export const CSS_CLASSES = {
    EDITOR_PANEL: 'editor-panel',
    OVERLAY_CONTROLS: 'overlay-controls',
    MESSAGE_BOX: 'message-box',
    ERROR: 'error',
    WARNING: 'warning',
    SUCCESS: 'success',
    VISUALLY_HIDDEN: 'visually-hidden'
};

// モード定数
export const MODES = {
    GEOJSON: 'geojson',
    ROUTE: 'route',
    SPOT: 'spot'
};

// ログレベル
export const LOG_LEVELS = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
};
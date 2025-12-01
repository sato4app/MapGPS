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
    
    // Excel読み込み制限
    MAX_EXCEL_ROWS: 1000, // ヘッダー行含む最大読み込み行数
    
    // アフィン変換設定
    AFFINE_TRANSFORMATION_MODE: 'auto', // 'simple', 'precise', 'auto'
    
    // UI設定
    MESSAGE_BOX_Z_INDEX: 10000,
    OVERLAY_CONTROLS_Z_INDEX: 1000,
    MESSAGE_DISPLAY_DURATION: 3000, // ms
    
    // Firebase設定
    FIREBASE_AUTH_RETRY_LIMIT: 3,
    FIREBASE_OPERATION_TIMEOUT: 10000, // ms

    // エラーメッセージ
    ERROR_MESSAGES: {
        MAP_NOT_INITIALIZED: '地図が初期化されていません。',
        INVALID_IMAGE_FORMAT: 'PNG形式の画像ファイルを選択してください。',
        MODULE_NOT_INITIALIZED: 'モジュールが初期化されていません。',
        FILE_LOAD_FAILED: 'ファイルの読み込みに失敗しました。',
        FIREBASE_NOT_CONNECTED: 'Firebase接続が利用できません。',
        FIREBASE_AUTH_FAILED: 'Firebase認証に失敗しました。',
        FIREBASE_LOAD_FAILED: 'Firebaseからのデータ読み込みに失敗しました。',
        FIREBASE_SAVE_FAILED: 'Firebaseへのデータ保存に失敗しました。'
    },
    
    // 成功メッセージ
    SUCCESS_MESSAGES: {
        FILE_LOADED: 'ファイルが正常に読み込まれました。',
        DATA_SAVED: 'データが正常に保存されました。',
        FIREBASE_CONNECTED: 'Firebaseに接続しました。',
        FIREBASE_LOADED: 'Firebaseからデータを読み込みました。',
        FIREBASE_SAVED: 'Firebaseにデータを保存しました。'
    },
    
    // セレクター
    SELECTORS: {
        MAP: '#map',
        LOAD_IMAGE_BTN: '#loadImageBtn',
        IMAGE_INPUT: '#imageInput',
        LOAD_GPS_BTN: '#loadGpsBtn',
        GPS_INPUT: '#gpsCsvInput',
        MESSAGE_BOX: '.message-box'
    }
};

// デフォルト設定
export const DEFAULTS = {
    // 地図設定
    MAP_CENTER: [34.853667, 135.472041], // 箕面大滝
    MAP_ZOOM: 15, // デフォルトズームレベルを15に設定
    
    // 画像オーバーレイ設定
    IMAGE_OVERLAY_DEFAULT_SCALE: 0.8,
    IMAGE_OVERLAY_DEFAULT_OPACITY: 50,
    
    // UI設定
    CONTROL_PANEL_WIDTH: 320,
    ANIMATION_DURATION: 200
};

// CSS クラス名
export const CSS_CLASSES = {
    MESSAGE_BOX: 'message-box',
    ERROR: 'error',
    WARNING: 'warning',
    SUCCESS: 'success'
};

// ログレベル
export const LOG_LEVELS = {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
};
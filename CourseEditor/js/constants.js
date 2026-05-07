// アプリケーション全体で使用する定数定義

export const DEFAULTS = {
    // 地図設定
    MAP_CENTER: [34.853667, 135.472041], // 箕面大滝
    MAP_ZOOM: 15,
    MAP_MAX_ZOOM: 18,

    // 地理院地図タイル
    GSI_TILE_URL: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    GSI_ATTRIBUTION: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>',

    // Excel読み込み制限
    MAX_EXCEL_ROWS: 1000,

    // ポイントGPS (Excel): 緑の円形
    GPS_POINT_STYLE: {
        radius: 6,
        fillColor: '#008000',
        color: '#008000',
        weight: 0,
        stroke: false,
        opacity: 1,
        fillOpacity: 1
    },

    // ポイント (GeoJSON): aquamarine の円形
    POINT_STYLE: {
        radius: 6,
        fillColor: '#7fffd4',
        color: '#7fffd4',
        weight: 0,
        stroke: false,
        opacity: 1,
        fillOpacity: 1
    },

    // ルートスタイル（interactive: false でマーカーへのクリックを妨げない）
    ROUTE_STYLE: {
        color: '#4682b4',
        weight: 3,
        opacity: 0.8,
        interactive: false
    }
};

// モード定数
export const MODES = {
    FILEIO: 'fileio',
    COURSE: 'course',
    PHOTO: 'photo',
    COLOR: 'color'
};

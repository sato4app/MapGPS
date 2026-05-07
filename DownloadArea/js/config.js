// アプリケーション設定定数
export const CONFIG = {
    // 地図設定
    MAP_CENTER: [34.853667, 135.472041], // 箕面大滝
    MAP_ZOOM: 15,

    // 国土地理院タイル設定
    GSI_TILE_URL: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    GSI_ATTRIBUTION: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>',

    // ポイントマーカー設定
    POINT_MARKER_COLOR: '#008000',    // 緑(#008000) 赤色(#ff0000)。ポイントGPS用デフォルト
    POINT_MARKER_RADIUS: 6,
    SELECTED_POINT_COLOR: '#32cd32',  // ライムグリーン(#32cd32)  // ライム:明るい緑(#00ff00)
    // 区分別マーカー色
    POINT_MARKER_COLORS: {
        GPS: '#008000',       // 緑（ポイントGPS）
        ADDED: '#0000ff',     // 青（追加ポイント）
        EXCLUDED: '#800000'   // maroon（領域の算出から除外） 灰色(#9ca3af)
    },
    POINT_MARKER_WEIGHT: 2,
    POINT_MARKER_OPACITY: 1,
    POINT_MARKER_FILL_OPACITY: 0.8,
    POINT_TOOLTIP_OFFSET: [0, -10],

    // UI色設定
    MOVE_BUTTON_ACTIVE_COLOR: '#32cd32',  // ライムグリーン(#32cd32)

    // ファイルタイプ
    ACCEPTED_EXCEL_EXTENSIONS: ['.xlsx'],

    // Excel読み込み制限
    MAX_EXCEL_ROWS: 1000,

    // UI設定
    MESSAGE_DISPLAY_DURATION: 3000, // ms

    // 重複チェック距離（ピクセル単位）
    DUPLICATE_CHECK_DISTANCE: 10,

    // 座標表示桁数（10進緯度経度の小数点以下）
    COORDINATE_DECIMAL_DIGITS: 5,

    // ポイント区分（dropdown選択値）
    CATEGORIES: {
        GPS: 'ポイントGPS',
        ADDED: '追加ポイント',
        EXCLUDED: '領域の算出から除外'
    },

    // 仮IDフォーマット（ポイント追加時）
    TEMPORARY_ID: {
        PREFIX: 'Z#',
        PAD_WIDTH: 2,                  // Z#01, Z#02 ... の桁数
        LOCATION_PREFIX: 'Zoom DL #' // 名称の既定値: 'Zoom DL #01' のようになる
    },

    // Excelヘッダー（完全一致）
    EXCEL_HEADERS: {
        ID: 'ポイントID',
        LOCATION: '名称',
        LAT: '緯度',
        LNG: '経度',
        ELEVATION: '標高',
        CATEGORY: 'ポイント区分'
    },

    // Download領域 (タイル/円バッファ) 設定
    DOWNLOAD_AREA: {
        // ズームレベルとバッファ半径(m)
        Z17: 17,
        Z18: 18,
        BUFFER_M_Z17: 500,
        BUFFER_M_Z18: 200,

        // 円ポリゴン近似の頂点数（GeoJSON出力用）
        CIRCLE_VERTICES: 64,

        // 地球半径(m)
        EARTH_RADIUS_M: 6378137,

        // GeoJSON / Manifest メタデータ
        MANIFEST_VERSION: 1,
        MANIFEST_SOURCE: 'download-area-edited',
        LAYER_KEY_Z17: 'z17_default',
        LAYER_KEY_Z18: 'z18_optional',
        Z17_MIN_ZOOM: 13,
        Z17_MAX_ZOOM: 17,
        Z18_MIN_ZOOM: 18,
        Z18_MAX_ZOOM: 18,

        // 出力ファイル名
        GEOJSON_FILENAME: 'tile_buffers.geojson',
        MANIFEST_FILENAME: 'tile_manifest.json',

        // タイル統計表示用
        STAT_ZOOM_LEVELS: [10, 11, 12, 13, 14, 15, 16, 17, 18],
        AVG_TILE_KB: 12, // 1タイルあたりの平均容量（地理院 std タイル経験値）

        // タイルカバー率閾値（縁タイルの足切り）
        // タイル面積に対するバッファカバー率がこの値以上のタイルのみを採用する。
        // バッファ面積がタイル面積×閾値より小さい場合（低ズーム）は閾値を適用せず、
        // 従来通り「少しでも交差するタイル」を採用する。
        COVERAGE_THRESHOLD: 0.05,        // 5%
        COVERAGE_SAMPLE_GRID: 10,        // 10×10 = 100 サンプル/タイル

        // 動的バッファ
        // 各ポイントのバッファ半径を「最近接ポイントまでの距離」に応じて自動的に縮小する。
        DYNAMIC_BUFFER_ENABLED: true,    // 一括 ON/OFF（false で従来動作）
        SHRINK_FACTOR: 0.6,              // 最近接距離 × この係数まで縮める
        RADIUS_FLOOR_M: 50,              // 半径の最小値（m）

        // クラスタ統合
        // 近接ポイントをクラスタとしてまとめ、重心を中心とした単一の円で代表させる。
        // クラスタ内の重複円・重複タイルを構造的に削減する。
        CLUSTER_DISTANCE_M: 200          // ペア距離がこの値以下なら同じクラスタ（推移的に併合）
    },

    // 円バッファ表示スタイル
    BUFFER_CIRCLE_Z17_STYLE: {
        color: '#1d4ed8',       // 青(枠線)
        weight: 1,
        fillColor: '#3b82f6',   // 青(塗り)
        fillOpacity: 0.02,
        interactive: false
    },
    BUFFER_CIRCLE_Z18_STYLE: {
        color: '#16a34a',       // 緑(枠線)
        weight: 1,
        fillColor: '#22c55e',   // 緑(塗り)
        fillOpacity: 0.05,
        interactive: false
    },

    // エラーメッセージ
    MESSAGES: {
        EXCEL_LOAD_SUCCESS: 'Excelファイルを正常に読み込みました',
        EXCEL_LOAD_ERROR: 'Excelファイルの読み込みに失敗しました',
        POINT_ADDED: 'ポイント {id} を追加しました',
        POINT_MOVED: 'ポイント {id} を移動しました',
        POINT_DELETED: 'ポイント {id} を削除しました',
        NO_POINT_SELECTED: 'ポイントが選択されていません',
        EXPORT_SUCCESS: 'ファイルを出力しました',
        EXPORT_ERROR: 'ファイル出力に失敗しました',
        EXCEL_ROWS_LIMITED: '読み込み行数が上限に達しました。最初の{rows}行のみ処理されました。',
        DUPLICATE_POINT_WARNING: '既存のポイント {id} と同じ場所には追加できません',
        DOWNLOAD_AREA_EMPTY: '出力対象のポイントがありません',
        DOWNLOAD_AREA_EXPORT_ERROR: 'ファイル出力中にエラーが発生しました'
    }
};

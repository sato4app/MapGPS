// メインアプリケーション

import { MODES } from './constants.js';
import { initializeMap } from './mapCore.js';
import { setupExcelInput, setupGeoJsonInput, setupExportButton, setupImportCourseButton, markerStore, routeFeatureStore } from './fileIO.js';
import { setupCourseEditor, setMarkerColors } from './courseEditor.js';

// 地図とレイヤーの初期化
const { map, dataLayer } = initializeMap();

// ファイル入出力の設定
setupExcelInput(dataLayer);
setupGeoJsonInput(dataLayer);
setupExportButton();
setupImportCourseButton();

// コースエディタの設定
setupCourseEditor(map, markerStore, routeFeatureStore);

// モード切り替え処理
document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', function () {
        // ラジオボタンの選択スタイルを更新
        document.querySelectorAll('.control-section label span').forEach(span => {
            span.classList.remove('selected');
        });
        if (this.checked) {
            this.nextElementSibling.classList.add('selected');
        }

        // パネルの表示切り替え
        document.getElementById('fileIoPanel').style.display =
            this.value === MODES.FILEIO ? 'block' : 'none';
        document.getElementById('coursePanel').style.display =
            this.value === MODES.COURSE ? 'block' : 'none';
        document.getElementById('photoPanel').style.display =
            this.value === MODES.PHOTO ? 'block' : 'none';
        document.getElementById('colorPanel').style.display =
            this.value === MODES.COLOR ? 'block' : 'none';
    });
});

// 色設定パネルのイベント配線
const COLOR_FIELDS = [
    { id: 'colorSelectedPoint', swatchId: 'swatchSelectedPoint', key: 'selectedPoint' },
    { id: 'colorSelectedRoute', swatchId: 'swatchSelectedRoute', key: 'selectedRoute' },
    { id: 'colorOtherPoint',    swatchId: 'swatchOtherPoint',    key: 'otherPoint'    },
    { id: 'colorOtherRoute',    swatchId: 'swatchOtherRoute',    key: 'otherRoute'    },
];

const COLOR_DEFAULTS = {
    selectedPoint: '#ff0000',
    selectedRoute: '#ff8c00',
    otherPoint:    '#b22222',
    otherRoute:    '#f08080',
};

COLOR_FIELDS.forEach(({ id, swatchId, key }) => {
    document.getElementById(id).addEventListener('change', function () {
        const color = this.value.trim();
        if (!color) return;
        document.getElementById(swatchId).style.background = color;
        setMarkerColors({ [key]: color });
    });
});

// デフォルト値に戻すボタン
document.getElementById('colorResetBtn').addEventListener('click', () => {
    COLOR_FIELDS.forEach(({ id, swatchId, key }) => {
        const color = COLOR_DEFAULTS[key];
        document.getElementById(id).value = color;
        document.getElementById(swatchId).style.background = color;
    });
    setMarkerColors(COLOR_DEFAULTS);
});

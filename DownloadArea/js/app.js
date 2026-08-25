// メインアプリケーション
import { MapManager } from './map-manager.js';
import { GPSDataManager } from './gps-data-manager.js';
import { PointManager } from './point-manager.js';
import { FileHandler } from './file-handler.js';
import { DataUtils } from './data-utils.js';
import { DownloadAreaManager } from './download-area.js';
import { CONFIG } from './config.js';

class PointGPSApp {
    constructor() {
        this.mapManager = null;
        this.gpsDataManager = null;
        this.pointManager = null;
        
        this.init();
    }

    async init() {
        try {
            // 地図管理初期化
            this.mapManager = new MapManager('map');
            
            // ファイルハンドラー初期化
            this.fileHandler = new FileHandler();
            
            // GPSデータ管理初期化
            this.gpsDataManager = new GPSDataManager(this.fileHandler);
            
            // ポイント管理初期化
            this.pointManager = new PointManager(this.mapManager, this.gpsDataManager);
            this.pointManager.setAppInstance(this);

            // Download領域管理初期化（円描画とファイル出力）
            this.downloadAreaManager = new DownloadAreaManager(this.mapManager, this.gpsDataManager, this.fileHandler);
            this.pointManager.onPointsChanged = () => this.downloadAreaManager.updateCircles();

            // イベントハンドラー設定
            this.setupEventHandlers();
            
            console.log('PointGPSアプリケーションを初期化しました');
        } catch (error) {
            console.error('アプリケーション初期化エラー:', error);
            this.showError('アプリケーションの初期化中にエラーが発生しました');
        }
    }

    setupEventHandlers() {
        // Excel読み込みボタン
        const loadBtn = document.getElementById('loadBtn');
        const gpsCsvInput = document.getElementById('gpsCsvInput');
        
        loadBtn.addEventListener('click', () => {
            gpsCsvInput.click();
        });
        
        gpsCsvInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const pointCount = await this.gpsDataManager.loadExcelFile(file);
                    this.pointManager.displayAllPoints();
                    this.showMessage(`${pointCount}個のポイントを読み込みました`);
                } catch (error) {
                    console.error('Excel読み込みエラー:', error);
                    this.showError(CONFIG.MESSAGES.EXCEL_LOAD_ERROR);
                }
            }
        });

        // トップレベルのモード切替ラジオボタン
        const panelModeRadios = document.querySelectorAll('input[name="panelMode"]');
        const pointEditPanel = document.getElementById('pointEditPanel');
        const downloadAreaPanel = document.getElementById('downloadAreaPanel');
        panelModeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (!radio.checked) return;
                const isPointEdit = (radio.value === 'pointEdit');
                pointEditPanel.hidden = !isPointEdit;
                downloadAreaPanel.hidden = isPointEdit;
            });
        });

        // ポイント操作ボタン
        document.getElementById('addPointBtn').addEventListener('click', () => {
            // 移動モードが有効な場合は解除
            if (this.pointManager.isMovingPoint) {
                this.pointManager.setMovingMode(false);
                this.resetMoveButtonColor();
            }
            this.pointManager.setAddingMode(true);
            this.showMessage('地図上をクリックしてポイントを追加してください');
        });

        document.getElementById('movePointBtn').addEventListener('click', () => {
            if (this.pointManager.selectedPointId) {
                const moveBtn = document.getElementById('movePointBtn');
                moveBtn.style.backgroundColor = CONFIG.MOVE_BUTTON_ACTIVE_COLOR;
                this.pointManager.setMovingMode(true);
                this.showMessage(DataUtils.formatMessage('ポイント {id} をドラッグして移動してください', {id: this.pointManager.selectedPointId}));
            } else {
                this.showMessage(CONFIG.MESSAGES.NO_POINT_SELECTED);
            }
        });

        document.getElementById('deletePointBtn').addEventListener('click', () => {
            // 移動モードが有効な場合は解除
            if (this.pointManager.isMovingPoint) {
                this.pointManager.setMovingMode(false);
                this.resetMoveButtonColor();
            }
            
            const selectedPointId = this.pointManager.selectedPointId;
            if (selectedPointId && confirm(`選択したポイント ${selectedPointId} を削除しますか？`)) {
                this.pointManager.deleteSelectedPoint();
            } else if (!selectedPointId) {
                this.pointManager.showMessage('削除するポイントが選択されていません');
            }
        });

        // 「領域を表示」トグルボタン
        const toggleAreaDisplayBtn = document.getElementById('toggleAreaDisplayBtn');
        toggleAreaDisplayBtn.addEventListener('click', () => {
            const next = !this.downloadAreaManager.isAreaDisplayEnabled();
            this.downloadAreaManager.setAreaDisplayEnabled(next);

            toggleAreaDisplayBtn.classList.toggle('active', next);
            toggleAreaDisplayBtn.setAttribute('aria-pressed', String(next));
            toggleAreaDisplayBtn.textContent = next ? '領域非表示' : '領域表示';

            this.showMessage(next ? 'ダウンロード領域を表示しました' : 'ダウンロード領域を非表示にしました');
        });

        // バッファ半径の設定（スライダーと数値欄を双方向同期）
        // slider/numberField のどちらの操作でも値を共有し、半径を反映する。
        // min/max/step/初期値は config.js の値を起動時に設定する（設定元を一元化）。
        const setupBufferRadiusControl = (sliderId, valueId, range, applyRadius) => {
            const slider = document.getElementById(sliderId);
            const valueField = document.getElementById(valueId);
            const { min, max, step, value } = range;

            // config.js の値を min/max/step/初期値として両コントロールに反映
            for (const el of [slider, valueField]) {
                el.min = min;
                el.max = max;
                el.step = step;
                el.value = value;
            }

            // スライダー操作 → 数値欄へ反映
            slider.addEventListener('input', () => {
                valueField.value = slider.value;
                applyRadius(slider.value);
            });

            // 数値欄の確定（範囲外はクランプ）→ スライダーへ反映
            valueField.addEventListener('change', () => {
                let v = Number(valueField.value);
                if (!Number.isFinite(v)) v = Number(slider.value);
                v = Math.min(max, Math.max(min, v));
                valueField.value = v;
                slider.value = v;
                applyRadius(v);
            });
        };

        const DA = CONFIG.DOWNLOAD_AREA;
        setupBufferRadiusControl('bufferR17Slider', 'bufferR17Value',
            { min: DA.BUFFER_R17_MIN, max: DA.BUFFER_R17_MAX, step: DA.BUFFER_R17_STEP, value: DA.BUFFER_M_Z17 },
            (v) => this.downloadAreaManager.setBufferR17(v));
        setupBufferRadiusControl('bufferR18Slider', 'bufferR18Value',
            { min: DA.BUFFER_R18_MIN, max: DA.BUFFER_R18_MAX, step: DA.BUFFER_R18_STEP, value: DA.BUFFER_M_Z18 },
            (v) => this.downloadAreaManager.setBufferR18(v));

        // ルート読み込み(GeoJSON) ボタン
        const loadRouteBtn = document.getElementById('loadRouteBtn');
        const routeGeoJSONInput = document.getElementById('routeGeoJSONInput');
        loadRouteBtn.addEventListener('click', () => {
            routeGeoJSONInput.click();
        });
        routeGeoJSONInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const geojson = JSON.parse(text);
                const result = this.downloadAreaManager.loadRouteGeoJSON(geojson);
                this.showMessage(
                    `ルートGeoJSONを読み込みました（${result.lineCount}ライン / 中間点 ${result.pointCount}個）`
                );
            } catch (error) {
                console.error('GeoJSON読み込みエラー:', error);
                this.showError('GeoJSONファイルの読み込みに失敗しました');
            } finally {
                // 同じファイルを再選択しても change が発火するようリセット
                routeGeoJSONInput.value = '';
            }
        });

        // タイルサイズ実測ボタン
        const measureTileSizeBtn = document.getElementById('measureTileSizeBtn');
        measureTileSizeBtn.addEventListener('click', async () => {
            if (!this.downloadAreaManager.isAreaDisplayEnabled()) {
                this.showMessage('「領域表示」をONにしてから実測してください', 'warning');
                return;
            }

            const ok = confirm(
                'タイルを1枚ずつ国土地理院に問い合わせて実際のサイズを集計します。\n' +
                '結果は正確ですが、タイル1000枚あたり3〜5分程度かかります。\n' +
                '実行してもよろしいですか？'
            );
            if (!ok) return;

            measureTileSizeBtn.disabled = true;
            const originalLabel = measureTileSizeBtn.textContent;
            try {
                const result = await this.downloadAreaManager.measureTileSizes((done, total) => {
                    measureTileSizeBtn.textContent = `${done}/${total}`;
                });
                if (result.success) {
                    this.showMessage(`${result.tileCount}枚のタイル実サイズを集計しました`);
                } else if (result.reason === 'empty') {
                    this.showMessage('対象タイルがありません', 'warning');
                }
            } catch (error) {
                console.error('タイルサイズ実測エラー:', error);
                this.showError('タイルサイズの実測中にエラーが発生しました');
            } finally {
                measureTileSizeBtn.textContent = originalLabel;
                measureTileSizeBtn.disabled = false;
            }
        });

        // ズーム別タイルグリッド表示の選択
        const tileGridZoomSelect = document.getElementById('tileGridZoomSelect');
        tileGridZoomSelect.addEventListener('change', () => {
            const value = tileGridZoomSelect.value;
            this.downloadAreaManager.setTileGridZoom(value === '' ? null : value);

            if (value === '') {
                this.showMessage('タイルグリッドの図示を解除しました');
            } else if (!this.downloadAreaManager.isAreaDisplayEnabled()) {
                this.showMessage('「領域表示」をONにするとタイルグリッドが表示されます', 'warning');
            } else {
                this.showMessage(`z=${value} の対象タイルを地図に図示しました`);
            }
        });

        // ポイント出力(Excel)ボタン
        const exportPointsExcelBtn = document.getElementById('exportPointsExcelBtn');
        exportPointsExcelBtn.addEventListener('click', async () => {
            try {
                const data = this.gpsDataManager.buildExcelExportData();
                if (data.length <= 1) {
                    this.showError(CONFIG.MESSAGES.DOWNLOAD_AREA_EMPTY);
                    return;
                }
                const defaultFilename = `ポイントGPS区分付-${this.fileHandler.getTodayString()}`;
                const result = await this.fileHandler.saveExcelWithUserChoice(data, defaultFilename);
                if (result.success) {
                    this.showMessage(`Excelファイル「${result.filename}」を出力しました`);
                } else if (result.error !== 'キャンセル') {
                    this.showError(`ファイル出力に失敗しました: ${result.error}`);
                }
            } catch (error) {
                console.error('Excel出力エラー:', error);
                this.showError(CONFIG.MESSAGES.EXPORT_ERROR);
            }
        });

        // ダウンロード領域の指定ファイル出力ボタン
        const exportDownloadAreaBtn = document.getElementById('exportDownloadAreaBtn');

        exportDownloadAreaBtn.addEventListener('click', async () => {
            try {
                const result = await this.downloadAreaManager.exportFiles();
                if (result.success) {
                    // 保存ダイアログで名前を変えられるため、実際に保存した名前を表示する
                    const names = (result.filenames && result.filenames.length > 0)
                        ? result.filenames.join(' と ')
                        : 'tile_buffers.geojson と tile_manifest.json';
                    this.showMessage(
                        `${names} を出力しました\n` +
                        `対象: ${result.pointCount}ポイント / ` +
                        `z14:${result.z14Count}枚 / z15:${result.z15Count}枚 / z16:${result.z16Count}枚 / ` +
                        `z17:${result.z17Count}枚 / z18:${result.z18Count}枚`
                    );
                } else if (result.error === 'キャンセル') {
                    // 片方だけ保存済みの状態は分かりにくいため、その旨を知らせる
                    if (result.savedFilenames && result.savedFilenames.length > 0) {
                        this.showMessage(
                            `${result.savedFilenames.join('、')} のみ出力しました。残りは出力していません`,
                            'warning'
                        );
                    }
                } else {
                    this.showError(result.error);
                }
            } catch (error) {
                console.error('ファイル出力エラー:', error);
                this.showError(CONFIG.MESSAGES.DOWNLOAD_AREA_EXPORT_ERROR);
            }
        });

        // ポイント情報フィールドの変更イベント
        ['locationField', 'categoryField'].forEach(fieldId => {
            document.getElementById(fieldId).addEventListener('change', () => {
                this.pointManager.updateSelectedPointInfo();
            });
        });
        
        // ポイントIDフィールドの特別処理（バリデーション付き）
        const pointIdField = document.getElementById('pointIdField');
        
        // ポイントIDのblurイベント（フォーカスアウト時の処理）
        pointIdField.addEventListener('blur', (e) => {
            const originalValue = e.target.value;
            const formattedValue = DataUtils.formatPointId(originalValue);
            
            if (originalValue !== formattedValue) {
                e.target.value = formattedValue;
                this.showMessage(`ポイントIDを「${formattedValue}」に修正しました`);
            }
            
            // 値が変更された場合のみ更新処理を実行
            if (originalValue !== e.target.value) {
                this.pointManager.updateSelectedPointInfo();
            }
        });
        
        // ポイントIDのchangeイベント
        pointIdField.addEventListener('change', () => {
            this.pointManager.updateSelectedPointInfo();
        });

        // ESCキーで各種モードを終了
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.pointManager.setAddingMode(false);
                this.pointManager.setMovingMode(false);
                this.resetMoveButtonColor();
                this.showMessage('操作をキャンセルしました');
            }
        });
    }

    showMessage(message, type = 'info') {
        const messageArea = document.getElementById('messageArea');
        messageArea.textContent = message;

        // タイプに応じてクラスを設定
        let className = 'message-area';
        let displayDuration = CONFIG.MESSAGE_DISPLAY_DURATION;

        switch (type) {
            case 'warning':
                className += ' message-warning';
                displayDuration = CONFIG.MESSAGE_DISPLAY_DURATION * 1.5; // 警告は少し長く表示
                break;
            case 'error':
                className += ' message-error';
                displayDuration = CONFIG.MESSAGE_DISPLAY_DURATION * 2; // エラーは更に長く表示
                break;
            default:
                className += ' message-info';
                break;
        }

        messageArea.className = className;
        messageArea.style.display = 'block';

        setTimeout(() => {
            messageArea.style.display = 'none';
        }, displayDuration);
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    // 移動ボタンの背景色をリセット
    resetMoveButtonColor() {
        const moveBtn = document.getElementById('movePointBtn');
        moveBtn.style.backgroundColor = '';
    }
}

// DOMContentLoaded後にアプリケーションを開始
document.addEventListener('DOMContentLoaded', () => {
    new PointGPSApp();
});
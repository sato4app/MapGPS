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
            this.downloadAreaManager = new DownloadAreaManager(this.mapManager, this.gpsDataManager);
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

        // クラスタ統合トグルボタン
        const clusterMergeToggleBtn = document.getElementById('clusterMergeToggleBtn');
        clusterMergeToggleBtn.addEventListener('click', () => {
            const next = !this.downloadAreaManager.isClusterMergeEnabled();
            this.downloadAreaManager.setClusterMergeEnabled(next);

            clusterMergeToggleBtn.classList.toggle('active', next);
            clusterMergeToggleBtn.setAttribute('aria-pressed', String(next));
            clusterMergeToggleBtn.textContent = next ? 'クラスタ統合解除' : 'クラスタ統合';

            this.showMessage(next ? 'クラスタ統合を適用しました' : 'クラスタ統合を解除しました');
        });

        // 動的バッファ削減トグルボタン
        const dynamicBufferToggleBtn = document.getElementById('dynamicBufferToggleBtn');
        dynamicBufferToggleBtn.addEventListener('click', () => {
            const next = !this.downloadAreaManager.isDynamicBufferEnabled();
            this.downloadAreaManager.setDynamicBufferEnabled(next);

            dynamicBufferToggleBtn.classList.toggle('active', next);
            dynamicBufferToggleBtn.setAttribute('aria-pressed', String(next));
            dynamicBufferToggleBtn.textContent = next ? '動的バッファ解除' : '動的バッファ削減';

            this.showMessage(next ? '動的バッファ削減を適用しました' : '動的バッファ削減を解除しました');
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

        exportDownloadAreaBtn.addEventListener('click', () => {
            try {
                const result = this.downloadAreaManager.exportFiles();
                if (result.success) {
                    this.showMessage(
                        `tile_buffers.geojson と tile_manifest.json を出力しました\n` +
                        `対象: ${result.pointCount}ポイント / z17:${result.z17Count}枚 / z18:${result.z18Count}枚`
                    );
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
// メインアプリケーション
import { MapManager } from './map-manager.js';
import { GPSDataManager } from './gps-data-manager.js';
import { PointManager } from './point-manager.js';
import { FileHandler } from './file-handler.js';
import { DataUtils } from './data-utils.js';
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

        // Excel出力ボタン
        const exportBtn = document.getElementById('exportBtn');

        exportBtn.addEventListener('click', async () => {
            try {
                // 標高未取得のポイントがあれば確認
                // window.confirm() は transient activation を消費して
                // 後続の showSaveFilePicker が失敗するため、カスタムダイアログを使う
                const unfetched = this.gpsDataManager.getPointsWithoutElevation();
                let shouldFetch = false;
                if (unfetched.length > 0) {
                    shouldFetch = await this.showConfirmDialog(
                        `${unfetched.length}個のポイントで標高が未取得です。取得して出力しますか？`
                    );
                }

                // 保存ダイアログを先に表示し、確定後に標高取得→書き込みを実行
                // （長時間の非同期処理後はユーザーアクティベーションが切れて保存ダイアログが出なくなるため）
                const defaultFileName = this.fileHandler.getDefaultFileName();
                const result = await this.gpsDataManager.exportToExcel(
                    defaultFileName,
                    shouldFetch ? async () => {
                        this.showMessage(`標高を取得しています... (0/${unfetched.length})`);
                        const fetchResult = await this.gpsDataManager.fetchElevationForUnfetchedPoints(
                            (current, total) => {
                                this.showMessage(`標高を取得しています... (${current}/${total})`);
                            }
                        );
                        // 選択中ポイントの標高表示を更新
                        if (this.pointManager.selectedPointId) {
                            const selectedPoint = this.gpsDataManager.getPointById(this.pointManager.selectedPointId);
                            if (selectedPoint) {
                                document.getElementById('elevationField').value = selectedPoint.elevation;
                            }
                        }
                        this.showMessage(`標高取得が完了しました（${fetchResult.success}/${fetchResult.total}件成功）`);
                    } : null
                );

                if (result.success) {
                    this.showMessage(`Excelファイルを保存しました:\n${result.filename}`);
                } else if (result.error !== 'キャンセル') {
                    this.showError(`保存エラー: ${result.error}`);
                }
            } catch (error) {
                console.error('ファイル出力エラー:', error);
                this.showError(CONFIG.MESSAGES.EXPORT_ERROR);
            }
        });

        // ポイント情報フィールドの変更イベント
        ['locationField', 'remarksField'].forEach(fieldId => {
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

    // window.confirm() の代替（transient user activation を消費しない）
    // ダイアログ内のボタンクリックで新たなアクティベーションが得られるため、
    // resolve 後に showSaveFilePicker を呼んでも保存ダイアログが開く
    showConfirmDialog(message) {
        return new Promise((resolve) => {
            const dialog = document.getElementById('confirmDialog');
            const messageEl = document.getElementById('confirmDialogMessage');
            const yesBtn = document.getElementById('confirmDialogYes');
            const noBtn = document.getElementById('confirmDialogNo');

            messageEl.textContent = message;

            const cleanup = (result) => {
                yesBtn.removeEventListener('click', onYes);
                noBtn.removeEventListener('click', onNo);
                dialog.removeEventListener('cancel', onCancel);
                if (dialog.open) {
                    dialog.close();
                }
                resolve(result);
            };
            const onYes = () => cleanup(true);
            const onNo = () => cleanup(false);
            const onCancel = (e) => {
                e.preventDefault();
                cleanup(false);
            };

            yesBtn.addEventListener('click', onYes);
            noBtn.addEventListener('click', onNo);
            dialog.addEventListener('cancel', onCancel);

            if (typeof dialog.showModal === 'function') {
                dialog.showModal();
            } else {
                // 非対応ブラウザ用フォールバック
                resolve(window.confirm(message));
            }
        });
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
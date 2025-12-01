/**
 * 統合ファイル操作を管理するクラス - 読み込み・出力機能統合
 */
import { CONFIG } from './constants.js';

export class FileHandler {
    constructor() {
        this.currentFileHandle = null;
        this.currentFileName = '';
        this.lastUsedDirectory = null;
    }

    /**
     * ファイルハンドルを設定（後でそのフォルダに保存するため）
     * @param {FileSystemFileHandle} fileHandle - ファイルハンドル
     */
    setCurrentFileHandle(fileHandle) {
        this.currentFileHandle = fileHandle;
        this.currentFileName = fileHandle.name;
    }

    /**
     * データをファイルとしてダウンロード（従来方式）
     * @param {Object} data - データオブジェクト
     * @param {string} filename - ファイル名
     */
    downloadData(data, filename) {
        try {
            const dataStr = JSON.stringify(data, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = filename.endsWith('.geojson') ? filename : filename + '.geojson';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // メモリリークを防ぐためURLを解放
            URL.revokeObjectURL(link.href);

        } catch (error) {
            throw new Error('データダウンロードエラー: ' + error.message);
        }
    }

    /**
     * ユーザーが場所を指定してデータファイルを保存
     * @param {Object} data - データオブジェクト
     * @param {string} defaultFilename - デフォルトファイル名
     * @returns {Promise<{success: boolean, filename?: string, error?: string}>} 保存結果
     */
    async saveDataWithUserChoice(data, defaultFilename) {
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });

        try {
            // File System Access APIが利用可能かチェック
            if ('showSaveFilePicker' in window) {
                let savePickerOptions = {
                    suggestedName: defaultFilename.endsWith('.geojson') ? defaultFilename : defaultFilename + '.geojson',
                    types: [{
                        description: 'Data Files',
                        accept: {
                            'application/json': ['.geojson', '.json']
                        }
                    }]
                };

                // 前回ファイルを読み込んだフォルダから開始
                if (this.currentFileHandle) {
                    try {
                        const parentDirectoryHandle = await this.currentFileHandle.getParent();
                        savePickerOptions.startIn = parentDirectoryHandle;
                        this.lastUsedDirectory = parentDirectoryHandle;
                    } catch (error) {
                        // 同じディレクトリの取得に失敗した場合
                        if (this.lastUsedDirectory) {
                            savePickerOptions.startIn = this.lastUsedDirectory;
                        }
                    }
                } else if (this.lastUsedDirectory) {
                    savePickerOptions.startIn = this.lastUsedDirectory;
                }

                const fileHandle = await window.showSaveFilePicker(savePickerOptions);
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();

                // 成功時にディレクトリを記録
                try {
                    this.lastUsedDirectory = await fileHandle.getParent();
                } catch (error) {
                    // ディレクトリ取得に失敗しても処理続行
                }

                return { success: true, filename: fileHandle.name };
            } else {
                // File System Access APIが使用できない場合は従来のダウンロード方式
                this.downloadData(data, defaultFilename);
                return { success: true, filename: defaultFilename };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, error: 'キャンセル' };
            }

            // エラー時は従来のダウンロード方式にフォールバック
            try {
                this.downloadData(data, defaultFilename);
                return { success: true, filename: defaultFilename };
            } catch (downloadError) {
                return { success: false, error: error.message };
            }
        }
    }

    // ==========================================
    // ファイル読み込み機能
    // ==========================================

    /**
     * JSONファイル読み込み
     */
    async loadJsonFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(data);
                } catch (error) {
                    reject(new Error('JSONファイルの解析に失敗しました: ' + error.message));
                }
            };

            reader.onerror = () => reject(new Error('JSONファイル読み込みエラー'));
            reader.readAsText(file);
        });
    }

    /**
     * Excelファイル読み込み
     */
    async loadExcelFile(file) {
        if (!this.isExcelFile(file)) {
            throw new Error('Excelファイル(.xlsx)を選択してください');
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // 読み込み行数を制限
                    const range = worksheet['!ref'];
                    if (range) {
                        const decoded = XLSX.utils.decode_range(range);
                        const originalRows = decoded.e.r + 1; // 1ベースの行数

                        // データ行数を制限（設定値から1を引いて0ベースインデックスに調整）
                        const maxRows = CONFIG.MAX_EXCEL_ROWS - 1;
                        if (decoded.e.r > maxRows) {
                            decoded.e.r = maxRows;
                            worksheet['!ref'] = XLSX.utils.encode_range(decoded);
                        }
                    }

                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error('Excelファイルの読み込みに失敗しました: ' + error.message));
                }
            };

            reader.onerror = () => reject(new Error('Excelファイル読み込みエラー'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * 画像ファイル読み込み
     */
    async loadImageFile(file) {
        if (!this.isPngFile(file)) {
            throw new Error('PNG形式の画像ファイルを選択してください');
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    resolve({
                        dataUrl: e.target.result,
                        image: img,
                        width: img.naturalWidth || img.width,
                        height: img.naturalHeight || img.height
                    });
                };
                img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
                img.src = e.target.result;
            };

            reader.onerror = () => reject(new Error('画像ファイル読み込みエラー'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * ファイル種別判定
     */
    isExcelFile(file) {
        return file.name.toLowerCase().endsWith('.xlsx') &&
               file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    isPngFile(file) {
        return file && file.type.includes('png');
    }

    isJsonFile(file) {
        return file && (file.type.includes('json') || file.name.toLowerCase().endsWith('.json'));
    }

    // ==========================================
    // Excel データ検証・変換機能（統合）
    // ==========================================

    /**
     * Excelデータの検証と変換
     * @param {Array} rawData - Excel生データ
     * @returns {Array} 検証済みデータ
     */
    validateAndConvertExcelData(rawData) {
        try {
            if (!rawData || rawData.length === 0) {
                throw new Error('Excelファイルが空です。');
            }

            const requiredColumns = ['ポイントID', '名称', '緯度', '経度'];
            const optionalColumns = ['標高', '備考'];
            const allColumns = [...requiredColumns, ...optionalColumns];

            const headerRow = rawData[0];
            if (!headerRow || headerRow.length === 0) {
                throw new Error('ヘッダー行が見つかりません。');
            }

            const columnIndexMap = {};
            for (const column of allColumns) {
                const index = headerRow.indexOf(column);
                if (index !== -1) {
                    columnIndexMap[column] = index;
                } else if (requiredColumns.includes(column)) {
                    throw new Error(`必須列「${column}」が見つかりません。`);
                }
            }

            const validatedData = [];
            for (let i = 1; i < rawData.length; i++) {
                const row = rawData[i];
                if (!row || row.length === 0) continue;

                const pointData = {};
                let isValidRow = true;

                for (const column of requiredColumns) {
                    const value = row[columnIndexMap[column]];
                    if (value === undefined || value === null || value === '') {
                        isValidRow = false;
                        break;
                    }
                    pointData[column] = value;
                }

                if (!isValidRow) continue;

                for (const column of optionalColumns) {
                    if (columnIndexMap[column] !== undefined) {
                        const value = row[columnIndexMap[column]];
                        if (value !== undefined && value !== null && value !== '') {
                            pointData[column] = value;
                        }
                    }
                }

                try {
                    const lat = parseFloat(pointData['緯度']);
                    const lng = parseFloat(pointData['経度']);

                    if (isNaN(lat) || isNaN(lng)) {
                        continue;
                    }

                    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                        continue;
                    }

                    validatedData.push({
                        pointId: pointData['ポイントID'],
                        name: pointData['名称'],
                        lat: lat,
                        lng: lng,
                        elevation: pointData['標高'] || null,
                        description: pointData['備考'] || null
                    });

                } catch (error) {
                    continue;
                }
            }

            return validatedData;

        } catch (error) {
            console.error('Excel データ検証エラー', error);
            throw error;
        }
    }
}
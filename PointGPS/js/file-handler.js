import { CONFIG } from './config.js';

/**
 * ファイル操作を管理するクラス
 */
export class FileHandler {
    constructor() {
        this.currentFileHandle = null;
        this.currentFileName = '';
    }

    /**
     * Excelファイルを読み込み・解析（高速化版・行数制限付き）
     * @param {File} file - Excelファイル
     * @returns {Promise<Object>} Excel データ
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

                    // 読み込み行数を制限（SheetJSレベルで効率的に制限）
                    const range = worksheet['!ref'];
                    if (range) {
                        const decoded = XLSX.utils.decode_range(range);
                        const originalRows = decoded.e.r + 1; // 1ベースの行数

                        // データ行数を制限（設定値から1を引いて0ベースインデックスに調整）
                        const maxRows = CONFIG.MAX_EXCEL_ROWS - 1;
                        if (decoded.e.r > maxRows) {
                            decoded.e.r = maxRows;
                            worksheet['!ref'] = XLSX.utils.encode_range(decoded);
                            console.log(`Excel読み込み行数制限: ${originalRows}行 → ${CONFIG.MAX_EXCEL_ROWS}行に制限`);
                        }
                    }

                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    resolve(jsonData);
                } catch (error) {
                    reject(new Error('Excelファイルの読み込みに失敗しました: ' + error.message));
                }
            };

            reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * 現在のファイル名を取得
     * @returns {string} ファイル名
     */
    getCurrentFileName() {
        return this.currentFileName;
    }
    
    /**
     * 現在の日付をyyyymmdd形式で取得
     * @returns {string} yyyymmdd形式の日付
     */
    getTodayString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }
    
    /**
     * デフォルトファイル名を生成
     * @returns {string} ポイントGPS-yyyymmdd
     */
    getDefaultFileName() {
        return `ポイントGPS-${this.getTodayString()}`;
    }

    /**
     * Excelファイルかどうかを判定
     * @param {File} file - ファイル
     * @returns {boolean} Excelファイルかどうか
     */
    isExcelFile(file) {
        return file.name.toLowerCase().endsWith('.xlsx') && 
               file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    /**
     * ワークシートの列幅を自動調整
     * @param {Object} worksheet - SheetJSワークシート
     * @param {Array} data - データ配列
     */
    setColumnWidths(worksheet, data) {
        if (!data || data.length === 0) return;
        
        // 各列の最大文字数を計算
        const colWidths = [];
        
        data.forEach(row => {
            row.forEach((cell, colIndex) => {
                const cellValue = String(cell || '');
                const cellLength = cellValue.length;
                
                // 日本語文字は幅を広く取る（1文字を2として計算）
                const adjustedLength = cellValue.replace(/[^\x00-\xff]/g, 'xx').length;
                
                if (!colWidths[colIndex] || adjustedLength > colWidths[colIndex]) {
                    colWidths[colIndex] = adjustedLength;
                }
            });
        });
        
        // 最小幅と最大幅を設定
        const minWidth = 8;  // 最小幅
        const maxWidth = 50; // 最大幅
        
        // SheetJS用の列幅設定
        worksheet['!cols'] = colWidths.map(width => ({
            wch: Math.max(minWidth, Math.min(width + 2, maxWidth)) // +2はパディング
        }));
    }


    /**
     * Excelワークブックを作成
     * @param {Array} data - Excelデータ配列
     * @returns {Object} 作成されたワークブック
     */
    createExcelWorkbook(data) {
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        this.setColumnWidths(worksheet, data);
        
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'ポイントGPS');
        
        return workbook;
    }

    /**
     * Excelデータをファイルとしてダウンロード
     * @param {Array} data - Excelデータ配列
     * @param {string} filename - ファイル名
     */
    downloadExcel(data, filename) {
        const workbook = this.createExcelWorkbook(data);
        const finalFilename = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
        XLSX.writeFile(workbook, finalFilename);
    }

    /**
     * ユーザーが場所を指定してExcelファイルを保存
     * @param {Array} data - Excelデータ配列
     * @param {string} defaultFilename - デフォルトファイル名
     * @returns {Promise<{success: boolean, filename?: string, error?: string}>} 保存結果
     */
    async saveExcelWithUserChoice(data, defaultFilename) {
        const workbook = this.createExcelWorkbook(data);
        const excelData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelData], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        try {
            if ('showSaveFilePicker' in window) {
                let savePickerOptions = {
                    suggestedName: defaultFilename.endsWith('.xlsx') ? defaultFilename : defaultFilename + '.xlsx',
                    types: [{
                        description: 'Excel Files',
                        accept: {
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
                        }
                    }]
                };
                
                if (this.currentFileHandle) {
                    try {
                        const parentDirectoryHandle = await this.currentFileHandle.getParent();
                        savePickerOptions.startIn = parentDirectoryHandle;
                    } catch (error) {
                        // 同じディレクトリの取得に失敗、デフォルトディレクトリを使用
                    }
                }
                
                const fileHandle = await window.showSaveFilePicker(savePickerOptions);
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                return { success: true, filename: fileHandle.name };
            } else {
                this.downloadExcel(data, defaultFilename);
                return { success: true, filename: defaultFilename };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, error: 'キャンセル' };
            }
            
            try {
                this.downloadExcel(data, defaultFilename);
                return { success: true, filename: defaultFilename };
            } catch (downloadError) {
                return { success: false, error: error.message };
            }
        }
    }
}
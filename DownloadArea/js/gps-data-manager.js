import { CONFIG } from './config.js';
import { DataUtils } from './data-utils.js';
import { ElevationAPI } from './elevation-api.js';

// GPSデータ管理クラス
export class GPSDataManager {
    constructor(fileHandler = null) {
        this.gpsPoints = [];
        this.fileHandler = fileHandler;
    }

    // Excelファイルを読み込む
    async loadExcelFile(file) {
        if (!this.fileHandler) {
            throw new Error('FileHandlerが設定されていません');
        }

        try {
            const jsonData = await this.fileHandler.loadExcelFile(file);
            this.parseExcelData(jsonData);

            return this.gpsPoints.length;
        } catch (error) {
            throw error;
        }
    }
    

    // Excelデータを解析
    parseExcelData(jsonData) {
        this.gpsPoints = [];

        if (jsonData.length < 2) {
            return;
        }

        const headerRow = jsonData[0];

        // ヘッダー行から列のインデックスを特定
        const columnIndexes = this.identifyColumns(headerRow);

        // 必須項目（ポイントID、名称、緯度、経度）がすべて存在するかチェック
        const requiredColumns = ['id', 'location', 'lat', 'lng'];
        const missingColumns = requiredColumns.filter(col =>
            columnIndexes[col] === undefined || columnIndexes[col] === null
        );

        if (missingColumns.length > 0) {
            const headerMap = {
                id: CONFIG.EXCEL_HEADERS.ID,
                location: CONFIG.EXCEL_HEADERS.LOCATION,
                lat: CONFIG.EXCEL_HEADERS.LAT,
                lng: CONFIG.EXCEL_HEADERS.LNG
            };
            const missingNames = missingColumns.map(col => headerMap[col] || col);
            throw new Error(`必須項目が不足しています: ${missingNames.join(', ')}`);
        }
        
        // 2行目以降をデータとして処理
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            // 行に十分なデータがあるかチェック
            if (row.length === 0 || DataUtils.isEmptyRow(row)) {
                continue;
            }
            
            // 必須項目のデータを取得
            const idValue = DataUtils.getCellValue(row, columnIndexes.id);
            const locationValue = DataUtils.getCellValue(row, columnIndexes.location);
            const latValue = DataUtils.getCellValue(row, columnIndexes.lat);
            const lngValue = DataUtils.getCellValue(row, columnIndexes.lng);
            
            // 必須項目が空でないかチェック
            if (!idValue || !locationValue || !latValue || !lngValue) {
                continue; // 必須項目が欠けている行はスキップ
            }
            
            const lat = DataUtils.parseLatLng(latValue);
            const lng = DataUtils.parseLatLng(lngValue);
            
            // 緯度・経度が有効な数値かチェック
            if (isNaN(lat) || isNaN(lng)) {
                continue; // 無効な座標の行はスキップ
            }
            
            const categoryValue = DataUtils.getCellValue(row, columnIndexes.category);
            const point = {
                id: idValue,
                lat: lat,
                lng: lng,
                elevation: DataUtils.normalizeElevation(DataUtils.getCellValue(row, columnIndexes.elevation)),
                location: locationValue,
                category: categoryValue || CONFIG.CATEGORIES.GPS
            };

            this.gpsPoints.push(point);
        }
    }

    // ヘッダー行から各列のインデックスを特定（完全一致）
    identifyColumns(headerRow) {
        const indexes = {};
        const H = CONFIG.EXCEL_HEADERS;

        for (let i = 0; i < headerRow.length; i++) {
            const header = String(headerRow[i]).trim();

            // 完全一致判定
            if (header === H.ID) {
                indexes.id = i;
            }
            else if (header === H.LOCATION) {
                indexes.location = i;
            }
            else if (header === H.LAT) {
                indexes.lat = i;
            }
            else if (header === H.LNG) {
                indexes.lng = i;
            }
            else if (header === H.ELEVATION) {
                indexes.elevation = i;
            }
            else if (header === H.CATEGORY) {
                indexes.category = i;
            }
        }

        return indexes;
    }



    // ポイントを追加
    addPoint(lat, lng, id = null, elevation = '', location = '') {
        const finalId = id || this.generateTemporaryId();

        // 名称が未指定で仮IDを生成した場合は、IDの番号部を使って既定名称を組み立てる
        let finalLocation = location;
        if (!location && !id) {
            const { PREFIX, LOCATION_PREFIX } = CONFIG.TEMPORARY_ID;
            const numPart = finalId.startsWith(PREFIX) ? finalId.substring(PREFIX.length) : '';
            if (numPart) {
                finalLocation = `${LOCATION_PREFIX}${numPart}`;
            }
        }

        const point = {
            id: finalId,
            lat: lat,
            lng: lng,
            elevation: DataUtils.normalizeElevation(elevation),
            location: finalLocation,
            category: CONFIG.CATEGORIES.ADDED
        };

        this.gpsPoints.push(point);
        return point;
    }
    
    
    // 標高を設定または更新（blankまたは0の場合のみAPIから取得）
    async ensureValidElevation(pointId) {
        const point = this.getPointById(pointId);
        if (!point) return null;

        // API取得が必要でない場合はそのまま返す
        if (!ElevationAPI.needsElevationFromAPI(point.elevation)) {
            return point.elevation;
        }

        // APIから標高を取得
        try {
            const elevation = await ElevationAPI.fetchElevation(point.lat, point.lng);
            if (elevation !== null && elevation > 0) {
                const formattedElevation = String(elevation);
                this.updatePoint(pointId, { elevation: formattedElevation });
                return formattedElevation;
            }
        } catch (error) {
            console.warn('標高取得に失敗しました:', error);
        }

        return point.elevation;
    }
    
    // 仮IDを生成（Z#01から始まる連番）
    generateTemporaryId() {
        const { PREFIX, PAD_WIDTH } = CONFIG.TEMPORARY_ID;
        const idPattern = new RegExp(`^${PREFIX}\\d{${PAD_WIDTH}}$`);
        const existingTempIds = this.gpsPoints
            .map(p => p.id)
            .filter(id => idPattern.test(id))
            .map(id => parseInt(id.substring(PREFIX.length)))
            .sort((a, b) => a - b);

        let nextNum = 1;
        for (const num of existingTempIds) {
            if (num === nextNum) {
                nextNum++;
            } else {
                break;
            }
        }

        return `${PREFIX}${nextNum.toString().padStart(PAD_WIDTH, '0')}`;
    }

    // ポイントを更新
    updatePoint(pointId, updates) {
        const index = this.gpsPoints.findIndex(p => p.id === pointId);
        if (index !== -1) {
            // 標高データがある場合は正規化
            if ('elevation' in updates) {
                updates.elevation = DataUtils.normalizeElevation(updates.elevation);
            }
            
            Object.assign(this.gpsPoints[index], updates);
            return this.gpsPoints[index];
        }
        return null;
    }

    // ポイントを削除
    removePoint(pointId) {
        const index = this.gpsPoints.findIndex(p => p.id === pointId);
        if (index !== -1) {
            const removedPoint = this.gpsPoints.splice(index, 1)[0];
            return removedPoint;
        }
        return null;
    }

    // すべてのポイントを取得
    getAllPoints() {
        return [...this.gpsPoints];
    }

    // ポイント数を取得
    getPointCount() {
        return this.gpsPoints.length;
    }

    // IDでポイントを検索
    getPointById(id) {
        return this.gpsPoints.find(p => p.id === id);
    }

    // Excel出力用の二次元配列を生成（読み込み形式に「ポイント区分」列を追加）
    // 追加ポイントの緯度・経度は COORDINATE_DECIMAL_DIGITS 桁(=5桁)に丸める。
    // それ以外（読み込んだGPSポイント等）は元の値をそのまま保持。
    buildExcelExportData() {
        const H = CONFIG.EXCEL_HEADERS;
        const digits = CONFIG.COORDINATE_DECIMAL_DIGITS;
        const header = [H.ID, H.LOCATION, H.LAT, H.LNG, H.ELEVATION, H.CATEGORY];
        const rows = this.gpsPoints.map(p => {
            const isAdded = p.category === CONFIG.CATEGORIES.ADDED;
            const lat = isAdded ? Number(p.lat.toFixed(digits)) : p.lat;
            const lng = isAdded ? Number(p.lng.toFixed(digits)) : p.lng;
            return [
                p.id,
                p.location,
                lat,
                lng,
                p.elevation,
                p.category || ''
            ];
        });
        return [header, ...rows];
    }
}
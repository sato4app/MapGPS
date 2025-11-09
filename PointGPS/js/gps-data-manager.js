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
            const missingNames = missingColumns.map(col => {
                switch(col) {
                    case 'id': return 'ポイントID';
                    case 'location': return '名称';
                    case 'lat': return '緯度';
                    case 'lng': return '経度';
                    default: return col;
                }
            });
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
            
            const point = {
                id: idValue,
                lat: lat,
                lng: lng,
                elevation: DataUtils.normalizeElevation(DataUtils.getCellValue(row, columnIndexes.elevation)),
                location: locationValue,
                remarks: DataUtils.getCellValue(row, columnIndexes.remarks) || ''
            };

            this.gpsPoints.push(point);
        }
    }

    // ヘッダー行から各列のインデックスを特定（完全一致）
    identifyColumns(headerRow) {
        const indexes = {};
        
        for (let i = 0; i < headerRow.length; i++) {
            const header = String(headerRow[i]).trim();
            
            // 完全一致判定
            if (header === 'ポイントID') {
                indexes.id = i;
            }
            else if (header === '名称') {
                indexes.location = i;
            }
            else if (header === '緯度') {
                indexes.lat = i;
            }
            else if (header === '経度') {
                indexes.lng = i;
            }
            else if (header === '標高') {
                indexes.elevation = i;
            }
            else if (header === '備考') {
                indexes.remarks = i;
            }
        }
        
        return indexes;
    }



    // ポイントを追加
    addPoint(lat, lng, id = null, elevation = '', location = '', remarks = '') {
        const point = {
            id: id || this.generateTemporaryId(),
            lat: lat,
            lng: lng,
            elevation: DataUtils.normalizeElevation(elevation),
            location: location,
            remarks: remarks
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
    
    // 仮IDを生成（仮01から始まる連番）
    generateTemporaryId() {
        const existingTempIds = this.gpsPoints
            .map(p => p.id)
            .filter(id => id.match(/^仮\d{2}$/))
            .map(id => parseInt(id.substring(1)))
            .sort((a, b) => a - b);
        
        let nextNum = 1;
        for (const num of existingTempIds) {
            if (num === nextNum) {
                nextNum++;
            } else {
                break;
            }
        }
        
        return `仮${nextNum.toString().padStart(2, '0')}`;
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

    // Excelファイルとして出力
    async exportToExcel(filename = 'gps_points') {
        if (!this.fileHandler) {
            throw new Error('FileHandlerが設定されていません');
        }
        
        const data = [
            ['ポイントID', '名称', '緯度', '経度', '標高', '備考'] // ヘッダー
        ];

        this.gpsPoints.forEach(point => {
            // 標高を数値に変換（空文字の場合は空文字のまま）
            let elevationValue = '';
            if (point.elevation && point.elevation !== '') {
                const numValue = parseFloat(point.elevation);
                if (!isNaN(numValue)) {
                    elevationValue = numValue; // 数値として出力
                } else {
                    elevationValue = point.elevation; // 数値でない場合はそのまま
                }
            }

            data.push([
                point.id,
                point.location,
                parseFloat(point.lat.toFixed(5)), // 小数点以下5桁まで
                parseFloat(point.lng.toFixed(5)), // 小数点以下5桁まで
                elevationValue,
                point.remarks
            ]);
        });

        return await this.fileHandler.saveExcelWithUserChoice(data, filename);
    }

}
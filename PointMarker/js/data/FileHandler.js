import { Validators } from '../utils/Validators.js';
import { CoordinateUtils } from '../utils/Coordinates.js';

/**
 * ファイル操作を管理するクラス
 */
export class FileHandler {
    constructor() {
        this.currentImageFileHandle = null;
        this.currentImageFileName = '';
    }

    /**
     * 画像ファイルを選択・読み込み
     * @returns {Promise<{file: File, image: HTMLImageElement, fileName: string}>} 読み込み結果
     */
    async selectImage() {
        try {
            if ('showOpenFilePicker' in window) {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'PNG Files',
                        accept: {
                            'image/png': ['.png']
                        }
                    }],
                    multiple: false
                });
                
                this.currentImageFileHandle = fileHandle;
                const file = await fileHandle.getFile();
                
                if (!Validators.isPngFile(file)) {
                    throw new Error('PNG画像ファイルを選択してください');
                }
                
                this.currentImageFileName = file.name.replace(/\.png$/i, '');
                const image = await this.loadImageFromFile(file);
                
                return { file, image, fileName: this.currentImageFileName };
            } else {
                throw new Error('File System Access API not supported');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('ファイル選択がキャンセルされました');
            }
            throw error;
        }
    }

    /**
     * 従来のinput要素からファイルを読み込み
     * @param {File} file - ファイルオブジェクト
     * @returns {Promise<{file: File, image: HTMLImageElement, fileName: string}>} 読み込み結果
     */
    async loadFromInputFile(file) {
        if (!Validators.isPngFile(file)) {
            throw new Error('PNG画像ファイルを選択してください');
        }
        
        this.currentImageFileName = file.name.replace(/\.png$/i, '');
        const image = await this.loadImageFromFile(file);
        
        return { file, image, fileName: this.currentImageFileName };
    }

    /**
     * ファイルオブジェクトから画像を読み込み
     * @param {File} file - ファイルオブジェクト
     * @returns {Promise<HTMLImageElement>} 読み込まれた画像
     */
    async loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * JSONファイルを読み込み・パース
     * @param {File} file - JSONファイル
     * @returns {Promise<Object>} パース済みJSONデータ
     */
    async loadJsonFile(file) {
        if (!Validators.isJsonFile(file)) {
            throw new Error('JSONファイルを選択してください');
        }
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const jsonData = JSON.parse(e.target.result);
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error('JSONファイルの形式が正しくありません'));
                }
            };
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsText(file);
        });
    }

    /**
     * JSONデータをファイルとしてダウンロード
     * @param {Object} data - JSON data
     * @param {string} filename - ファイル名
     */
    downloadJSON(data, filename) {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * ユーザーが場所を指定してJSONファイルを保存
     * @param {Object} data - JSON data
     * @param {string} defaultFilename - デフォルトファイル名
     * @returns {Promise<void>}
     */
    async saveJSONWithUserChoice(data, defaultFilename) {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        try {
            if ('showSaveFilePicker' in window) {
                let savePickerOptions = {
                    suggestedName: defaultFilename,
                    types: [{
                        description: 'JSON Files',
                        accept: {
                            'application/json': ['.json']
                        }
                    }]
                };
                
                if (this.currentImageFileHandle) {
                    try {
                        const parentDirectoryHandle = await this.currentImageFileHandle.getParent();
                        savePickerOptions.startIn = parentDirectoryHandle;
                    } catch (error) {
                        console.log('同じディレクトリの取得に失敗、デフォルトディレクトリを使用');
                    }
                }
                
                const fileHandle = await window.showSaveFilePicker(savePickerOptions);
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                console.log(`JSONファイルが保存されました: ${fileHandle.name}`);
                return true;
            } else {
                this.downloadJSON(data, defaultFilename);
                return true;
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('ファイル保存がキャンセルされました');
                return false;
            }
            
            console.error('ファイル保存エラー:', error);
            this.downloadJSON(data, defaultFilename);
            return true;
        }
    }

    /**
     * 現在の画像ファイル名を取得
     * @returns {string} ファイル名
     */
    getCurrentImageFileName() {
        return this.currentImageFileName;
    }

    /**
     * ポイントデータをJSONエクスポート
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {string} imageFileName - 画像ファイル名
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @param {number} imageWidth - 元画像幅
     * @param {number} imageHeight - 元画像高さ
     * @param {string} filename - 出力ファイル名
     * @returns {Promise<void>}
     */
    async exportPointData(pointManager, imageFileName, canvasWidth, canvasHeight, imageWidth, imageHeight, filename) {
        const points = pointManager.getPoints();
        const jsonData = {
            totalPoints: points.length,
            imageReference: imageFileName,
            imageInfo: {
                width: imageWidth,
                height: imageHeight
            },
            points: points.map((point, index) => {
                const imageCoords = CoordinateUtils.canvasToImage(
                    point.x, point.y,
                    canvasWidth, canvasHeight,
                    imageWidth, imageHeight
                );
                
                return {
                    index: index + 1,
                    id: point.id,
                    imageX: Math.round(imageCoords.x),
                    imageY: Math.round(imageCoords.y),
                    isMarker: false
                };
            }),
            exportedAt: new Date().toISOString()
        };
        await this.saveJSONWithUserChoice(jsonData, filename);
    }

    /**
     * ルートデータをJSONエクスポート
     * @param {Object} routeManager - RouteManagerインスタンス
     * @param {string} imageFileName - 画像ファイル名
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @param {number} imageWidth - 元画像幅
     * @param {number} imageHeight - 元画像高さ
     * @param {string} filename - 出力ファイル名
     * @returns {Promise<void>}
     */
    async exportRouteData(routeManager, imageFileName, canvasWidth, canvasHeight, imageWidth, imageHeight, filename) {
        const routePoints = routeManager.getRoutePoints();
        const startEndPoints = routeManager.getStartEndPoints();
        
        const jsonData = {
            routeInfo: {
                startPoint: startEndPoints.start || '',
                endPoint: startEndPoints.end || '',
                waypointCount: routePoints.length
            },
            imageReference: imageFileName,
            imageInfo: {
                width: imageWidth,
                height: imageHeight
            },
            points: routePoints.map((point, index) => {
                const imageCoords = CoordinateUtils.canvasToImage(
                    point.x, point.y,
                    canvasWidth, canvasHeight,
                    imageWidth, imageHeight
                );
                
                return {
                    type: 'waypoint',
                    index: index + 1,
                    imageX: Math.round(imageCoords.x),
                    imageY: Math.round(imageCoords.y)
                };
            }),
            exportedAt: new Date().toISOString()
        };
        return await this.saveJSONWithUserChoice(jsonData, filename);
    }

    /**
     * スポットデータをJSONエクスポート
     * @param {Object} spotManager - SpotManagerインスタンス
     * @param {string} imageFileName - 画像ファイル名
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @param {number} imageWidth - 元画像幅
     * @param {number} imageHeight - 元画像高さ
     * @param {string} filename - 出力ファイル名
     * @returns {Promise<void>}
     */
    async exportSpotData(spotManager, imageFileName, canvasWidth, canvasHeight, imageWidth, imageHeight, filename) {
        const spots = spotManager.getSpots();
        const validSpots = spots.filter(spot => spot.name && spot.name.trim() !== '');
        
        const jsonData = {
            totalSpots: validSpots.length,
            imageReference: imageFileName,
            imageInfo: {
                width: imageWidth,
                height: imageHeight
            },
            spots: validSpots.map((spot, index) => {
                const imageCoords = CoordinateUtils.canvasToImage(
                    spot.x, spot.y,
                    canvasWidth, canvasHeight,
                    imageWidth, imageHeight
                );
                
                return {
                    index: index + 1,
                    name: spot.name.trim(),
                    imageX: Math.round(imageCoords.x),
                    imageY: Math.round(imageCoords.y)
                };
            }),
            exportedAt: new Date().toISOString()
        };
        await this.saveJSONWithUserChoice(jsonData, filename);
    }

    /**
     * ポイントデータをJSONインポート
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {File} file - JSONファイル
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @param {number} imageWidth - 元画像幅
     * @param {number} imageHeight - 元画像高さ
     * @returns {Promise<void>}
     */
    async importPointData(pointManager, file, canvasWidth, canvasHeight, imageWidth, imageHeight) {
        const jsonData = await this.loadJsonFile(file);
        
        if (!Validators.isValidPointData(jsonData)) {
            throw new Error('JSONファイルにポイントデータが見つかりません');
        }

        pointManager.clearPoints();
        
        jsonData.points.forEach(pointData => {
            const canvasCoords = CoordinateUtils.imageToCanvas(
                pointData.imageX, pointData.imageY,
                canvasWidth, canvasHeight,
                imageWidth, imageHeight
            );
            
            pointManager.addPoint(canvasCoords.x, canvasCoords.y, pointData.id);
        });
    }

    /**
     * ルートデータをJSONインポート
     * @param {Object} routeManager - RouteManagerインスタンス
     * @param {File} file - JSONファイル
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @param {number} imageWidth - 元画像幅
     * @param {number} imageHeight - 元画像高さ
     * @returns {Promise<void>}
     */
    async importRouteData(routeManager, file, canvasWidth, canvasHeight, imageWidth, imageHeight) {
        const jsonData = await this.loadJsonFile(file);
        
        if (!Validators.isValidRouteData(jsonData)) {
            throw new Error('ルートJSONファイルの形式が正しくありません');
        }

        routeManager.clearRoute();
        routeManager.setStartPoint(jsonData.routeInfo.startPoint || '');
        routeManager.setEndPoint(jsonData.routeInfo.endPoint || '');
        
        jsonData.points.forEach(pointData => {
            if (pointData.type === 'waypoint' && 
                typeof pointData.imageX === 'number' && 
                typeof pointData.imageY === 'number') {
                    
                const canvasCoords = CoordinateUtils.imageToCanvas(
                    pointData.imageX, pointData.imageY,
                    canvasWidth, canvasHeight,
                    imageWidth, imageHeight
                );
                
                routeManager.addRoutePoint(canvasCoords.x, canvasCoords.y);
            }
        });
    }

    /**
     * スポットデータをJSONインポート
     * @param {Object} spotManager - SpotManagerインスタンス
     * @param {File} file - JSONファイル
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @param {number} imageWidth - 元画像幅
     * @param {number} imageHeight - 元画像高さ
     * @returns {Promise<void>}
     */
    async importSpotData(spotManager, file, canvasWidth, canvasHeight, imageWidth, imageHeight) {
        const jsonData = await this.loadJsonFile(file);
        
        if (!Validators.isValidSpotData(jsonData)) {
            throw new Error('JSONファイルにスポットデータが見つかりません');
        }

        spotManager.clearSpots();
        
        // spots または points プロパティどちらでも対応
        const spotsData = jsonData.spots || jsonData.points || [];
        spotsData.forEach(spotData => {
            const canvasCoords = CoordinateUtils.imageToCanvas(
                spotData.imageX, spotData.imageY,
                canvasWidth, canvasHeight,
                imageWidth, imageHeight
            );
            
            spotManager.addSpot(canvasCoords.x, canvasCoords.y, spotData.name);
        });
    }
}
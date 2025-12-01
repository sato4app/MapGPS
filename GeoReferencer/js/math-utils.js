// 統合された数学・座標変換ユーティリティモジュール
// 座標変換、行列計算、アフィン変換、マーカー作成を統一管理
import { Logger } from './utils.js';

export class MathUtils {
    constructor() {
        this.logger = new Logger('MathUtils');
        this.EARTH_RADIUS = 6378137; // 地球の半径（メートル）
        this.WEB_MERCATOR_MAX = 20037508.34; // Web Mercator最大値
    }

    // ==========================================
    // 座標変換関数
    // ==========================================

    // 経度をWeb Mercator X座標に変換
    lonToWebMercatorX(lon) {
        return lon * this.WEB_MERCATOR_MAX / 180;
    }

    // 緯度をWeb Mercator Y座標に変換
    latToWebMercatorY(lat) {
        const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
        return y * this.WEB_MERCATOR_MAX / 180;
    }

    // Web Mercator X座標を経度に変換
    webMercatorXToLon(x) {
        return x * 180 / this.WEB_MERCATOR_MAX;
    }

    // Web Mercator Y座標を緯度に変換
    webMercatorYToLat(y) {
        const lat = y * 180 / this.WEB_MERCATOR_MAX;
        return 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    }

    // メートル/ピクセル変換（Mercator投影補正）
    calculateMetersPerPixel(centerLat, zoomLevel) {
        return 156543.03392 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, zoomLevel);
    }

    // GPS座標間の距離計算（Leaflet.mapのdistanceメソッドと同等）
    calculateGpsDistance(lat1, lng1, lat2, lng2) {
        const R = this.EARTH_RADIUS;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // 画像境界から画像座標をGPS座標に変換
    convertImageCoordsToGps(imageX, imageY, imageBounds, imageWidth, imageHeight) {
        try {
            if (!imageBounds || !imageWidth || !imageHeight) {
                this.logger.warn('画像境界または画像サイズが不正です');
                return null;
            }

            const southWest = imageBounds.getSouthWest();
            const northEast = imageBounds.getNorthEast();

            const xRatio = imageX / imageWidth;
            const yRatio = imageY / imageHeight;

            const lng = southWest.lng + (northEast.lng - southWest.lng) * xRatio;
            const lat = northEast.lat - (northEast.lat - southWest.lat) * yRatio;

            return [lat, lng];

        } catch (error) {
            this.logger.error('画像座標→GPS座標変換エラー', error);
            return null;
        }
    }

    // GPS座標を画像座標に変換（convertImageCoordsToGpsの逆変換）
    convertGpsToImageCoords(lat, lng, imageBounds, imageWidth, imageHeight) {
        try {
            if (!imageBounds || !imageWidth || !imageHeight) {
                this.logger.warn('画像境界または画像サイズが不正です');
                return null;
            }

            const southWest = imageBounds.getSouthWest();
            const northEast = imageBounds.getNorthEast();

            // GPS座標から画像座標への逆変換
            const xRatio = (lng - southWest.lng) / (northEast.lng - southWest.lng);
            const yRatio = (northEast.lat - lat) / (northEast.lat - southWest.lat);

            const imageX = xRatio * imageWidth;
            const imageY = yRatio * imageHeight;

            return [imageX, imageY];

        } catch (error) {
            this.logger.error('GPS座標→画像座標変換エラー', error);
            return null;
        }
    }

    // アフィン変換で画像座標をGPS座標に変換
    applyAffineTransform(imageX, imageY, transformation) {
        try {
            if (!transformation || !transformation.transformation) {
                this.logger.error('変換パラメータが不正です');
                return null;
            }

            const trans = transformation.transformation;

            // アフィン変換でWeb Mercator座標に変換
            const webMercatorX = trans.a * imageX + trans.b * imageY + trans.c;
            const webMercatorY = trans.d * imageX + trans.e * imageY + trans.f;

            this.logger.info(`アフィン変換: img(${imageX},${imageY}) → webMerc(${webMercatorX},${webMercatorY})`);
            this.logger.info(`変換係数: a=${trans.a}, b=${trans.b}, c=${trans.c}, d=${trans.d}, e=${trans.e}, f=${trans.f}`);

            // Web MercatorからGPS座標に変換
            const lat = this.webMercatorYToLat(webMercatorY);
            const lng = this.webMercatorXToLon(webMercatorX);

            this.logger.info(`WebMerc→GPS: (${webMercatorX},${webMercatorY}) → (${lat},${lng})`);

            return [lat, lng];

        } catch (error) {
            this.logger.error('アフィン変換エラー', error);
            return null;
        }
    }

    // ==========================================
    // 行列計算関数
    // ==========================================

    // 行列の転置
    transpose(matrix) {
        if (!matrix || !matrix.length || !matrix[0]) {
            this.logger.error('不正な行列です');
            return null;
        }
        return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
    }

    // 行列の掛け算
    multiply(a, b) {
        if (!a || !b || !a.length || !b.length || a[0].length !== b.length) {
            this.logger.error('行列の次元が不適切です');
            return null;
        }

        const result = new Array(a.length).fill(0).map(() => new Array(b[0].length).fill(0));
        for (let i = 0; i < a.length; i++) {
            for (let j = 0; j < b[0].length; j++) {
                for (let k = 0; k < b.length; k++) {
                    result[i][j] += a[i][k] * b[k][j];
                }
            }
        }
        return result;
    }

    // 行列とベクトルの掛け算
    multiplyVector(matrix, vector) {
        if (!matrix || !vector || matrix[0].length !== vector.length) {
            this.logger.error('行列とベクトルの次元が不適切です');
            return null;
        }
        return matrix.map(row => row.reduce((sum, val, i) => sum + val * vector[i], 0));
    }

    // ガウス・ジョーダン法で連立方程式を解く
    gaussJordan(A, B) {
        try {
            if (!A || !B || A.length !== B.length) {
                this.logger.error('係数行列と定数ベクトルの次元が不一致です');
                return null;
            }

            const n = A.length;
            // 拡大係数行列を作成
            const augmented = A.map((row, i) => [...row, B[i]]);

            // 前進消去
            for (let i = 0; i < n; i++) {
                // ピボット選択（部分ピボット法）
                let maxRow = i;
                for (let k = i + 1; k < n; k++) {
                    if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                        maxRow = k;
                    }
                }
                
                // 行の交換
                if (maxRow !== i) {
                    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
                }

                // 対角要素が0の場合は特異行列
                if (Math.abs(augmented[i][i]) < 1e-10) {
                    this.logger.warn('特異行列のため解けません');
                    return null;
                }

                // 正規化（対角要素を1にする）
                const pivot = augmented[i][i];
                for (let j = i; j <= n; j++) {
                    augmented[i][j] /= pivot;
                }

                // 他の行を消去
                for (let k = 0; k < n; k++) {
                    if (k !== i) {
                        const factor = augmented[k][i];
                        for (let j = i; j <= n; j++) {
                            augmented[k][j] -= factor * augmented[i][j];
                        }
                    }
                }
            }

            // 解を取り出す
            return augmented.map(row => row[n]);

        } catch (error) {
            this.logger.error('ガウス・ジョーダン法エラー', error);
            return null;
        }
    }

    // ==========================================
    // マーカー作成機能（統合）
    // ==========================================

    // カスタムマーカー作成（coordinate-display.jsから統合）
    createCustomMarker(latLng, markerType, mapCore) {
        switch (markerType) {
            case 'pointJSON':
            case 'georeference-point':
                return L.circleMarker(latLng, {
                    radius: 6,
                    color: '#ff0000',
                    fillColor: '#ff0000',
                    fillOpacity: 1,
                    weight: 0,
                    pane: 'pointJsonMarkers'
                });

            case 'wayPoint':
                const diamondIcon = L.divIcon({
                    className: 'diamond-marker',
                    html: '<div style="width: 8px; height: 8px; background-color: #ffa500; transform: rotate(45deg);"></div>',
                    iconSize: [8, 8],
                    iconAnchor: [4, 4]
                });
                return L.marker(latLng, {
                    icon: diamondIcon,
                    pane: 'wayPointMarkers'
                });

            case 'spot':
                const squareIcon = L.divIcon({
                    className: 'square-marker',
                    html: '<div style="width: 12px; height: 12px; background-color: #0000ff;"></div>',
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });
                return L.marker(latLng, {
                    icon: squareIcon,
                    pane: 'spotMarkers'
                });

            case 'gps-point':
                const greenCircleIcon = L.divIcon({
                    className: 'gps-green-circle-marker',
                    html: '<div style="width: 16px; height: 16px; background-color: #008000; border-radius: 50%;"></div>',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });
                return L.marker(latLng, {
                    icon: greenCircleIcon,
                    pane: 'gpsMarkers'
                });

            default:
                return L.circleMarker(latLng, {
                    radius: 6,
                    color: '#ff0000',
                    fillColor: '#ff0000',
                    fillOpacity: 1,
                    weight: 0,
                    pane: 'pointJsonMarkers'
                });
        }
    }

    // 画像座標をLatLng座標に変換（境界ベース）
    convertImageToLatLngFromBounds(imageX, imageY, imageBounds, imageWidth, imageHeight, fallbackCenter = null) {
        try {
            if (!imageBounds || !imageWidth || !imageHeight) {
                if (fallbackCenter) {
                    const normalizedX = (imageX - 500) / 1000;
                    const normalizedY = (imageY - 500) / 1000;
                    const lat = fallbackCenter[0] + normalizedY * 0.01;
                    const lng = fallbackCenter[1] + normalizedX * 0.01;
                    return [lat, lng];
                }
                this.logger.warn('画像境界または画像サイズが不正です');
                return null;
            }

            const result = this.convertImageCoordsToGps(imageX, imageY, imageBounds, imageWidth, imageHeight);
            return result;

        } catch (error) {
            this.logger.error('画像座標→GPS座標変換エラー（境界ベース）', error);
            return null;
        }
    }

    // ==========================================
    // アフィン変換関数
    // ==========================================

    // 最小二乗法でアフィン変換パラメータを計算
    calculateAffineTransformation(controlPoints) {
        try {
            const n = controlPoints.length;
            
            // 連立方程式の係数行列を構築
            // アフィン変換: X = a*x + b*y + c, Y = d*x + e*y + f
            const A = new Array(2 * n).fill(0).map(() => new Array(6).fill(0));
            const B = new Array(2 * n).fill(0);

            for (let i = 0; i < n; i++) {
                const imageX = controlPoints[i].pointJson.imageX;
                const imageY = controlPoints[i].pointJson.imageY;
                const gpsX = this.lonToWebMercatorX(controlPoints[i].gpsPoint.lng);
                const gpsY = this.latToWebMercatorY(controlPoints[i].gpsPoint.lat);

                // X座標の方程式
                A[i * 2][0] = imageX;     // a
                A[i * 2][1] = imageY;     // b  
                A[i * 2][2] = 1;          // c
                A[i * 2][3] = 0;
                A[i * 2][4] = 0;
                A[i * 2][5] = 0;
                B[i * 2] = gpsX;

                // Y座標の方程式
                A[i * 2 + 1][0] = 0;
                A[i * 2 + 1][1] = 0;
                A[i * 2 + 1][2] = 0;
                A[i * 2 + 1][3] = imageX;  // d
                A[i * 2 + 1][4] = imageY;  // e
                A[i * 2 + 1][5] = 1;       // f
                B[i * 2 + 1] = gpsY;
            }

            // 正規方程式 (A^T * A) * x = A^T * B を解く
            const At = this.transpose(A);
            const AtA = this.multiply(At, A);
            const AtB = this.multiplyVector(At, B);
            
            // ガウス・ジョーダン法で連立方程式を解く
            const params = this.gaussJordan(AtA, AtB);
            
            if (!params) {
                return null;
            }

            return {
                a: params[0], b: params[1], c: params[2],
                d: params[3], e: params[4], f: params[5]
            };

        } catch (error) {
            this.logger.error('アフィン変換パラメータ計算エラー', error);
            return null;
        }
    }

    // 変換精度を計算
    calculateTransformationAccuracy(controlPoints, transformation) {
        try {
            const errors = [];
            
            for (const point of controlPoints) {
                const imageX = point.pointJson.imageX;
                const imageY = point.pointJson.imageY;
                
                // 変換後座標を計算
                const transformedX = transformation.a * imageX + transformation.b * imageY + transformation.c;
                const transformedY = transformation.d * imageX + transformation.e * imageY + transformation.f;
                
                // 実際のGPS座標（Web Mercator）
                const actualX = this.lonToWebMercatorX(point.gpsPoint.lng);
                const actualY = this.latToWebMercatorY(point.gpsPoint.lat);
                
                // 誤差計算（メートル単位）
                const errorDistance = Math.sqrt(
                    Math.pow(transformedX - actualX, 2) + 
                    Math.pow(transformedY - actualY, 2)
                );
                
                errors.push(errorDistance);
            }
            
            const meanError = errors.reduce((sum, err) => sum + err, 0) / errors.length;
            const maxError = Math.max(...errors);
            const minError = Math.min(...errors);
            
            return {
                meanError,
                maxError,
                minError,
                errors
            };
            
        } catch (error) {
            this.logger.error('精度計算エラー', error);
            return { meanError: 0, maxError: 0, minError: 0, errors: [] };
        }
    }
}

// シングルトンインスタンスをエクスポート
export const mathUtils = new MathUtils();
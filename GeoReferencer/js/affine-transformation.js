// アフィン変換計算専用モジュール
import { Logger } from './utils.js';
import { mathUtils } from './math-utils.js';

export class AffineTransformation {
    constructor() {
        this.logger = new Logger('AffineTransformation');
    }

    /**
     * 精密アフィン変換パラメータ計算
     * @param {Array} controlPoints - 制御点配列
     * @returns {Object|null} 変換結果
     */
    calculatePreciseTransformation(controlPoints) {
        try {
            if (controlPoints.length < 3) {
                this.logger.error('精密アフィン変換には最低3つのポイントが必要です');
                return null;
            }

            // 最小二乗法によるアフィン変換パラメータ計算
            const transformation = mathUtils.calculateAffineTransformation(controlPoints);

            if (!transformation) {
                this.logger.error('精密変換計算に失敗');
                return null;
            }

            // 変換精度を計算
            const accuracy = mathUtils.calculateTransformationAccuracy(controlPoints, transformation);

            const result = {
                type: 'precise',
                transformation: transformation,
                accuracy: accuracy,
                controlPoints: controlPoints,
                usedPoints: controlPoints.length
            };

            return result;

        } catch (error) {
            this.logger.error('精密アフィン変換計算エラー', error);
            return null;
        }
    }

    /**
     * 画像座標をGPS座標に変換（アフィン変換使用）
     * @param {number} imageX
     * @param {number} imageY
     * @param {Object} transformation
     * @returns {Array|null} [lat, lng]
     */
    transformImageCoordsToGps(imageX, imageY, transformation) {
        try {
            if (transformation.type === 'precise') {
                return mathUtils.applyAffineTransform(imageX, imageY, transformation);
            } else {
                this.logger.error('精密版以外の変換はサポートされていません');
                return null;
            }

        } catch (error) {
            this.logger.error('座標変換エラー', error);
            return null;
        }
    }

    /**
     * アフィン変換からスケールを計算
     * @param {Object} transformation
     * @param {Object} mapCore
     * @returns {number} スケール値
     */
    calculateScaleFromTransformation(transformation, mapCore) {
        try {
            const t = transformation.transformation;

            // アフィン変換行列の変形スケールを計算
            const scaleX = Math.sqrt(t.a * t.a + t.d * t.d);
            const scaleY = Math.sqrt(t.b * t.b + t.e * t.e);
            const averageScale = (scaleX + scaleY) / 2;

            // 制御点から実際のスケールを計算
            if (transformation.controlPoints && transformation.controlPoints.length >= 2) {
                const point1 = transformation.controlPoints[0];
                const point2 = transformation.controlPoints[1];

                const imageDistance = Math.sqrt(
                    Math.pow(point2.pointJson.imageX - point1.pointJson.imageX, 2) +
                    Math.pow(point2.pointJson.imageY - point1.pointJson.imageY, 2)
                );

                const gpsDistance = mathUtils.calculateGpsDistance(
                    point1.gpsPoint.lat, point1.gpsPoint.lng,
                    point2.gpsPoint.lat, point2.gpsPoint.lng
                );

                if (imageDistance > 0 && gpsDistance > 0) {
                    const actualScale = gpsDistance / imageDistance;
                    const centerPos = mapCore.getMap().getCenter();
                    const currentZoom = mapCore.getMap().getZoom();
                    const metersPerPixelAtCenter = mathUtils.calculateMetersPerPixel(centerPos.lat, currentZoom);
                    const leafletScale = actualScale / metersPerPixelAtCenter;

                    this.logger.info(`スケール計算: 実際スケール=${actualScale.toFixed(6)}m/px, Leafletスケール=${leafletScale.toFixed(6)}`);
                    return leafletScale;
                }
            }

            // フォールバック: アフィン変換行列から計算
            const centerPos = mapCore.getMap().getCenter();
            const currentZoom = mapCore.getMap().getZoom();
            const metersPerPixelAtCenter = mathUtils.calculateMetersPerPixel(centerPos.lat, currentZoom);
            const leafletScale = averageScale / metersPerPixelAtCenter;

            this.logger.info(`フォールバックスケール計算: Leafletスケール=${leafletScale.toFixed(6)}`);
            return leafletScale;

        } catch (error) {
            this.logger.error('スケール計算エラー', error);
            return 0.8; // デフォルト値
        }
    }
}
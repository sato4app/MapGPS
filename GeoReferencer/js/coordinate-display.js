// 画像座標表示・変換機能を管理するモジュール
import { Logger, errorHandler } from './utils.js';
import { mathUtils } from './math-utils.js';

export class CoordinateDisplay {
    constructor(mapCore, imageOverlay) {
        this.logger = new Logger('CoordinateDisplay');
        this.mapCore = mapCore;
        this.imageOverlay = imageOverlay;
    }

    async displayImageCoordinates(data, type, imageCoordinateMarkers) {
        try {
            if (!this.imageOverlay || !this.mapCore || !this.mapCore.getMap()) {
                throw new Error('地図または画像オーバーレイが初期化されていません。');
            }
            const coordinates = this.extractImageCoordinates(data);

            coordinates.forEach((coord, index) => {
                if (coord.imageX !== undefined && coord.imageY !== undefined) {
                    const latLng = this.convertImageToLatLng(coord.imageX, coord.imageY);
                    const markerType = this.determineMarkerType(coord, type);
                    const marker = mathUtils.createCustomMarker(latLng, markerType, this.mapCore).addTo(this.mapCore.getMap());
                    
                    const popupContent = this.createCoordinatePopupContent(coord, type, index, latLng);
                    marker.bindPopup(popupContent);
                    
                    if (!imageCoordinateMarkers) {
                        imageCoordinateMarkers = [];
                    }
                    
                    imageCoordinateMarkers.push({
                        marker: marker,
                        type: 'georeference-point',
                        data: coord
                    });
                }
            });
            return imageCoordinateMarkers;
            
        } catch (error) {
            this.logger.error('画像座標表示エラー', error);
            throw error;
        }
    }

    extractImageCoordinates(data) {
        const coordinates = [];
        
        try {
            if (Array.isArray(data)) {
                data.forEach(item => {
                    if (item.imageX !== undefined && item.imageY !== undefined) {
                        coordinates.push({
                            imageX: item.imageX,
                            imageY: item.imageY,
                            name: item.name || item.id,
                            description: item.description || '',
                            type: item.type,
                            id: item.id,
                            index: item.index
                        });
                    }
                });
            } else if (data && typeof data === 'object') {
                if (data.points && Array.isArray(data.points)) {
                    data.points.forEach(point => {
                        if (point.imageX !== undefined && point.imageY !== undefined) {
                            coordinates.push({
                                imageX: point.imageX,
                                imageY: point.imageY,
                                name: point.name || point.id,
                                description: point.description || '',
                                type: point.type,
                                id: point.id,
                                index: point.index
                            });
                        }
                    });
                }
                
                if (data.routes && Array.isArray(data.routes)) {
                    data.routes.forEach(route => {
                        if (route.points && Array.isArray(route.points)) {
                            route.points.forEach(point => {
                                if (point.imageX !== undefined && point.imageY !== undefined) {
                                    coordinates.push({
                                        imageX: point.imageX,
                                        imageY: point.imageY,
                                        name: point.name || `${route.name || 'Route'} Point`,
                                        description: point.description || '',
                                        type: point.type,
                                        id: point.id,
                                        index: point.index
                                    });
                                }
                            });
                        }
                    });
                }
            }
        } catch (error) {
            this.logger.error('座標抽出エラー', error);
        }
        
        return coordinates;
    }

    convertImageToLatLng(imageX, imageY) {
        if (!this.imageOverlay || !this.imageOverlay.imageOverlay) {
            const center = this.mapCore.getInitialCenter();
            const normalizedX = (imageX - 500) / 1000;
            const normalizedY = (imageY - 500) / 1000;
            const lat = center[0] + normalizedY * 0.01;
            const lng = center[1] + normalizedX * 0.01;
            return [lat, lng];
        }
        
        const imageBounds = this.imageOverlay.imageOverlay.getBounds();
        const imageInfo = this.imageOverlay.getCurrentImageInfo();
        
        if (!imageBounds || !imageInfo.isLoaded) {
            const center = this.mapCore.getInitialCenter();
            const normalizedX = (imageX - 500) / 1000;
            const normalizedY = (imageY - 500) / 1000;
            const lat = center[0] + normalizedY * 0.01;
            const lng = center[1] + normalizedX * 0.01;
            return [lat, lng];
        }
        
        const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
        const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;
        
        if (!imageWidth || !imageHeight) {
            const center = this.mapCore.getInitialCenter();
            const normalizedX = (imageX - 500) / 1000;
            const normalizedY = (imageY - 500) / 1000;
            const lat = center[0] + normalizedY * 0.01;
            const lng = center[1] + normalizedX * 0.01;
            return [lat, lng];
        }
        
        return mathUtils.convertImageCoordsToGps(imageX, imageY, imageBounds, imageWidth, imageHeight);
    }

    determineMarkerType(coord, type) {
        if (coord.type === 'waypoint') {
            return 'wayPoint';
        } else if (coord.type === 'spot' && coord.name) {
            return 'spot';
        } else if (!coord.type && coord.id) {
            return 'pointJSON';
        }
        return 'pointJSON';
    }

    createCoordinatePopupContent(coord, type, index, latLng) {
        const pointId = coord.name || coord.id || `${type} ${index + 1}`;
        return pointId;
    }

    static createGpsPopupContent(point) {
        const location = point.location || '';
        const displayName = location || point.name || point.pointId || '';
        return `${point.pointId}<br>${displayName}`;
    }

    static createRouteWaypointPopupContent(point, routeName, label, pointIndex) {
        return `中間点-${pointIndex + 1}`;
    }

    static createSpotPopupContent(item, latLng) {
        return item.name || item.spotId;
    }

    // createCustomMarkerはmathUtilsに統合されました

    clearImageCoordinateMarkers(imageCoordinateMarkers, markerType = 'all') {
        if (imageCoordinateMarkers && imageCoordinateMarkers.length > 0) {
            const markersToRemove = imageCoordinateMarkers.filter(markerInfo => {
                if (markerType === 'all') return true;
                return markerInfo.type === markerType;
            });

            markersToRemove.forEach(markerInfo => {
                if (this.mapCore && this.mapCore.getMap()) {
                    this.mapCore.getMap().removeLayer(markerInfo.marker);
                }
            });

            return imageCoordinateMarkers.filter(markerInfo => {
                if (markerType === 'all') return false;
                return markerInfo.type !== markerType;
            });
        }
        return [];
    }

    // 画像境界の変更に応じてマーカー位置を更新
    updateMarkersForImageBounds(imageCoordinateMarkers) {
        try {
            if (!imageCoordinateMarkers || imageCoordinateMarkers.length === 0) {
                return;
            }

            const georefMarkers = imageCoordinateMarkers.filter(markerInfo => 
                markerInfo.type === 'georeference-point'
            );


            georefMarkers.forEach((markerInfo, index) => {
                const marker = markerInfo.marker;
                const data = markerInfo.data;

                if (data && data.imageX !== undefined && data.imageY !== undefined) {
                    // 現在の画像境界に基づいて位置を再計算
                    const newLatLng = this.convertImageToLatLng(data.imageX, data.imageY);
                    const oldPos = marker.getLatLng();
                    
                    
                    marker.setLatLng(newLatLng);
                }
            });


        } catch (error) {
            this.logger.error('画像境界変更対応エラー', error);
        }
    }
}
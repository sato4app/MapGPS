import { Logger } from './utils.js';
import { mathUtils } from './math-utils.js';

export class AreaHandler {
    constructor(mapCore, imageOverlay = null) {
        this.logger = new Logger('AreaHandler');
        this.mapCore = mapCore;
        this.imageOverlay = imageOverlay;
        this.areas = [];
        this.areaPolygons = [];
        this.vertexMarkers = [];
        this.currentTransformation = null;
    }

    // Set ImageOverlay instance
    setImageOverlay(imageOverlay) {
        this.imageOverlay = imageOverlay;
    }

    // Load areas from data
    async importAreas(areas, imageOverlay) {
        try {
            if (imageOverlay) {
                this.imageOverlay = imageOverlay;
            }

            this.logger.info(`Importing areas: ${areas.length} items`);
            this.clearAreaLayers();

            this.areas = areas.map((area, index) => {
                // Ensure vertices exist
                if (!area.vertices || !Array.isArray(area.vertices)) {
                    this.logger.warn(`Area ${index} has no vertices, skipping.`);
                    return null;
                }

                // エリア名のフォールバック処理
                let areaName = area.areaName || area.name;
                if (!areaName || areaName.trim() === '') {
                    if (area.description && typeof area.description === 'string' && area.description.trim() !== '') {
                        areaName = area.description;
                    } else {
                        areaName = `エリア ${index + 1}`;
                    }
                }

                return {
                    ...area,
                    id: area.id || `area_${index}`,
                    name: areaName
                };
            }).filter(a => a !== null);

            await this.displayAreasOnMap();

        } catch (error) {
            this.logger.error('Error importing areas', error);
        }
    }

    // Display areas on map
    async displayAreasOnMap() {
        try {
            if (!this.mapCore || !this.mapCore.getMap()) {
                throw new Error('Map not initialized');
            }

            this.clearAreaLayers();

            this.areas.forEach((area, index) => {
                const latLngs = this.calculateAreaLatLngs(area);

                if (latLngs.length > 0) {
                    // エリアポリゴンを作成（濃いピンクの境界線、薄いピンクの塗りつぶし）
                    const polygon = L.polygon(latLngs, {
                        color: '#FF69B4',      // 濃いピンク（HotPink）
                        fillColor: '#FFB6C1',  // 薄いピンク（LightPink）
                        fillOpacity: 0.3,
                        weight: 2
                    }).addTo(this.mapCore.getMap());

                    // Store metadata for sync
                    polygon.__meta = {
                        origin: 'firebase', // Areas currently only come from Firebase/Image coords usually
                        vertices: area.vertices, // Store original image coordinates {x, y}
                        areaId: area.id,
                        name: area.name
                    };

                    // ポップアップにエリア名を表示（確実に表示されるようにフォールバック）
                    const displayName = area.name || area.id || `エリア ${index + 1}`;
                    polygon.bindPopup(displayName);
                    this.areaPolygons.push(polygon);

                    // 各頂点にピンクの菱形マーカーを追加
                    this.addVertexMarkers(latLngs, area);
                }
            });

            this.logger.info(`Displayed ${this.areaPolygons.length} areas on map`);

        } catch (error) {
            this.logger.error('Error displaying areas', error);
        }
    }

    // 頂点マーカーを追加
    addVertexMarkers(latLngs, area) {
        if (!this.vertexMarkers) {
            this.vertexMarkers = [];
        }

        latLngs.forEach((latLng, index) => {
            // ピンクの菱形マーカーを作成（6px）
            const vertexIcon = L.divIcon({
                className: 'area-vertex-marker',
                html: '<div class="diamond" style="width: 6px; height: 6px; background-color: #FF69B4; border: 1px solid #FF1493; transform: rotate(45deg); position: absolute; top: 50%; left: 50%; margin-top: -3px; margin-left: -3px;"></div>',
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });

            const marker = L.marker(latLng, {
                icon: vertexIcon,
                interactive: false
            }).addTo(this.mapCore.getMap());

            // メタデータを設定（画像座標も保存）
            marker.__meta = {
                areaId: area.id,
                areaName: area.name,
                vertexIndex: index,
                imageCoords: area.vertices[index] // {x, y} を保存
            };

            this.vertexMarkers.push(marker);
        });
    }

    // Calculate LatLngs for an area based on current state (Georeferenced or Image Bounds)
    calculateAreaLatLngs(area) {
        if (!area.vertices) return [];

        return area.vertices.map(v => {
            // v should be {x, y} (image coordinates)
            if (this.currentTransformation) {
                // Use Affine Transformation
                return this.transformImageCoordsToGps(v.x, v.y);
            } else {
                // Use Image Bounds (Fallback)
                return this.convertImageCoordsToGps(v.x, v.y);
            }
        }).filter(p => p !== null);
    }

    // Sync area positions (called when georeferencing updates)
    syncAreaPositions(transformation) {
        try {
            this.currentTransformation = transformation;

            if (!this.areaPolygons) return;

            // ポリゴンの位置を更新
            this.areaPolygons.forEach(polygon => {
                const meta = polygon.__meta;
                if (!meta || !meta.vertices) return;

                const newLatLngs = meta.vertices.map(v => {
                    if (this.currentTransformation) {
                        return this.transformImageCoordsToGps(v.x, v.y);
                    } else {
                        return this.convertImageCoordsToGps(v.x, v.y);
                    }
                }).filter(p => p !== null);

                if (newLatLngs.length > 0) {
                    polygon.setLatLngs(newLatLngs);
                }
            });

            // 頂点マーカーの位置も更新
            if (this.vertexMarkers && this.vertexMarkers.length > 0) {
                this.vertexMarkers.forEach(marker => {
                    const meta = marker.__meta;
                    if (!meta || !meta.imageCoords) return;

                    // 画像座標からGPS座標に変換
                    let newLatLng;
                    if (this.currentTransformation) {
                        newLatLng = this.transformImageCoordsToGps(meta.imageCoords.x, meta.imageCoords.y);
                    } else {
                        newLatLng = this.convertImageCoordsToGps(meta.imageCoords.x, meta.imageCoords.y);
                    }

                    if (newLatLng) {
                        marker.setLatLng(newLatLng);
                    }
                });
            }

            this.logger.info(`Synced ${this.areaPolygons.length} areas and ${this.vertexMarkers.length} vertex markers`);

        } catch (error) {
            this.logger.error('Error syncing area positions', error);
        }
    }

    // Helper: Convert Image Coords to GPS using Image Bounds
    convertImageCoordsToGps(imageX, imageY) {
        try {
            if (!this.imageOverlay || !this.imageOverlay.imageOverlay) {
                return null;
            }

            const imageBounds = this.imageOverlay.imageOverlay.getBounds();
            const imageWidth = this.imageOverlay.currentImage.naturalWidth || this.imageOverlay.currentImage.width;
            const imageHeight = this.imageOverlay.currentImage.naturalHeight || this.imageOverlay.currentImage.height;

            if (!imageBounds || !imageWidth || !imageHeight) return null;

            const result = mathUtils.convertImageCoordsToGps(imageX, imageY, imageBounds, imageWidth, imageHeight);
            return result ? [result[0], result[1]] : null;
        } catch (error) {
            return null;
        }
    }

    // Helper: Transform Image Coords to GPS using Affine Transformation
    transformImageCoordsToGps(imageX, imageY) {
        try {
            if (!this.currentTransformation) return null;

            // Using mathUtils (assuming it has applyAffineTransform same as in georeferencing.js usage)
            const result = mathUtils.applyAffineTransform(imageX, imageY, this.currentTransformation);
            return result;
        } catch (error) {
            return null;
        }
    }

    // Get up-to-date areas from map (including renamed areas)
    getUpToDateAreas() {
        if (!this.areaPolygons) return [];

        return this.areaPolygons.map((polygon, index) => {
            const meta = polygon.__meta || {};

            // Get name from popup if available (user might have renamed it)
            let currentName = meta.name;
            const popup = polygon.getPopup();
            if (popup) {
                const content = popup.getContent();
                if (content && typeof content === 'string') {
                    // Extract name from content if it's simple text, otherwise rely on meta
                    // Assuming simple text for now as set in displayAreasOnMap
                    currentName = content;
                }
            }

            return {
                id: meta.areaId || `area_${index}`,
                name: currentName || `Area ${index + 1}`,
                vertices: meta.vertices || [], // Function relies on original image vertices
                description: meta.description || ''
            };
        });
    }

    clearAreaLayers() {
        if (this.areaPolygons) {
            this.areaPolygons.forEach(p => {
                if (this.mapCore && this.mapCore.getMap()) {
                    this.mapCore.getMap().removeLayer(p);
                }
            });
        }
        this.areaPolygons = [];

        // 頂点マーカーもクリア
        if (this.vertexMarkers) {
            this.vertexMarkers.forEach(m => {
                if (this.mapCore && this.mapCore.getMap()) {
                    this.mapCore.getMap().removeLayer(m);
                }
            });
            this.vertexMarkers = [];
        }
    }

    // Get total number of vertices in all areas
    getVertexCount() {
        if (!this.areaPolygons) return 0;
        return this.areaPolygons.reduce((total, polygon) => {
            const meta = polygon.__meta;
            if (meta && meta.vertices && Array.isArray(meta.vertices)) {
                return total + meta.vertices.length;
            }
            return total;
        }, 0);
    }

    /**
     * エリアの全頂点を取得（標高取得用）
     * @returns {Array} 頂点配列 [{areaName, vertexIndex, lat, lng, elevation}, ...]
     */
    getAllVertices() {
        const vertices = [];

        this.areaPolygons.forEach((polygon) => {
            const meta = polygon.__meta;
            if (!meta || !meta.vertices || !Array.isArray(meta.vertices)) {
                return;
            }

            const areaName = meta.name || meta.areaId || 'Unknown';

            // 各頂点をGPS座標に変換
            meta.vertices.forEach((vertex, index) => {
                let latLng;
                if (this.currentTransformation) {
                    // アフィン変換を使用
                    latLng = this.transformImageCoordsToGps(vertex.x, vertex.y);
                } else {
                    // 画像境界を使用
                    latLng = this.convertImageCoordsToGps(vertex.x, vertex.y);
                }

                if (latLng) {
                    // latLngは[lat, lng]の配列形式
                    const lat = Array.isArray(latLng) ? latLng[0] : latLng.lat;
                    const lng = Array.isArray(latLng) ? latLng[1] : latLng.lng;

                    vertices.push({
                        areaName: areaName,
                        vertexIndex: index,
                        lat: lat,
                        lng: lng,
                        elevation: vertex.elevation || null
                    });
                }
            });
        });

        return vertices;
    }

    /**
     * エリア頂点に標高を設定
     * @param {string} areaName - エリア名
     * @param {number} vertexIndex - 頂点インデックス
     * @param {number} elevation - 標高値
     */
    setVertexElevation(areaName, vertexIndex, elevation) {
        // 対象のポリゴンを検索
        const polygon = this.areaPolygons.find(p => {
            const meta = p.__meta;
            return meta && (meta.name === areaName || meta.areaId === areaName);
        });

        if (!polygon) {
            this.logger.warn(`エリアが見つかりません: ${areaName}`);
            return;
        }

        const meta = polygon.__meta;
        if (!meta.vertices || !meta.vertices[vertexIndex]) {
            this.logger.warn(`頂点が見つかりません: area=${areaName}, index=${vertexIndex}`);
            return;
        }

        // 標高を設定
        meta.vertices[vertexIndex].elevation = elevation;
        this.logger.info(`標高設定: area=${areaName}, index=${vertexIndex}, elevation=${elevation}m`);

        // areasにも反映（loadFromFirebaseDataで読み込まれたデータ）
        const area = this.areas.find(a => a.name === areaName || a.id === areaName);
        if (area && area.vertices && area.vertices[vertexIndex]) {
            area.vertices[vertexIndex].elevation = elevation;
        }
    }
}

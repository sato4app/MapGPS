// Download領域の可視化およびタイル/GeoJSONファイル生成
// - 各ポイントを中心に半径(z=17/z=18)の円を地図に描画
// - 「Download領域の指定ファイルを出力」で tile_buffers.geojson と tile_manifest.json を出力
import { CONFIG } from './config.js';

const DA = CONFIG.DOWNLOAD_AREA;

export class DownloadAreaManager {
    constructor(mapManager, gpsDataManager) {
        this.mapManager = mapManager;
        this.gpsDataManager = gpsDataManager;
        this.bufferLayer = L.layerGroup().addTo(this.mapManager.getMap());
        // 削減モードの適用状態（UIトグルで切り替え）。初期はいずれも「適用前」。
        this.dynamicBufferEnabled = false;
        this.clusterMergeEnabled = false;
        // 「領域を表示」ボタンで切り替える円描画/タイル統計の表示フラグ。初期は非表示。
        this.areaDisplayEnabled = false;
    }

    // 領域表示のON/OFFを切り替えて再描画
    setAreaDisplayEnabled(enabled) {
        this.areaDisplayEnabled = !!enabled;
        this.updateCircles();
    }

    isAreaDisplayEnabled() {
        return this.areaDisplayEnabled;
    }

    // 動的バッファのON/OFFを切り替えて再描画・統計再計算
    setDynamicBufferEnabled(enabled) {
        this.dynamicBufferEnabled = !!enabled;
        this.updateCircles();
    }

    isDynamicBufferEnabled() {
        return this.dynamicBufferEnabled;
    }

    // クラスタ統合のON/OFFを切り替えて再描画・統計再計算
    setClusterMergeEnabled(enabled) {
        this.clusterMergeEnabled = !!enabled;
        this.updateCircles();
    }

    isClusterMergeEnabled() {
        return this.clusterMergeEnabled;
    }

    // 「Download領域の算出から除外」以外のポイントを返す
    getEligiblePoints() {
        return this.gpsDataManager.getAllPoints()
            .filter(p => p.category !== CONFIG.CATEGORIES.EXCLUDED);
    }

    // 円描画／タイル算出に使う「実効ポイント」を返す。
    // クラスタ統合が ON の場合は近接ポイントを重心の合成ポイントに置換。
    // 各実効ポイントは baseR17 / baseR18 を保持（クラスタの場合はクラスタ広がり≧基本半径）。
    getEffectivePoints() {
        const points = this.getEligiblePoints();
        if (!this.clusterMergeEnabled || points.length < 2) {
            return points.map(p => ({
                id: p.id,
                lat: p.lat,
                lng: p.lng,
                baseR17: DA.BUFFER_M_Z17,
                baseR18: DA.BUFFER_M_Z18,
                memberCount: 1
            }));
        }
        const clusters = this.computeClusters(points);
        return clusters.map((cluster, idx) => this.makeMergedPoint(cluster, idx));
    }

    // ペア距離 ≤ CLUSTER_DISTANCE_M を辺としたUnion-Findで連結成分(=クラスタ)を求める
    computeClusters(points) {
        const n = points.length;
        const parent = Array.from({ length: n }, (_, i) => i);
        const find = (x) => {
            while (parent[x] !== x) {
                parent[x] = parent[parent[x]];
                x = parent[x];
            }
            return x;
        };
        const union = (a, b) => {
            const ra = find(a), rb = find(b);
            if (ra !== rb) parent[ra] = rb;
        };

        const threshold = DA.CLUSTER_DISTANCE_M;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const d = this.haversineM(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
                if (d <= threshold) union(i, j);
            }
        }

        const groups = new Map();
        for (let i = 0; i < n; i++) {
            const r = find(i);
            if (!groups.has(r)) groups.set(r, []);
            groups.get(r).push(points[i]);
        }
        return Array.from(groups.values());
    }

    // クラスタを1つの合成ポイントに圧縮する。
    // - 中心: クラスタ重心
    // - baseR17/baseR18: max(基本半径, 重心からクラスタ各点への最大距離)
    makeMergedPoint(cluster, idx) {
        if (cluster.length === 1) {
            const p = cluster[0];
            return {
                id: p.id,
                lat: p.lat,
                lng: p.lng,
                baseR17: DA.BUFFER_M_Z17,
                baseR18: DA.BUFFER_M_Z18,
                memberCount: 1
            };
        }
        let sumLat = 0, sumLng = 0;
        for (const p of cluster) { sumLat += p.lat; sumLng += p.lng; }
        const cLat = sumLat / cluster.length;
        const cLng = sumLng / cluster.length;
        let rEnc = 0;
        for (const p of cluster) {
            const d = this.haversineM(cLat, cLng, p.lat, p.lng);
            if (d > rEnc) rEnc = d;
        }
        return {
            id: `__cluster_${idx}`,
            lat: cLat,
            lng: cLng,
            baseR17: Math.max(DA.BUFFER_M_Z17, rEnc),
            baseR18: Math.max(DA.BUFFER_M_Z18, rEnc),
            memberCount: cluster.length
        };
    }

    // 動的半径マップを返す。Map<pointId, {z17: number, z18: number}>
    // 各実効ポイントの基本半径(baseR17/baseR18)を上限とし、動的バッファON時は
    // 「他ポイントへの最近接距離 × SHRINK_FACTOR」で縮小、RADIUS_FLOOR_M を下限とする。
    computeDynamicRadii(points) {
        const map = new Map();
        if (!this.dynamicBufferEnabled || points.length < 2) {
            for (const p of points) {
                map.set(p.id, { z17: p.baseR17, z18: p.baseR18 });
            }
            return map;
        }
        for (const p of points) {
            let dMin = Infinity;
            for (const q of points) {
                if (q.id === p.id) continue;
                const d = this.haversineM(p.lat, p.lng, q.lat, q.lng);
                if (d < dMin) dMin = d;
            }
            const shrunk = dMin * DA.SHRINK_FACTOR;
            const r17 = Math.max(DA.RADIUS_FLOOR_M, Math.min(p.baseR17, shrunk));
            const r18 = Math.max(DA.RADIUS_FLOOR_M, Math.min(p.baseR18, shrunk));
            map.set(p.id, { z17: r17, z18: r18 });
        }
        return map;
    }

    // 指定ポイントの動的半径を取得（マップ未登録時は基本半径にフォールバック）
    radiiFor(p, radiiMap) {
        return radiiMap.get(p.id) || { z17: p.baseR17, z18: p.baseR18 };
    }

    // 円の表示を更新
    updateCircles() {
        this.bufferLayer.clearLayers();

        // 領域表示OFF時は円を描画せず、タイル統計もリセット表示にする
        if (!this.areaDisplayEnabled) {
            this.resetTileStatsDisplay();
            return;
        }

        const points = this.getEffectivePoints();
        const radii = this.computeDynamicRadii(points);

        for (const p of points) {
            const r = this.radiiFor(p, radii);

            // z=17 バッファ
            L.circle([p.lat, p.lng], {
                radius: r.z17,
                ...CONFIG.BUFFER_CIRCLE_Z17_STYLE
            }).addTo(this.bufferLayer);

            // z=18 バッファ
            L.circle([p.lat, p.lng], {
                radius: r.z18,
                ...CONFIG.BUFFER_CIRCLE_Z18_STYLE
            }).addTo(this.bufferLayer);
        }

        this.updateTileStatsDisplay();
    }

    // タイル統計表示欄をすべて0にリセット（領域非表示時に使用）
    resetTileStatsDisplay() {
        const setField = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        };
        setField('tileCountZ10to16', '0');
        setField('tileSizeZ10to16', '0.0');
        setField('tileCountZ17', '0');
        setField('tileSizeZ17', '0.0');
        setField('tileCountZ18', '0');
        setField('tileSizeZ18', '0.0');
        setField('tileCountTotal', '0');
        setField('tileSizeTotal', '0.0');
    }

    // ズーム別タイル統計を計算（[{ z, count, sizeMB }, ...]）
    // z=18 のみ z18 動的半径、それ以外（z=10〜17）は z17 動的半径を使用。
    calculateTileStats() {
        const points = this.getEffectivePoints();
        const radii = this.computeDynamicRadii(points);
        const stats = [];

        for (const z of DA.STAT_ZOOM_LEVELS) {
            const useZ18 = (z === DA.Z18);
            const tileSet = new Set();
            for (const p of points) {
                const r = this.radiiFor(p, radii);
                const radius = useZ18 ? r.z18 : r.z17;
                for (const [x, y] of this.tilesForPoint(p.lat, p.lng, radius, z)) {
                    tileSet.add(`${x},${y}`);
                }
            }
            const count = tileSet.size;
            const sizeMB = count * DA.AVG_TILE_KB / 1024;
            stats.push({ z, count, sizeMB });
        }

        return stats;
    }

    // 統計表示欄を更新（z=10〜16 は集約、z=17・z=18・合計）
    updateTileStatsDisplay() {
        const stats = this.calculateTileStats();
        const setField = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        };

        let lowZoomCount = 0;
        let lowZoomSize = 0;
        let totalCount = 0;
        let totalSizeMB = 0;

        for (const s of stats) {
            if (s.z === DA.Z17) {
                setField('tileCountZ17', s.count.toLocaleString());
                setField('tileSizeZ17', s.sizeMB.toFixed(1));
            } else if (s.z === DA.Z18) {
                setField('tileCountZ18', s.count.toLocaleString());
                setField('tileSizeZ18', s.sizeMB.toFixed(1));
            } else {
                // z=10〜16 集約
                lowZoomCount += s.count;
                lowZoomSize += s.sizeMB;
            }
            totalCount += s.count;
            totalSizeMB += s.sizeMB;
        }

        setField('tileCountZ10to16', lowZoomCount.toLocaleString());
        setField('tileSizeZ10to16', lowZoomSize.toFixed(1));
        setField('tileCountTotal', totalCount.toLocaleString());
        setField('tileSizeTotal', totalSizeMB.toFixed(1));
    }

    // 円のポリゴン近似（[lng, lat] の配列、最後の点で閉じる）
    // 出力GeoJSONのGPS値は小数点以下5桁に丸める。
    circlePolygon(lat, lng, radiusM, vertices = DA.CIRCLE_VERTICES) {
        const coords = [];
        const latRad = lat * Math.PI / 180;
        const round5 = (v) => Math.round(v * 1e5) / 1e5;
        for (let i = 0; i < vertices; i++) {
            const angle = (i / vertices) * 2 * Math.PI;
            const dx = radiusM * Math.cos(angle);
            const dy = radiusM * Math.sin(angle);
            const dLat = (dy / DA.EARTH_RADIUS_M) * 180 / Math.PI;
            const dLng = (dx / (DA.EARTH_RADIUS_M * Math.cos(latRad))) * 180 / Math.PI;
            coords.push([round5(lng + dLng), round5(lat + dLat)]);
        }
        coords.push(coords[0]);
        return coords;
    }

    // tile_buffers.geojson を生成
    generateTileBuffersGeoJSON() {
        const points = this.getEffectivePoints();
        const radii = this.computeDynamicRadii(points);
        const features = [];
        for (const p of points) {
            const r = this.radiiFor(p, radii);
            features.push({
                type: 'Feature',
                properties: { layer: DA.LAYER_KEY_Z17, buffer_m: r.z17 },
                geometry: {
                    type: 'Polygon',
                    coordinates: [this.circlePolygon(p.lat, p.lng, r.z17)]
                }
            });
            features.push({
                type: 'Feature',
                properties: { layer: DA.LAYER_KEY_Z18, buffer_m: r.z18 },
                geometry: {
                    type: 'Polygon',
                    coordinates: [this.circlePolygon(p.lat, p.lng, r.z18)]
                }
            });
        }
        return {
            type: 'FeatureCollection',
            metadata: {
                version: DA.MANIFEST_VERSION,
                dynamic_buffer: this.dynamicBufferEnabled,
                cluster_merge: this.clusterMergeEnabled,
                z17_layer: { buffer_m_max: DA.BUFFER_M_Z17, max_zoom: DA.Z17_MAX_ZOOM, min_zoom: DA.Z17_MIN_ZOOM },
                z18_layer: { buffer_m_max: DA.BUFFER_M_Z18, max_zoom: DA.Z18_MAX_ZOOM, min_zoom: DA.Z18_MIN_ZOOM }
            },
            features
        };
    }

    // 緯度経度→XYZタイル座標
    lonLatToTile(lon, lat, z) {
        const n = 2 ** z;
        const x = Math.floor((lon + 180) / 360 * n);
        const latRad = lat * Math.PI / 180;
        const y = Math.floor(
            (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
        );
        return [x, y];
    }

    // タイル座標→緯度経度bbox
    tileToBBox(x, y, z) {
        const n = 2 ** z;
        const lonW = x / n * 360 - 180;
        const lonE = (x + 1) / n * 360 - 180;
        const latN = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
        const latS = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
        return { lonW, lonE, latN, latS };
    }

    // Haversine距離 (m)
    haversineM(lat1, lon1, lat2, lon2) {
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const dφ = (lat2 - lat1) * Math.PI / 180;
        const dλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dφ / 2) ** 2 +
                  Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
        return 2 * DA.EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
    }

    // 円とタイルbboxの交差判定（最近接点クランプ + カバー率閾値）
    circleIntersectsTile(lat, lon, radiusM, bbox) {
        // 1次フィルタ: 円とタイルbboxが触れるか
        const clampedLat = Math.max(bbox.latS, Math.min(lat, bbox.latN));
        const clampedLon = Math.max(bbox.lonW, Math.min(lon, bbox.lonE));
        const minDist = this.haversineM(lat, lon, clampedLat, clampedLon);
        if (minDist > radiusM) return false;

        // 閾値が0以下なら従来通り「触れたら採用」
        const threshold = DA.COVERAGE_THRESHOLD;
        if (!threshold || threshold <= 0) return true;

        // バッファ面積がタイル面積×閾値より小さい場合（低ズーム）は閾値スキップ。
        // 例: z=10 ではタイル≫バッファのため、5% を物理的に満たせない。
        const circleArea = Math.PI * radiusM * radiusM;
        const tileArea = this.approxTileAreaM2(bbox);
        if (circleArea < threshold * tileArea) return true;

        // タイル内でサンプリングし、カバー率が閾値以上か判定
        return this.tileCoverageRatio(lat, lon, radiusM, bbox) >= threshold;
    }

    // タイルbboxの面積をメートル平方で近似
    approxTileAreaM2(bbox) {
        const midLatRad = (bbox.latS + bbox.latN) / 2 * Math.PI / 180;
        const heightM = (bbox.latN - bbox.latS) * Math.PI / 180 * DA.EARTH_RADIUS_M;
        const widthM = (bbox.lonE - bbox.lonW) * Math.PI / 180 * DA.EARTH_RADIUS_M * Math.cos(midLatRad);
        return widthM * heightM;
    }

    // タイル内をN×Nグリッドでサンプリングし、円内に入ったサンプルの比率を返す
    tileCoverageRatio(lat, lon, radiusM, bbox) {
        const N = DA.COVERAGE_SAMPLE_GRID;
        let inside = 0;
        const dLat = bbox.latN - bbox.latS;
        const dLon = bbox.lonE - bbox.lonW;
        for (let i = 0; i < N; i++) {
            const sampleLat = bbox.latS + dLat * (i + 0.5) / N;
            for (let j = 0; j < N; j++) {
                const sampleLon = bbox.lonW + dLon * (j + 0.5) / N;
                if (this.haversineM(lat, lon, sampleLat, sampleLon) <= radiusM) {
                    inside++;
                }
            }
        }
        return inside / (N * N);
    }

    // 1点について該当タイルを列挙
    tilesForPoint(lat, lon, radiusM, z) {
        const latRad = lat * Math.PI / 180;
        const dLat = (radiusM / DA.EARTH_RADIUS_M) * 180 / Math.PI;
        const dLon = (radiusM / (DA.EARTH_RADIUS_M * Math.cos(latRad))) * 180 / Math.PI;

        const [x1] = this.lonLatToTile(lon - dLon, lat, z);
        const [x2] = this.lonLatToTile(lon + dLon, lat, z);
        const [, y1] = this.lonLatToTile(lon, lat + dLat, z); // 北側はy小
        const [, y2] = this.lonLatToTile(lon, lat - dLat, z); // 南側はy大

        const tiles = [];
        for (let x = x1; x <= x2; x++) {
            for (let y = y1; y <= y2; y++) {
                const bbox = this.tileToBBox(x, y, z);
                if (this.circleIntersectsTile(lat, lon, radiusM, bbox)) {
                    tiles.push([x, y]);
                }
            }
        }
        return tiles;
    }

    // tile_manifest.json を生成
    generateTileManifest() {
        const points = this.getEffectivePoints();
        const radii = this.computeDynamicRadii(points);
        const z17Set = new Set();
        const z18Set = new Set();

        for (const p of points) {
            const r = this.radiiFor(p, radii);
            for (const [x, y] of this.tilesForPoint(p.lat, p.lng, r.z17, DA.Z17)) {
                z17Set.add(`${x},${y}`);
            }
            for (const [x, y] of this.tilesForPoint(p.lat, p.lng, r.z18, DA.Z18)) {
                z18Set.add(`${x},${y}`);
            }
        }

        const tilesFromSet = (s) => Array.from(s)
            .map(k => k.split(',').map(Number))
            .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

        return {
            version: DA.MANIFEST_VERSION,
            source: DA.MANIFEST_SOURCE,
            dynamic_buffer: this.dynamicBufferEnabled,
            cluster_merge: this.clusterMergeEnabled,
            layers: {
                [DA.LAYER_KEY_Z17]: {
                    z: DA.Z17,
                    buffer_m_max: DA.BUFFER_M_Z17,
                    tile_count: z17Set.size,
                    tiles: tilesFromSet(z17Set)
                },
                [DA.LAYER_KEY_Z18]: {
                    z: DA.Z18,
                    buffer_m_max: DA.BUFFER_M_Z18,
                    tile_count: z18Set.size,
                    tiles: tilesFromSet(z18Set)
                }
            }
        };
    }

    // 2つのファイルを出力
    exportFiles() {
        const points = this.getEligiblePoints();
        if (points.length === 0) {
            return { success: false, error: CONFIG.MESSAGES.DOWNLOAD_AREA_EMPTY };
        }

        const geojson = this.generateTileBuffersGeoJSON();
        const manifest = this.generateTileManifest();

        this.downloadJSON(geojson, DA.GEOJSON_FILENAME);
        this.downloadJSON(manifest, DA.MANIFEST_FILENAME);

        return {
            success: true,
            pointCount: points.length,
            z17Count: manifest.layers[DA.LAYER_KEY_Z17].tile_count,
            z18Count: manifest.layers[DA.LAYER_KEY_Z18].tile_count
        };
    }

    downloadJSON(obj, filename) {
        const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

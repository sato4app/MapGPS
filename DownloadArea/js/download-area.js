// Download領域の可視化およびタイル/GeoJSONファイル生成
// - 各ポイントを中心に半径(z=17/z=18)の円を地図に描画
// - 「Download領域の指定ファイルを出力」で tile_buffers.geojson と tile_manifest.json を出力
import { CONFIG } from './config.js';

const DA = CONFIG.DOWNLOAD_AREA;

export class DownloadAreaManager {
    constructor(mapManager, gpsDataManager, fileHandler) {
        this.mapManager = mapManager;
        this.gpsDataManager = gpsDataManager;
        this.fileHandler = fileHandler;
        this.bufferLayer = L.layerGroup().addTo(this.mapManager.getMap());
        // ズーム別の対象タイル矩形を描くレイヤー（円バッファとは独立）。
        this.tileGridLayer = L.layerGroup().addTo(this.mapManager.getMap());
        // 「領域を表示」ボタンで切り替える円描画/タイル統計の表示フラグ。初期は非表示。
        this.areaDisplayEnabled = false;
        // タイルグリッド図示で対象とするズームレベル。null のとき非表示。
        this.tileGridZoom = null;
        // バッファ半径(m)。画面のスライドバーで変更可能。初期値は設定のデフォルト。
        this.bufferR17 = DA.BUFFER_M_Z17;
        this.bufferR18 = DA.BUFFER_M_Z18;
        // ルートGeoJSON由来の中間点 [{lat, lng}, ...]。円バッファなし、点を含むタイル1枚のみ対象。
        this.routeWaypoints = [];
        // ルート線描画レイヤー（中間点の視覚化用）
        this.routeLineLayer = L.layerGroup().addTo(this.mapManager.getMap());
    }

    // ルートGeoJSON から中間点列を取り込み、地図にルート線を描画する。
    // 戻り値: { lineCount, pointCount }
    loadRouteGeoJSON(geojson) {
        this.routeWaypoints = [];
        this.routeLineLayer.clearLayers();

        const lineStrings = this.extractLineStrings(geojson);
        for (const coords of lineStrings) {
            // 描画用 [lat, lng] の配列に変換
            const latlngs = coords.map(c => [c[1], c[0]]);
            L.polyline(latlngs, CONFIG.ROUTE_LINE_STYLE).addTo(this.routeLineLayer);
            // 中間点を集合に追加
            for (const c of coords) {
                this.routeWaypoints.push({ lng: c[0], lat: c[1] });
            }
        }

        // 領域表示中なら、タイル統計とタイルグリッド矩形も再計算・再描画
        if (this.areaDisplayEnabled) {
            this.updateTileStatsDisplay();
            this.updateTileGrid();
        }

        return { lineCount: lineStrings.length, pointCount: this.routeWaypoints.length };
    }

    // GeoJSON から LineString の coordinates 配列を全て取り出す。
    // FeatureCollection / Feature / LineString / MultiLineString のいずれも受け付ける。
    extractLineStrings(geojson) {
        const result = [];
        const visit = (node) => {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'FeatureCollection') {
                (node.features || []).forEach(visit);
            } else if (node.type === 'Feature') {
                visit(node.geometry);
            } else if (node.type === 'LineString') {
                if (Array.isArray(node.coordinates)) result.push(node.coordinates);
            } else if (node.type === 'MultiLineString') {
                (node.coordinates || []).forEach(line => result.push(line));
            }
        };
        visit(geojson);
        return result;
    }

    // z17 バッファ半径(m)を設定して再描画
    setBufferR17(meters) {
        this.bufferR17 = Number(meters);
        this.updateCircles();
    }

    // z18 バッファ半径(m)を設定して再描画
    setBufferR18(meters) {
        this.bufferR18 = Number(meters);
        this.updateCircles();
    }

    getBufferR17() {
        return this.bufferR17;
    }

    getBufferR18() {
        return this.bufferR18;
    }

    // タイルグリッド図示の対象ズームレベルを設定して再描画。
    // zoom に null を渡すとグリッドを非表示にする。
    setTileGridZoom(zoom) {
        this.tileGridZoom = (zoom === null || zoom === undefined) ? null : Number(zoom);
        this.updateTileGrid();
    }

    getTileGridZoom() {
        return this.tileGridZoom;
    }

    // 領域表示のON/OFFを切り替えて再描画
    setAreaDisplayEnabled(enabled) {
        this.areaDisplayEnabled = !!enabled;
        this.updateCircles();
    }

    isAreaDisplayEnabled() {
        return this.areaDisplayEnabled;
    }

    // 「Download領域の算出から除外」以外のポイントを返す
    getEligiblePoints() {
        return this.gpsDataManager.getAllPoints()
            .filter(p => p.category !== CONFIG.CATEGORIES.EXCLUDED);
    }

    // 円描画／タイル算出に使うポイントを返す。
    // 各ポイントは現在のバッファ半径(baseR17/baseR18)を持つ。
    getEffectivePoints() {
        return this.getEligiblePoints().map(p => ({
            id: p.id,
            lat: p.lat,
            lng: p.lng,
            baseR17: this.bufferR17,
            baseR18: this.bufferR18
        }));
    }

    // 指定ポイントのバッファ半径(z17/z18)を返す
    radiiFor(p) {
        return { z17: p.baseR17, z18: p.baseR18 };
    }

    // 円の表示を更新
    updateCircles() {
        this.bufferLayer.clearLayers();

        // 領域表示OFF時は円を描画せず、タイル統計もリセット表示にする
        if (!this.areaDisplayEnabled) {
            this.resetTileStatsDisplay();
            this.updateTileGrid();
            return;
        }

        const points = this.getEffectivePoints();

        for (const p of points) {
            const r = this.radiiFor(p);

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
        this.updateTileGrid();
    }

    // 指定ズームレベルの対象タイル集合を返す。Map<"x,y", {x, y}>。
    // z=18 のみ z18 半径、それ以外は z17 半径を使用（calculateTileStats と同じ規約）。
    collectTilesForZoom(z) {
        const points = this.getEffectivePoints();
        const useZ18 = (z === DA.Z18);
        const tiles = new Map();
        for (const p of points) {
            const r = this.radiiFor(p);
            const radius = useZ18 ? r.z18 : r.z17;
            for (const [x, y] of this.tilesForPoint(p.lat, p.lng, radius, z)) {
                tiles.set(`${x},${y}`, { x, y });
            }
        }
        // ルートGeoJSON由来の中間点: z=17/z=18 でのみ、点を含むタイル1枚を加算
        if (z === DA.Z17 || z === DA.Z18) {
            for (const w of this.routeWaypoints) {
                const [x, y] = this.lonLatToTile(w.lng, w.lat, z);
                tiles.set(`${x},${y}`, { x, y });
            }
        }
        return tiles;
    }

    // ズーム別の対象タイル矩形を地図に描画する。
    // tileGridZoom が null、または領域表示OFF のときは何も描かない。
    updateTileGrid() {
        this.tileGridLayer.clearLayers();
        if (this.tileGridZoom === null || !this.areaDisplayEnabled) {
            return;
        }

        const z = this.tileGridZoom;
        const color = CONFIG.TILE_GRID_COLORS[z] || '#1d4ed8';
        const tiles = this.collectTilesForZoom(z);

        for (const { x, y } of tiles.values()) {
            const bbox = this.tileToBBox(x, y, z);
            L.rectangle(
                [[bbox.latS, bbox.lonW], [bbox.latN, bbox.lonE]],
                { color, fillColor: color, ...CONFIG.TILE_GRID_STYLE }
            ).addTo(this.tileGridLayer);
        }

        // タイル群の中心付近に「z=NN: M枚」のラベルを表示する。
        if (tiles.size > 0) {
            const labelLatLng = this.tileGridLabelLatLng(tiles, z);
            L.marker(labelLatLng, {
                interactive: false,
                icon: L.divIcon({
                    className: 'tile-grid-label',
                    html: `<span style="border-color:${color};color:${color}">`
                        + `z=${z}: ${tiles.size.toLocaleString()}枚</span>`
                })
            }).addTo(this.tileGridLayer);
        }
    }

    // タイル群のbbox中心の緯度経度を返す（ラベル配置用）
    tileGridLabelLatLng(tiles, z) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const { x, y } of tiles.values()) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        const nw = this.tileToBBox(minX, minY, z);
        const se = this.tileToBBox(maxX, maxY, z);
        return [(nw.latN + se.latS) / 2, (nw.lonW + se.lonE) / 2];
    }

    // タイル統計表示欄をすべて0にリセット（領域非表示時に使用）
    resetTileStatsDisplay() {
        const setField = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        };
        setField('tileCountZ10to13', '0');
        setField('tileSizeZ10to13', '0.0');
        setField('tileCountZ14', '0');
        setField('tileSizeZ14', '0.0');
        setField('tileCountZ15', '0');
        setField('tileSizeZ15', '0.0');
        setField('tileCountZ16', '0');
        setField('tileSizeZ16', '0.0');
        setField('tileCountZ17', '0');
        setField('tileSizeZ17', '0.0');
        setField('tileCountZ18', '0');
        setField('tileSizeZ18', '0.0');
        setField('tileCountTotal', '0');
        setField('tileSizeTotal', '0.0');
    }

    // ズーム別タイル統計を計算（[{ z, count, sizeMB, tiles }, ...]）
    // - Excel由来のポイント: z=18 は z18 半径、それ以外は z17 半径の円バッファ
    // - ルートGeoJSON由来の中間点: z=17 と z=18 で「点を含むタイル1枚」のみを加算
    // tiles は [{x, y}, ...]（実測HEADリクエスト用）。
    calculateTileStats() {
        const points = this.getEffectivePoints();
        const stats = [];

        for (const z of DA.STAT_ZOOM_LEVELS) {
            const useZ18 = (z === DA.Z18);
            const tileSet = new Set();

            // Excel由来ポイントの円バッファに含まれるタイル
            for (const p of points) {
                const r = this.radiiFor(p);
                const radius = useZ18 ? r.z18 : r.z17;
                for (const [x, y] of this.tilesForPoint(p.lat, p.lng, radius, z)) {
                    tileSet.add(`${x},${y}`);
                }
            }

            // ルートGeoJSON由来の中間点: z=17/z=18 でのみ、点を含むタイル1枚を加算
            if (z === DA.Z17 || z === DA.Z18) {
                for (const w of this.routeWaypoints) {
                    const [x, y] = this.lonLatToTile(w.lng, w.lat, z);
                    tileSet.add(`${x},${y}`);
                }
            }

            const tiles = Array.from(tileSet).map(k => {
                const [x, y] = k.split(',').map(Number);
                return { x, y };
            });
            const count = tiles.length;
            const sizeMB = count * DA.AVG_TILE_KB / 1024;
            stats.push({ z, count, sizeMB, tiles });
        }

        return stats;
    }

    // 統計表示欄を更新（z=10〜16 は集約、z=17・z=18・合計）
    // 引数 stats を省略すると平均推定で計算する。
    updateTileStatsDisplay(stats = null) {
        stats = stats || this.calculateTileStats();
        const setField = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        };

        let lowZoomCount = 0;
        let lowZoomSize = 0;
        let totalCount = 0;
        let totalSizeMB = 0;

        for (const s of stats) {
            if (s.z === DA.Z14) {
                setField('tileCountZ14', s.count.toLocaleString());
                setField('tileSizeZ14', s.sizeMB.toFixed(1));
            } else if (s.z === DA.Z15) {
                setField('tileCountZ15', s.count.toLocaleString());
                setField('tileSizeZ15', s.sizeMB.toFixed(1));
            } else if (s.z === DA.Z16) {
                setField('tileCountZ16', s.count.toLocaleString());
                setField('tileSizeZ16', s.sizeMB.toFixed(1));
            } else if (s.z === DA.Z17) {
                setField('tileCountZ17', s.count.toLocaleString());
                setField('tileSizeZ17', s.sizeMB.toFixed(1));
            } else if (s.z === DA.Z18) {
                setField('tileCountZ18', s.count.toLocaleString());
                setField('tileSizeZ18', s.sizeMB.toFixed(1));
            } else {
                // z=10〜13 集約
                lowZoomCount += s.count;
                lowZoomSize += s.sizeMB;
            }
            totalCount += s.count;
            totalSizeMB += s.sizeMB;
        }

        setField('tileCountZ10to13', lowZoomCount.toLocaleString());
        setField('tileSizeZ10to13', lowZoomSize.toFixed(1));
        setField('tileCountTotal', totalCount.toLocaleString());
        setField('tileSizeTotal', totalSizeMB.toFixed(1));
    }

    // タイル座標(x, y, z)から地理院タイルのURLを生成
    tileUrl(x, y, z) {
        return CONFIG.GSI_TILE_URL
            .replace('{z}', z)
            .replace('{x}', x)
            .replace('{y}', y);
    }

    // 1タイルの実バイト数を HEAD リクエストで取得（取得失敗時は0）
    async fetchTileSize(x, y, z) {
        try {
            const res = await fetch(this.tileUrl(x, y, z), { method: 'HEAD' });
            if (!res.ok) return 0;
            const len = res.headers.get('Content-Length');
            return len ? Number(len) : 0;
        } catch {
            return 0;
        }
    }

    // 全レベルのタイルへ直列0.1秒間隔でHEADリクエストし、実サイズ合計で表示を更新する。
    // onProgress(done, total) が指定されていれば進捗を通知する。
    async measureTileSizes(onProgress = null) {
        const stats = this.calculateTileStats();
        const total = stats.reduce((sum, s) => sum + s.count, 0);
        if (total === 0) {
            return { success: false, reason: 'empty' };
        }

        let done = 0;
        // 各レベルの実サイズ(byte)を集計
        const measured = [];
        for (const s of stats) {
            let sizeBytes = 0;
            for (const t of s.tiles) {
                sizeBytes += await this.fetchTileSize(t.x, t.y, s.z);
                done++;
                if (onProgress) onProgress(done, total);
                await new Promise(resolve => setTimeout(resolve, 100)); // 0.1秒間隔
            }
            measured.push({ z: s.z, count: s.count, sizeMB: sizeBytes / (1024 * 1024) });
        }

        this.updateTileStatsDisplay(measured);
        return { success: true, tileCount: total };
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

    // tile_buffers.geojson の version に入れる出力年月 (yyyy-mm)。
    // 「どの回の出力か」を示す印であり、公開バージョンではない。
    // 公開バージョン（yyyy.nn）は MapPublisher の画面で指定する。
    todayVersionString() {
        const today = new Date();
        return `${today.getFullYear()}-`
            + `${String(today.getMonth() + 1).padStart(2, '0')}`;
    }

    // tile_buffers.geojson を生成
    // z=14/15/16/17 は同じ z17 バッファ半径を共有するため、ジオメトリは同一だが
    // レイヤごとに個別の Feature を出力してマニフェストと対応を取る。
    generateTileBuffersGeoJSON() {
        const points = this.getEffectivePoints();
        const features = [];
        const z17SharedLayers = [
            DA.LAYER_KEY_Z14,
            DA.LAYER_KEY_Z15,
            DA.LAYER_KEY_Z16,
            DA.LAYER_KEY_Z17
        ];
        for (const p of points) {
            const r = this.radiiFor(p);
            const z17Polygon = this.circlePolygon(p.lat, p.lng, r.z17);
            for (const layerKey of z17SharedLayers) {
                features.push({
                    type: 'Feature',
                    properties: { layer: layerKey, buffer_m: r.z17 },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [z17Polygon]
                    }
                });
            }
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
                version: this.todayVersionString(),
                z14_layer: { buffer_m_max: this.bufferR17, max_zoom: DA.Z14, min_zoom: DA.Z14 },
                z15_layer: { buffer_m_max: this.bufferR17, max_zoom: DA.Z15, min_zoom: DA.Z15 },
                z16_layer: { buffer_m_max: this.bufferR17, max_zoom: DA.Z16, min_zoom: DA.Z16 },
                z17_layer: { buffer_m_max: this.bufferR17, max_zoom: DA.Z17_MAX_ZOOM, min_zoom: DA.Z17_MIN_ZOOM },
                z18_layer: { buffer_m_max: this.bufferR18, max_zoom: DA.Z18_MAX_ZOOM, min_zoom: DA.Z18_MIN_ZOOM }
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
    //
    // version は入れない。公開バージョンは MapPublisher の画面で指定するもので、
    // ここに書いても公開結果には反映されない（公開API 契約 3.0 §4）。
    // 同じ名前の値を2箇所で持つと、どちらが効くのか分からなくなる。
    generateTileManifest() {
        const points = this.getEffectivePoints();
        const z14Set = new Set();
        const z15Set = new Set();
        const z16Set = new Set();
        const z17Set = new Set();
        const z18Set = new Set();

        for (const p of points) {
            const r = this.radiiFor(p);
            for (const [x, y] of this.tilesForPoint(p.lat, p.lng, r.z17, DA.Z14)) {
                z14Set.add(`${x},${y}`);
            }
            for (const [x, y] of this.tilesForPoint(p.lat, p.lng, r.z17, DA.Z15)) {
                z15Set.add(`${x},${y}`);
            }
            for (const [x, y] of this.tilesForPoint(p.lat, p.lng, r.z17, DA.Z16)) {
                z16Set.add(`${x},${y}`);
            }
            for (const [x, y] of this.tilesForPoint(p.lat, p.lng, r.z17, DA.Z17)) {
                z17Set.add(`${x},${y}`);
            }
            for (const [x, y] of this.tilesForPoint(p.lat, p.lng, r.z18, DA.Z18)) {
                z18Set.add(`${x},${y}`);
            }
        }

        // ルートGeoJSON由来の中間点: z=17/z=18 共に点を含むタイル1枚のみ加算
        for (const w of this.routeWaypoints) {
            const [x17, y17] = this.lonLatToTile(w.lng, w.lat, DA.Z17);
            z17Set.add(`${x17},${y17}`);
            const [x18, y18] = this.lonLatToTile(w.lng, w.lat, DA.Z18);
            z18Set.add(`${x18},${y18}`);
        }

        const tilesFromSet = (s) => Array.from(s)
            .map(k => k.split(',').map(Number))
            .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

        return {
            source: DA.MANIFEST_SOURCE,
            layers: {
                [DA.LAYER_KEY_Z14]: {
                    z: DA.Z14,
                    buffer_m_max: this.bufferR17,
                    tile_count: z14Set.size,
                    tiles: tilesFromSet(z14Set)
                },
                [DA.LAYER_KEY_Z15]: {
                    z: DA.Z15,
                    buffer_m_max: this.bufferR17,
                    tile_count: z15Set.size,
                    tiles: tilesFromSet(z15Set)
                },
                [DA.LAYER_KEY_Z16]: {
                    z: DA.Z16,
                    buffer_m_max: this.bufferR17,
                    tile_count: z16Set.size,
                    tiles: tilesFromSet(z16Set)
                },
                [DA.LAYER_KEY_Z17]: {
                    z: DA.Z17,
                    buffer_m_max: this.bufferR17,
                    tile_count: z17Set.size,
                    tiles: tilesFromSet(z17Set)
                },
                [DA.LAYER_KEY_Z18]: {
                    z: DA.Z18,
                    buffer_m_max: this.bufferR18,
                    tile_count: z18Set.size,
                    tiles: tilesFromSet(z18Set)
                }
            }
        };
    }

    // 2つのファイルを、利用者が選んだフォルダへ出力する
    async exportFiles() {
        const points = this.getEligiblePoints();
        if (points.length === 0 && this.routeWaypoints.length === 0) {
            return { success: false, error: CONFIG.MESSAGES.DOWNLOAD_AREA_EMPTY };
        }

        const geojson = this.generateTileBuffersGeoJSON();
        const manifest = this.generateTileManifest();

        // 2ファイルは対で使うため、続けて保存する（2つ目は1つ目と同じフォルダが開く）
        const saveResult = await this.fileHandler.saveJsonFilesWithUserChoice([
            { filename: DA.GEOJSON_FILENAME, content: JSON.stringify(geojson) },
            { filename: DA.MANIFEST_FILENAME, content: JSON.stringify(manifest) }
        ]);

        if (!saveResult.success) {
            return {
                success: false,
                error: saveResult.error,
                savedFilenames: saveResult.savedFilenames
            };
        }

        return {
            success: true,
            filenames: saveResult.filenames,
            pointCount: points.length,
            z14Count: manifest.layers[DA.LAYER_KEY_Z14].tile_count,
            z15Count: manifest.layers[DA.LAYER_KEY_Z15].tile_count,
            z16Count: manifest.layers[DA.LAYER_KEY_Z16].tile_count,
            z17Count: manifest.layers[DA.LAYER_KEY_Z17].tile_count,
            z18Count: manifest.layers[DA.LAYER_KEY_Z18].tile_count
        };
    }
}
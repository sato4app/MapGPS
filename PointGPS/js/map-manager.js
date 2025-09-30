// 地図管理クラス
import { CONFIG } from './config.js';

export class MapManager {
    constructor(mapElementId) {
        this.mapElementId = mapElementId;
        this.map = null;
        this.init();
    }

    init() {
        // 地図初期化（デフォルトのコントロールを無効化）
        this.map = L.map(this.mapElementId, {
            zoomControl: false
        }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
        
        // 国土地理院タイルレイヤーを追加
        L.tileLayer(CONFIG.GSI_TILE_URL, {
            attribution: CONFIG.GSI_ATTRIBUTION,
            maxZoom: 18
        }).addTo(this.map);
        
        // スケールコントロールを右下に追加
        L.control.scale({
            position: 'bottomright',
            metric: true,
            imperial: false
        }).addTo(this.map);
        
        // ズームコントロールをスケールの上に配置
        L.control.zoom({
            position: 'bottomright'
        }).addTo(this.map);

        console.log('地図を初期化しました');
    }

    getMap() {
        return this.map;
    }

    // 地図の中心を指定座標に移動
    setView(latlng, zoom = null) {
        if (zoom !== null) {
            this.map.setView(latlng, zoom);
        } else {
            this.map.setView(latlng);
        }
    }

    // 地図上にクリックイベントを追加
    onMapClick(callback) {
        this.map.on('click', callback);
    }

    // 地図上のクリックイベントを削除
    offMapClick(callback) {
        this.map.off('click', callback);
    }
}
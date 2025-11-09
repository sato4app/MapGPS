// 地図コア機能を管理するモジュール
import { DEFAULTS } from './constants.js';

export class MapCore {
    constructor() {
        this.initialCenter = DEFAULTS.MAP_CENTER;
        this.initialZoom = DEFAULTS.MAP_ZOOM;
        this.map = null;
        this.initPromise = this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            // Leafletライブラリが読み込まれるまで待機
            const waitForLeaflet = () => {
                if (typeof L !== 'undefined') {
                    // DOMが読み込まれるまで待機
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', () => {
                            this.initializeMap();
                            resolve();
                        });
                    } else {
                        // すでに読み込み済みの場合は即座に初期化
                        setTimeout(() => {
                            this.initializeMap();
                            resolve();
                        }, 10); // 少し遅延を入れて確実にDOM準備完了を待つ
                    }
                } else {
                    // 100ms後に再試行
                    setTimeout(waitForLeaflet, 100);
                }
            };
            
            waitForLeaflet();
        });
    }
    
    initializeMap() {
        try {
            // Leafletライブラリが読み込まれているかチェック
            if (typeof L === 'undefined') {
                console.error('Leafletライブラリが読み込まれていません。');
                return;
            }

            // 地図コンテナが存在するかチェック
            const mapContainer = document.getElementById('map');
            if (!mapContainer) {
                console.error('地図コンテナが見つかりません。');
                return;
            }

            // 地図の初期化（デフォルトズームコントロールを無効化）
            this.map = L.map('map', { zoomControl: false }).setView(this.initialCenter, this.initialZoom);

            // スケールバーを右下に追加
            L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 150 }).addTo(this.map);

            // ズームコントロールを右下に追加（スケールの上に配置）
            L.control.zoom({ position: 'bottomright' }).addTo(this.map);

            // 国土地理院タイルレイヤー
            const tileLayer = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
                attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>",
                minZoom: 2, maxZoom: 18
            });
            tileLayer.addTo(this.map);

            // マーカー用のペインを作成（z軸順序: 下から画像、ポイントGPS、ポイントJSON、ルート中間点、スポット）
            // ポイントGPSマーカー用ペイン
            this.map.createPane('gpsMarkers');
            this.map.getPane('gpsMarkers').style.zIndex = 610;

            // ポイントJSONマーカー用ペイン
            this.map.createPane('pointJsonMarkers');
            this.map.getPane('pointJsonMarkers').style.zIndex = 620;

            // ルート中間点マーカー用ペイン
            this.map.createPane('wayPointMarkers');
            this.map.getPane('wayPointMarkers').style.zIndex = 630;

            // スポットマーカー用ペイン
            this.map.createPane('spotMarkers');
            this.map.getPane('spotMarkers').style.zIndex = 630; // ルート中間点と同じ

            // 経路線用の専用ペインを作成
            this.map.createPane('routeLines');
            this.map.getPane('routeLines').style.zIndex = 600;
            
        } catch (error) {
            console.error('地図の初期化に失敗しました:', error.message);
        }
    }

    getMap() {
        return this.map;
    }

    getInitialCenter() {
        return this.initialCenter;
    }
}
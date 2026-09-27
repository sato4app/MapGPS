## MapGPS

紙・画像のハイキングマップを GPS データ化し、編集・公開するまでの一連のツール群。
トップの `index.html` はアプリ選択画面で、各アプリを新しいタブで開く。

### 収録アプリ

| アプリ | 概要 | 詳細 |
|--------|------|------|
| 🚩 PointGPS | 地理院地図上でポイントの追加・移動・削除を行い、GPS値をExcel形式で出力 | [README](PointGPS/README.md) |
| 📍 PointMarker | PNG画像のマップからポイント・ルート・スポットを選択し、画像内座標データを出力 | [README](PointMarker/README.md) |
| 🗺️ GeoReferencer | PNG画像のハイキングマップを地理院地図に重ね合わせ（ジオリファレンス）、地域別 GeoJSON を出力 | [README](GeoReferencer/README.md) |
| 🗾 MapEditor | ルート・スポット・エリア、通行止め地点等を位置編集し、GeoJSON ファイルに出力 | [README](MapEditor/README.md) |
| ➿ DownloadArea | オフライン対応用に、ダウンロードする地理院タイルの領域を設定 | [README](DownloadArea/README.md) |
| 📤 MapPublisher | ハイキングマップ・通行止め地点の GeoJSON を確認し、minoh-hiking へ公開 | [README](MapPublisher/README.md) |

### 作業の流れ

```
PointGPS ─(GPSポイント Excel)─┬──────────────────────────────────────┐
                              v                                      v
PointMarker ─(画像内座標)─> GeoReferencer ─(地域別GeoJSON)─> MapEditor ─(作業用GeoJSON)─┐
                                                                                        v
                                           DownloadArea ─(tile_manifest.json)─> MapPublisher ─> minoh-hiking
```

1. **PointGPS** で基準点（制御点）となるポイントの GPS 値を作成し、Excel で出力する
2. **PointMarker** でハイキングマップ画像上のポイント・ルート・スポットをマーキングする
3. **GeoReferencer** で PointGPS の Excel を制御点として画像を地理院地図に重ね合わせ、画像内座標を GPS 座標に変換する
4. **MapEditor** で地域別 GeoJSON と GPS ポイントを読み込み、位置を編集・統合し、通行止め地点を登録する
5. **DownloadArea** でオフライン用のタイル範囲を設定する
6. **MapPublisher** で公開スキーマへ整形し、minoh-hiking へ公開する

PointGPS の出力 Excel は、GeoReferencer・MapEditor の GPS ポイント入力と同じ列構成（ポイントID・名称・緯度・経度・標高・備考）である。

### 動作環境

| 項目 | 内容 |
|------|------|
| 利用者 | 運用担当者専用 |
| 対応端末 | PC専用 |
| 推奨ブラウザ | Chrome / Edge（File System Access API で保存先を選べる。非対応ブラウザではダウンロード保存） |
| 言語 | 日本語のみ |
| ネットワーク | 地理院タイル・標高API を利用するためインターネット接続が必要 |

各アプリは ES6 モジュール構成のため、ローカルで動かすときは CORS 制限を回避するローカルサーバーが必要。
ビルドプロセスは無く、外部ライブラリ（Leaflet、SheetJS 等）は CDN から読み込む。
（例外として、GeoReferencer のジオリファレンス処理をコマンドラインで一括実行する Node.js 版ツールが
[GeoReferencer/cli/](GeoReferencer/cli/README.md) にある。）

```bash
python -m http.server 8000
# または
npx serve .
# ブラウザで http://localhost:8000 を開く
```

### フォルダ構成

```
MapGPS/
├── index.html      # アプリ選択画面
├── styles.css      # 選択画面のスタイル
├── PointGPS/
├── PointMarker/
├── GeoReferencer/  # cli/ にコマンドライン版ツール
├── MapEditor/
├── DownloadArea/
└── MapPublisher/   # 各アプリは index.html / js/ / styles.css / docs/ で構成
```

# MapPublisher

### 地図データの公開

- MapEditor が出力した geojson ファイルを読み込み、地理院地図上に表示して内容を確認する。
- 確認した内容を**公開スキーマへ整形**し、公開API へ送信してユーザーに公開する。
- 公開するのは次の2つのデータセット。
  - **地図データ** … 緊急ポイント（ポイントGPS）・ハイキングルート・スポット
  - **通行止め・通行困難地点** … closures

**本アプリは編集を行わない。** 地点・ルート・スポットの編集、通行止め地点の登録は
MapEditor の役割であり、本アプリは「読み込む → 確認する → 公開する」に絞っている。

再構成の経緯と全体計画は [docs/migration-plan-202608.md](docs/migration-plan-202608.md) を参照。

## 位置づけ

| 項目 | 内容 |
|------|------|
| 利用者 | 運用担当者専用（MapGPS のカードから開く） |
| 対応端末 | PC専用 |
| 言語 | 日本語のみ |
| オフライン・PWA | 非対応 |
| ホスティング | GitHub Pages（`sato4app/MapPublisher`） |

## 役割分担

| リポジトリ | 役割 |
|---|---|
| MapEditor | 地点・ルート・スポットの編集、通行止め地点の登録。**作業用** geojson を出力する |
| **MapPublisher** | 作業用 geojson を**公開スキーマへ整形**し、公開API へ送信する |
| minoh-hiking | 公開API の実装・配信元、および利用者向け表示アプリ |

編集用の識別子（`spot` の `id` など）は MapEditor の作業ファイルには残し、
**MapPublisher が公開時に落とす**。編集の都合と配信の都合を分離している。

## 開発・動作確認

ES6 モジュール構成のため、CORS 制限を回避するローカルサーバーが必要。

```bash
python -m http.server 8000
# または
npx serve .
# ブラウザで http://localhost:8000 を開く
```

ビルドプロセスは無い。Leaflet 1.9.4 は CDN から読み込む。

## ファイル構成

```
index.html          画面（1画面・右上に操作パネル・2セクション構成）
styles.css          スタイル
js/
  app.js            エントリーポイント。初期化とイベント登録
  constants.js      定数（地図・マーカースタイル・公開API URL・公開対象 type）
  mapCore.js        地図の初期化・レイヤーの重ね順
  render.js         マーカー描画（2データセット共通）
  mapData.js        地図データの保持・表示・公開用整形
  closureData.js    通行止め地点の保持・表示・公開用整形
  fileIO.js         geojson の読み込み（置換方式）・整形結果の出力
  publish.js        公開（POST・件数差分の確認・E01〜E06・バックアップ保存）
  message.js        トーストメッセージ
  utils.js          日付・座標の丸め・ファイル保存
docs/               仕様書一式
```

## ドキュメント

| 文書 | 内容 |
|------|------|
| [migration-plan-202608.md](docs/migration-plan-202608.md) | 再構成・移行の実装計画（3リポジトリ横断） |
| [funcspec-202608.md](docs/funcspec-202608.md) | 機能仕様（本アプリの正本） |
| [dataspec-202608.md](docs/dataspec-202608.md) | 入力 GeoJSON の仕様と公開スキーマへの整形規則 |
| [usersGuide-202608.md](docs/usersGuide-202608.md) | 利用者の手引（運用担当者向けの操作手順・エラー対応・トークン設定） |

## 公開API について

公開先は minoh-hiking（別オリジン・CORS 許可済み）。

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/manifest` | 各データセットの version・件数（起動時の表示に使用） |
| POST | `/api/mapdata` | 地図データの公開（全置換） |
| POST | `/api/closures` | 通行止め地点の公開（全置換） |

**公開API の仕様は minoh-hiking
[`docs/publish-api-202608.md`](../../ナビアプリ/minoh-hiking/docs/publish-api-202608.md)
（契約バージョン 2.0）が正本であり、本リポジトリには書き写さない。**

座標範囲・`id` 一意・`type` の妥当性といった検証はサーバーに任せ、失敗時は API が返した
日本語メッセージをそのまま表示する（二重管理を避けるため）。
`version` も同じ理由でクライアント側では扱わない。**採番はサーバーの責務**であり、
予測値を出すと採番ロジックを二重に持つことになる。

## 移行の進捗

- [x] 段階0: 仕様確定（公開API 契約2.0・公開スキーマの策定）
- [x] 段階1: MapPublisher の再構成（編集機能の削除・2データセット公開への対応）
- [ ] 段階2: minoh-hiking に公開API を実装（`_lib` 共通化・`mapdata`・`manifest`・`closures` 改修）
- [ ] 段階3: 地図データの初回公開
- [ ] 段階4: minoh-hiking アプリ側の切替（version による更新判定・キャッシュ）
- [ ] 段階5: 後始末（バンドル geojson 削除・旧環境変数削除・ドキュメント改訂）

段階2が完了するまで、`/api/mapdata` と `/api/manifest` は存在しないため、
地図データの「現在公開中」は「取得できません」と表示され、公開は E06 になる。
通行止め地点は既存の `/api/closures`（契約1.0）に対して動作する。

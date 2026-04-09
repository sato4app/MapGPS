# PointMarker 機能仕様書

## 1. プロジェクト概要

### 1.1 プロジェクト名
PointMarker

### 1.2 目的
ハイキングマップ画像上にポイント、スポット、ルート、エリアを視覚的にマーキングし、構造化されたJSONデータとして統合管理・出力するWebアプリケーション

### 1.3 対象ユーザー
- ハイキング・登山愛好者
- 地理情報管理者
- マップデータ作成者

### 1.4 技術仕様
- **言語**: バニラJavaScript（ES6モジュール）
- **UI**: HTML5、CSS3、Canvas API
- **ファイル処理**: File System Access API（フォールバック：従来のinput要素）
- **データ形式**: JSON
- **レスポンシブ対応**: CSS Flexbox、CSS変数
- **ブラウザ要件**: ES6モジュール対応ブラウザ、ローカルサーバー必須（CORS制限回避）
- **デバイス対応**: devicePixelRatio補正による高DPI・拡大率対応（100%～200%）

## 2. アーキテクチャ

### 2.1 フォルダ構造
```
PointMarker/
├── index.html                   # メインHTMLファイル
├── styles.css                   # スタイルシート
├── docs/                        # ドキュメント
│   ├── funcspec-202602.md       # 機能仕様書（v6.0・本書）
│   └── UsersGuide-202602.md     # ユーザーガイド（最新版）
└── js/                          # JavaScriptモジュール
    ├── app.js                   # メインアプリケーション
    ├── core/
    │   ├── BaseManager.js       # 基底マネージャークラス
    │   └── Canvas.js            # キャンバス描画管理
    ├── data/
    │   ├── AreaManager.js       # エリア管理（NEW）
    │   ├── FileHandler.js       # ファイル操作統合管理
    │   ├── PointManager.js      # ポイント管理
    │   ├── RouteManager.js      # ルート管理
    │   └── SpotManager.js       # スポット管理
    ├── firebase/                # Firebase連携（オプション）
    │   ├── AuthManager.js
    │   ├── FirebaseClient.js
    │   ├── FirebaseSyncManager.js
    │   └── FirestoreDataManager.js
    ├── ui/
    │   ├── AreaUIManager.js     # エリアUI管理（NEW）
    │   ├── CanvasEventHandler.js # キャンバスイベント統合管理（NEW）
    │   ├── InputManager.js      # 入力フィールド管理
    │   ├── LayoutManager.js     # レイアウト管理
    │   ├── MarkerSettingsManager.js # マーカ設定管理（NEW）
    │   ├── RouteUIManager.js    # ルートUI管理（NEW）
    │   ├── UIHelper.js          # UI補助機能
    │   ├── ValidationManager.js # バリデーション管理
    │   └── ViewportManager.js   # ビューポート管理
    └── utils/
        ├── Coordinates.js       # 座標変換
        ├── DragDropHandler.js   # ドラッグ&ドロップ処置
        ├── ObjectDetector.js    # オブジェクト検出
        ├── ResizeHandler.js     # リサイズ処理
        └── Validators.js        # バリデーションユーティリティ
```

### 2.2 設計パターンの進化
- **Managerパターンの徹底**: データ管理（FileManager）、UI管理（UIManager）の明確な分離
- **イベントハンドリングの統合**: CanvasEventHandlerによるイベント処理の一元管理
- **設定の永続化**: MarkerSettingsManagerによるユーザー設定の保存・復元

### 2.3 主要クラス構成（拡張）

#### 新規・拡張クラス
- **AreaManager**: 多角形エリアデータの管理、頂点操作
- **AreaUIManager**: エリア編集用UI（ドロップダウン、ボタン、入力欄）の制御
- **RouteUIManager**: ルート編集用UIの制御（RouteManagerから分離）
- **CanvasEventHandler**: キャンバス上のマウスイベントを一括処理し、各Managerへ委譲
- **MarkerSettingsManager**: 各種マーカー（ポイント、ルート、スポット、エリア頂点）のサイズ設定管理・永続化
- **FileHandler**: プロジェクト全体の一括エクスポート/インポート機能追加

## 3. 機能仕様（追加・更新分）

### 3.1 エリア編集機能（新機能）
#### 3.1.1 エリア操作
- **追加**: キャンバス上で頂点を順次クリックして多角形を作成
- **頂点操作**:
  - クリックで頂点追加
  - ドラッグで頂点移動
  - 選択中のエリアに対してのみ操作可能
- **エリア管理**:
  - 複数エリアの作成・管理
  - エリア名の設定・変更
  - ドロップダウンによる編集対象エリアの切り替え
- **頂点順序の自動整理**: 重心を中心とした角度順に自動ソートし、きれいな多角形を維持（自己交差防止）

#### 3.1.2 視覚表示
- **頂点マーカー**: 緑色の小円（デフォルトサイズ、設定で変更可能）
- **辺の描画**: 頂点を結ぶ緑色の半透明線
- **選択状態**: 編集中のエリアを強調表示

### 3.2 マーカー設定機能（新機能）
#### 3.2.1 サイズカスタマイズ
- **設定ダイアログ**:
  - 以下の要素のサイズをピクセル単位（2px～20px）で設定可能
    - ポイントマーカー
    - 選択中のルート中間点
    - 非選択ルートの中間点
    - スポットマーカー
    - エリア頂点マーカー
- **リアルタイムプレビュー**: 設定ダイアログ内でサイズ変更を即座に確認可能
- **永続化**: 設定値はブラウザのlocalStorageに保存され、次回起動時に自動適用

#### 3.2.2 データベース設定
- **Firebase連携**: 設定ダイアログ内のタブから手動同期操作が可能
- **読み込み/保存**: クラウドデータベースとの明示的なデータ同期ボタン

### 3.3 プロジェクトデータ管理（機能強化）
#### 3.3.1 一括エクスポート/インポート
- **統合JSONファイル**: ポイント、ルート、スポット、エリアの全データを1つのJSONファイルとして保存・読み込み
- **メリット**: ファイル管理の簡素化、データ整合性の保持
- **構成**:
  - `version`: データ形式バージョン
  - `imageReference`: 対象画像ファイル名
  - `data`: 各要素（points, routes, spots, areas）の配列

#### 3.3.2 既存機能の維持
- 個別JSON（points, routes, spots）の入出力も引き続きサポート（互換性維持）

## 4. データ構造（更新）

### 4.1 プロジェクトJSON形式（新形式）
```json
{
    "version": "1.0",
    "imageReference": "map_image.png",
    "imageInfo": { "width": 2000, "height": 1500 },
    "exportedAt": "2026-02-12T10:00:00.000Z",
    "data": {
        "points": [ ... ],
        "routes": [ ... ],
        "spots": [ ... ],
        "areas": [
            {
                "areaName": "危険区域A",
                "vertices": [
                    { "x": 100, "y": 100 },
                    { "x": 200, "y": 150 },
                    { "x": 150, "y": 200 }
                ]
            }
        ]
    }
}
```

## 5. UI/UX仕様（更新）

### 5.1 編集モードの拡張
- **4つのモード**: ポイント、ルート、スポットに加え「エリア編集」モードを追加
- **モード切替**: ラジオボタンによる排他的切り替え
- **UIの最適化**: 選択モードに応じて必要なパネル（エリアリスト、頂点数など）のみを表示

### 5.2 設定アクセシビリティ
- **設定ボタン**: 画面上の常設ボタン（⚙️アイコン）からいつでもマーカーサイズやDB連携設定にアクセス可能
- **ダイアログUI**: タブ切り替え式の整理された設定画面

## 6. バージョン情報
**バージョン**: 6.0 (2026年2月版)
**主な変更点**:
- エリア編集機能の追加
- マーカーサイズ設定機能の実装
- プロジェクトデータ一括入出力の実装
- UIマネージャーの分離・再構築（RouteUIManager, AreaUIManager）
- Canvasイベントハンドリングの統合（CanvasEventHandler）

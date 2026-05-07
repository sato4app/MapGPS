# GeoReferencer データ仕様書 (JSON)

## 1. 概要
本ドキュメントは、GeoReferencer (v2.0) で使用される入力JSONファイルのフォーマット仕様を定義します。
これらのJSONファイルは、PNGハイキングマップ画像上の座標データ（ポイント、ルート、スポット、エリア）を定義するために使用され、ジオリファレンス処理（アフィン変換）によりGPS座標へ変換されます。

## 2. 共通仕様
- **文字コード**: UTF-8
- **拡張子**: `.json`
- **座標系**: 画像座標系 (ピクセル)
  - 原点 (0, 0): 画像の左上
  - X軸: 右方向へ増加
  - Y軸: 下方向へ増加
- **ファイル種別の判定**: `RouteSpotHandler.detectJsonType()` により、ファイル内容から自動判定されます。明示的な種別指定は不要です。
- **複数ファイル対応**: ポイント、ルート、スポット、エリアは別ファイルに分けて読み込めます。同種データの追記読み込みも可能です（重複は座標・IDで判定しスキップ）。

## 3. ファイルフォーマット

### 3.1 ポイント定義ファイル (Points)
ジオリファレンスの基準点となる画像上のポイントを定義します。ジオリファレンス実行時に、同IDを持つGPSポイント（Excel由来）とマッチングされます。

**判定条件**: `points` 配列が存在し、要素に `type !== "waypoint"` で `id` または `name` を持ち、`imageX` / `imageY` が定義されている。

**構造**:
```json
{
  "points": [
    {
      "id": "String (必須)",
      "name": "String (任意)",
      "imageX": "Number (必須)",
      "imageY": "Number (必須)",
      "description": "String (任意)",
      "index": "Number (任意)"
    }
  ]
}
```

**項目説明**:
| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `id` | String | ○ | ポイントID（GPS Excelの「ポイントID」と対応付け） |
| `name` | String | - | ポイント名称（地点名） |
| `imageX` | Number | ○ | 画像内X座標（ピクセル） |
| `imageY` | Number | ○ | 画像内Y座標（ピクセル） |
| `description` | String | - | 補足説明 |
| `index` | Number | - | 連番（任意） |

**例**:
```json
{
  "points": [
    { "id": "A-01", "name": "登山口", "imageX": 100, "imageY": 200 },
    { "id": "A-02", "name": "山頂",   "imageX": 500, "imageY": 600 }
  ]
}
```

### 3.2 ルート定義ファイル (Routes)
画像上のルート（経路）を定義します。

**判定条件**: `routeInfo.startPoint` と `routeInfo.endPoint` が存在し、`points` 配列の要素に `type === "waypoint"` で `imageX` / `imageY` を持つものがある。

**構造**:
```json
{
  "routeInfo": {
    "startPoint": "String (必須)",
    "endPoint": "String (必須)",
    "routeName": "String (任意)"
  },
  "points": [
    {
      "type": "waypoint (必須)",
      "imageX": "Number (必須)",
      "imageY": "Number (必須)",
      "name": "String (任意)",
      "index": "Number (任意)"
    }
  ]
}
```

**項目説明**:
| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `routeInfo.startPoint` | String | ○ | 開始ポイントID（ポイント定義ファイルの`id`またはスポットの`name`を参照） |
| `routeInfo.endPoint` | String | ○ | 終了ポイントID（同上） |
| `routeInfo.routeName` | String | - | ルート名称 |
| `points[].type` | String | ○ | 必ず `"waypoint"` |
| `points[].imageX` | Number | ○ | 中間点の画像内X座標 |
| `points[].imageY` | Number | ○ | 中間点の画像内Y座標 |
| `points[].name` | String | - | 中間点名 |
| `points[].index` | Number | - | ポイント順序 |

**例**:
```json
{
  "routeInfo": {
    "startPoint": "A-01",
    "endPoint": "A-02",
    "routeName": "表参道ルート"
  },
  "points": [
    { "type": "waypoint", "imageX": 100, "imageY": 200, "index": 1 },
    { "type": "waypoint", "imageX": 150, "imageY": 250, "index": 2 },
    { "type": "waypoint", "imageX": 200, "imageY": 300, "index": 3 }
  ]
}
```

### 3.3 スポット定義ファイル (Spots)
画像上の特定の地点（見晴台、トイレ、分岐点など）を定義します。

**判定条件**: `spots` 配列が存在し、要素に空でない `name`（文字列）と `imageX` / `imageY` を持つものがある。または、ルート要素として `name` と `imageX` / `imageY` を持つ単一オブジェクト。

**構造**:
```json
{
  "spots": [
    {
      "name": "String (必須)",
      "imageX": "Number (必須)",
      "imageY": "Number (必須)",
      "id": "String (任意)",
      "description": "String (任意)",
      "index": "Number (任意)"
    }
  ]
}
```

**項目説明**:
| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `name` | String | ○ | スポット名称（空文字不可） |
| `imageX` | Number | ○ | 画像内X座標 |
| `imageY` | Number | ○ | 画像内Y座標 |
| `id` | String | - | スポットID（指定がない場合は`name`をIDとして利用） |
| `description` | String | - | 補足説明 |
| `index` | Number | - | 連番（任意） |

**例**:
```json
{
  "spots": [
    { "name": "見晴台", "imageX": 300, "imageY": 400, "description": "絶景ポイント" },
    { "name": "トイレ", "imageX": 350, "imageY": 450 }
  ]
}
```

**単一スポット形式（スポット要素単独）**:
`spots` 配列で包まずに、`name` と `imageX` / `imageY` を持つ単一オブジェクトも受け付けられます。

```json
{
  "name": "見晴台",
  "imageX": 300,
  "imageY": 400
}
```

### 3.4 エリア定義ファイル (Areas)
画像上の特定の領域（駐車場、危険地帯など）の多角形を定義します。

**判定条件**: `areas` 配列が存在し、要素が `vertices` 配列（要素に `x` / `y` を持つ）を有する。

**構造**:
```json
{
  "areas": [
    {
      "id": "String (任意)",
      "name": "String (任意)",
      "areaName": "String (任意・nameの別名)",
      "description": "String (任意)",
      "vertices": [
        {
          "x": "Number (必須)",
          "y": "Number (必須)",
          "elevation": "Number (任意)"
        }
      ]
    }
  ]
}
```

**項目説明**:
| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `id` | String | - | エリアID（指定がない場合は `area_{index}` が自動付与） |
| `name` | String | - | エリア名称（`areaName` も可） |
| `areaName` | String | - | エリア名称（`name` の別名／後方互換用） |
| `description` | String | - | 補足説明（`name`/`areaName`が空の場合のフォールバック） |
| `vertices[].x` | Number | ○ | 頂点の画像内X座標 |
| `vertices[].y` | Number | ○ | 頂点の画像内Y座標 |
| `vertices[].elevation` | Number | - | 頂点の標高（標高取得処理で書き込まれる場合あり） |

**注意**:
- 画像座標フィールドは `imageX/imageY` ではなく `x/y` を用います（エリアのみ）。
- 頂点の閉合（最終頂点が始点と一致）は不要です。表示時に自動的に多角形として閉じられます。
- 名称が `name`、`areaName`、`description` のいずれにも有効値がない場合、`エリア {index+1}` が自動付与されます。

**例**:
```json
{
  "areas": [
    {
      "id": "area_01",
      "name": "駐車場エリア",
      "vertices": [
        { "x": 100, "y": 100 },
        { "x": 200, "y": 100 },
        { "x": 200, "y": 200 },
        { "x": 100, "y": 200 }
      ]
    }
  ]
}
```

### 3.5 複合フォーマット (Combined)
ポイント、ルート、スポット、エリアを1つのファイルにまとめて定義する形式です。

**判定条件**: `data` オブジェクトが存在し、その中に `points` / `routes` / `spots` / `areas` のいずれかの配列がある。

**構造**:
```json
{
  "version": "String (任意)",
  "imageReference": "String (任意)",
  "imageInfo": {
    "fileName": "String (任意)",
    "width": "Number (任意)",
    "height": "Number (任意)"
  },
  "data": {
    "points": [
      {
        "id": "String",
        "name": "String (任意)",
        "x": "Number",
        "y": "Number",
        "description": "String (任意)"
      }
    ],
    "routes": [
      {
        "routeName": "String (任意)",
        "startPoint": "String (任意)",
        "endPoint": "String (任意)",
        "waypoints": [
          {
            "x": "Number",
            "y": "Number"
          }
        ]
      }
    ],
    "spots": [
      {
        "name": "String",
        "x": "Number",
        "y": "Number",
        "description": "String (任意)"
      }
    ],
    "areas": [
      {
        "id": "String (任意)",
        "name": "String (任意)",
        "vertices": [
          { "x": "Number", "y": "Number" }
        ]
      }
    ]
  }
}
```

**項目説明**:
| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `version` | String | - | データフォーマットのバージョン |
| `imageReference` | String | - | 関連付けるPNG画像ファイル名 |
| `imageInfo` | Object | - | 画像メタ情報（任意） |
| `data.points[]` | Array | - | ポイント定義（座標フィールドは `x/y` または `imageX/imageY` のいずれも受け付ける） |
| `data.routes[]` | Array | - | ルート定義（`waypoints[]` 要素は `x/y` または `imageX/imageY` を受け付ける） |
| `data.spots[]` | Array | - | スポット定義（座標フィールドは `x/y` または `imageX/imageY` のいずれも受け付ける） |
| `data.areas[]` | Array | - | エリア定義（座標フィールドは `x/y`） |

**注意**:
- 複合形式では、ポイント／スポットの座標フィールドとして `x` / `y` と `imageX` / `imageY` の両方をサポートします。`imageX/imageY` が指定されていればそれを優先し、なければ `x/y` を採用します。
- ルートの中間点は単独形式（3.2節）の `points[type="waypoint"]` ではなく、`waypoints[]` 配列で定義します。

**例**:
```json
{
  "version": "1.0",
  "imageReference": "minoo-trail-map.png",
  "data": {
    "points": [
      { "id": "A-01", "name": "登山口", "x": 100, "y": 200 }
    ],
    "routes": [
      {
        "routeName": "表参道ルート",
        "startPoint": "A-01",
        "endPoint": "A-02",
        "waypoints": [
          { "x": 100, "y": 200 },
          { "x": 150, "y": 250 }
        ]
      }
    ],
    "spots": [
      { "name": "見晴台", "x": 300, "y": 400 }
    ],
    "areas": [
      {
        "id": "area_01",
        "name": "駐車場",
        "vertices": [
          { "x": 100, "y": 100 },
          { "x": 200, "y": 100 },
          { "x": 200, "y": 200 },
          { "x": 100, "y": 200 }
        ]
      }
    ]
  }
}
```

## 4. 補助データ

### 4.1 GPS座標データ（Excel）
JSONファイルではないが、ポイント定義ファイル（3.1節）の `id` と紐付けてジオリファレンスに使用します。

| 列名 | 型 | 必須 | 説明 |
|------|-----|------|------|
| `ポイントID` | String | ○ | ポイント定義ファイルの`id`に対応 |
| `名称` | String | ○ | 地点名 |
| `緯度` | Number | ○ | 緯度（10進度、-90〜90） |
| `経度` | Number | ○ | 経度（10進度、-180〜180） |
| `標高` | Number | - | 標高（メートル） |
| `備考` | String | - | 備考 |

最大読み込み行数は `CONFIG.MAX_EXCEL_ROWS` で制限されます。

## 5. 重複判定ルール
追記読み込み時の重複判定は以下のルールに従います。

| 種別 | 重複判定基準 |
|------|--------------|
| ポイント (Points) | `id` と `imageX` / `imageY` （または `x` / `y`）が一致 |
| ルート (Routes) | 開始ID／終了IDが正方向または逆方向で一致、または開始点／終了点GPSが許容誤差0.0001度以内 |
| スポット (Spots) | `imageX` / `imageY` が許容誤差0.1ピクセル以内、または GPS座標が許容誤差0.0001度以内 |
| エリア (Areas) | `id` で識別（読み込み時に再生成） |
| GPSポイント | 緯度・経度が許容誤差約1e-7度以内 |

## 6. 関連ドキュメント
- GeoJSON出力仕様: `dataspec-geojson-202604.md`
- Firebase DB仕様: `firebase-dbspec-202512.md`
- 機能仕様: `funcspec-202602.md`

---
**作成日**: 2026年4月27日
**バージョン**: 2.1

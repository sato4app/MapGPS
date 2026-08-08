# ClosureEditor データ仕様書（通行止め・通行困難地点 GeoJSON）

**バージョン:** 2.1
**最終更新日:** 2026年7月28日
**対象アプリ:** ClosureEditor
**関連:**
[機能仕様 `funcspec-202607.md`](funcspec-202607.md) /
[利用者の手引 `usersGuide-202607.md`](usersGuide-202607.md)

---

## 1. 概要

本書は **ClosureEditor** が入出力する GeoJSON ファイルのフォーマットを定義する。
MapEditor の `dataspec-geojson-closure-202606.md`（v1.0）を移管・改訂したものであり、
**本書が正本**である。

closures データは、GeoReferencer 由来のポイント／ルート／スポット／エリアを束ねた
統合 GeoJSON とは**独立した専用ファイル**として読み書きする。

### 1.1 v1.0（MapEditor 版）からの変更点

| 項目 | v1.0（MapEditor） | **v2.0 以降（ClosureEditor）** | 理由 |
|------|-------------------|---------------------------|------|
| トップレベル `version` | 出力しない | **必須で出力** | 公開に必須。minoh-hiking 側での手入力をなくす |
| `status: "draft"` | 常に出力 | **廃止**（出力しない・読み込み時に除去） | minoh-hiking が廃止済み。仕様を揃える |
| 出力ファイル名 | `Closure-YYYYMMDD_N{件数}.geojson` | **`Closure-yyyymmdd_Cx_Dy.geojson`** | 区分ごとの件数が一目で分かるようにする |
| 読み込みの判定 | `properties.type === "closure"` 必須 | **`Point` であれば取り込む**（統合GeoJSON 由来の既知 type のみ除外） | 公開ストアの geojson には `type` が無いため |
| `note` の出力 | 値があるときのみ | 同じ | － |

### 1.2 データフロー

```
現場からの報告
     │
     ▼
 [ClosureEditor]
   ① ファイル読み込み（前回の geojson。複数まとめて可）※任意
   ② 地図クリックで追加 / ドラッグで移動 / 削除
   ③ 区分・登録理由・備考を編集、標高を自動付与
   ④ ファイル出力 … 手元の控え
   │        [Closure-yyyymmdd_Cx_Dy.geojson]
   ⑤ 「公開」（POST /api/closures）
     │
     ▼
 [公開ストア（Vercel Blob）] ──→ [minoh-hiking] ユーザーの地図に表示
```

---

## 2. 共通仕様

| 項目 | 値 |
|------|----|
| フォーマット | GeoJSON (RFC 7946) |
| ルートタイプ | `FeatureCollection` |
| 拡張子 | `.geojson` |
| 文字コード | UTF-8 |
| 座標系 | WGS84 (EPSG:4326) |
| Geometry | `Point` のみ |
| 座標順序 | `[経度, 緯度]` または `[経度, 緯度, 標高(メートル)]` |
| 標高 | 標高取得済みの場合のみ3番目の要素として含む。未取得時は2要素 |

### 2.1 数値精度

- 経度・緯度・標高をいずれも **小数点以下5桁** に丸めて出力する。
- 内部に保持する座標値は読み込んだ精度を維持し、丸めは出力時のみ適用する。

### 2.2 FeatureCollection の基本構造

```json
{
  "type": "FeatureCollection",
  "version": "2026-07-28.1",
  "updatedAt": "2026-07-28T10:30:00+09:00",
  "features": [ /* closure Feature の配列 */ ]
}
```

| プロパティ | 値・型 | 必須 | 説明 |
|-----------|--------|:----:|------|
| `type` | `"FeatureCollection"` | ○ | 固定 |
| `version` | String | ○ | データのバージョン。更新のたびに変える（推奨 `日付.連番` 例 `2026-07-28.1`）。アプリのバージョン入力欄の値をそのまま書き出す |
| `updatedAt` | String (ISO 8601) | ○ | ファイル出力日時。タイムゾーンオフセット付き |
| `features` | Array | ○ | closure Feature の配列 |

> **`updatedAt` は公開時にサーバーが上書きする。**
> 公開API は POST を受けた時刻を ISO 8601 で付与し、その値が公開データの正となる
> （契約バージョン 1.0 → [機能仕様 §6](funcspec-202607.md)）。
> 出力ファイル側の値は手元の控えとしての出力日時である。

---

## 3. Feature 仕様

### 3.1 プロパティ

| プロパティ | 値・型 | 必須 | 説明 |
|-----------|--------|:----:|------|
| `type` | `"closure"` | ○ | 固定値。closures 専用ファイルであることの目印として出力する（公開API は参照しない） |
| `id` | String | ○ | 地点ID。`C-{連番2桁}` 形式（例 `C-01`）。**全地点で一意**。アプリが自動採番する |
| `name` | String | ○ | 地点名称。新規作成時の初期値は `地点{連番}` |
| `kind` | `"closed"` / `"difficult"` / `"unknown"` | ○ | 区分。未選択の場合は `"unknown"` として出力 |
| `reason` | String | 任意 | 登録理由。値があるときのみ出力。標準値は `工事` / `倒木` / `落石` |
| `note` | String | 任意 | 備考。値があるときのみ出力 |
| `relatedRoute` | String | 任意 | 関連ルートID。値があるときのみ出力（入力に含まれていれば保持して再出力。UI からの設定手段はなし） |
| `updatedAt` | String (YYYY-MM-DD) | ○ | 地点の最終更新日（追加・移動・属性編集・標高付与で更新） |

**プロパティの出力順**: `type` → `id` → `name` → `kind` →（`reason`）→（`note`）→（`relatedRoute`）→ `updatedAt`

> **`status` は廃止した。** 公開／非公開はトップレベル `version` による**ファイル全置換**で表す
> （公開されたファイル内の地点はすべてユーザーに表示される）。
> 入力ファイルに `status` が含まれていても読み込み時に取り除く。

#### `kind`（区分）の値と意味

| 値 | 意味 | ClosureEditor での表示 | minoh-hiking での表示 |
|----|------|------------------------|-----------------------|
| `closed` | 通行止め | ✖印（赤 `#DC2626`） | 赤の✖（既定） |
| `difficult` | 通行困難 | 三角形（橙 `#F59E0B`） | 橙の三角（既定） |
| `unknown` | 未選択 | `?`（灰 `#6B7280`） | **通行止めとして描画される**（`difficult` 以外は closed 扱い） |

> 未選択のまま公開すると、ユーザーには通行止めとして見える。
> ClosureEditor はファイル出力時に未選択の件数を警告する。

### 3.2 Geometry

- `type`: `"Point"`
- `coordinates`: `[経度, 緯度]` または `[経度, 緯度, 標高]`
- 標高は国土地理院標高APIから取得済みの場合のみ3番目の要素として含む。

### 3.3 出力例

```json
{
  "type": "Feature",
  "properties": {
    "type": "closure",
    "id": "C-01",
    "name": "崩落地点",
    "kind": "closed",
    "reason": "落石",
    "note": "復旧時期未定",
    "updatedAt": "2026-07-28"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [135.47204, 34.85367, 320.53]
  }
}
```

最小構成（任意項目なし・標高未取得）:

```json
{
  "type": "Feature",
  "properties": {
    "type": "closure",
    "id": "C-02",
    "name": "地点2",
    "kind": "difficult",
    "updatedAt": "2026-07-28"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [135.475, 34.858]
  }
}
```

---

## 4. 出力処理仕様（ファイル出力）

1. 内部データの全地点を対象とする。0件の場合は出力せず警告する。
2. 各 Feature を [3章](#3-feature-仕様)のスキーマ・プロパティ順に整形する。
   - `kind` が `closed` / `difficult` 以外（未選択）の場合は `"unknown"` として出力。
   - `reason` / `note` / `relatedRoute` は値があるときのみ含める。
   - 座標（経度・緯度・標高）を小数点以下5桁に丸める。
3. トップレベルに `type` / `version` / `updatedAt`（出力日時）/ `features` を持つ
   FeatureCollection として JSON 化する（インデント2）。
4. 出力後、次に該当する場合は警告する（出力自体は行う）。
   - 区分が未選択の地点がある
   - バージョンが未入力である

### 4.1 ファイル名

```
Closure-{yyyymmdd}_C{通行止め件数}_D{通行困難件数}.geojson
```

| 記号 | 内容 |
|------|------|
| `yyyymmdd` | 出力日 |
| `Cx` | `kind: "closed"` の件数 |
| `Dy` | `kind: "difficult"` の件数 |

- 区分未選択（`unknown`）は `Cx` にも `Dy` にも数えない。
- `version` は**ファイル名に含めない**（ファイル内のトップレベル `version` で管理する）。

**例**: 通行止め3件・通行困難2件・未選択1件を 2026年7月28日に出力
→ `Closure-20260728_C3_D2.geojson`

---

## 5. 読み込み処理仕様（ファイル読み込み）

1. **複数ファイルの一括選択**: 複数の `.geojson` を同時に選択でき、全ファイルの地点を
   1つの内部データに統合する。
2. **トップレベルの確認**: `type` が `"FeatureCollection"` かつ `features` が配列であること。
   満たさないファイルはエラーとして読み飛ばす。
3. **取り込み対象の判定**: `geometry.type` が `"Point"` かつ `coordinates` が配列である Feature。
   - `properties.type` が無い、または `"closure"` → 取り込む。
   - `properties.type` が統合GeoJSON 由来の既知 type
     （`ポイントGPS` / `point` / `route` / `route_waypoint` / `spot` / `スポット` / `area`）
     → **取り込まない**（統合GeoJSON を誤って選択したときの混入を防ぐ）。
   - それ以外の未知の type → 取り込む。

   > `properties.type` を必須にしないのは、公開ストアの geojson が
   > `type` を持たないため（minoh-hiking 側で廃止済み）。公開中のデータを
   > `GET /api/closures` で保存したファイルからも編集を再開できる。

4. **同一ID重複の除外**: 既存データおよび同一バッチ内と同一 `id` を持つ Feature はスキップし、
   件数を通知する。
5. **プロパティの正規化**:
   - `type` を `"closure"` に固定。
   - `id` が無い場合は `C-{連番2桁}` 形式で自動採番。
   - `kind` が `closed` / `difficult` 以外（`unknown`・空文字など）の場合は
     未選択（`?` 表示・内部値は空文字）として扱う。
   - `status` を**削除**する。
   - `name` / `reason` / `note` / `relatedRoute` / `updatedAt` / 座標は入力値をそのまま保持。
6. **バージョンの取り込み**: バージョン入力欄が空のときだけ、読み込んだファイルの
   トップレベル `version` を採用する。既に値がある場合は上書きしない。
   複数ファイルで値が食い違う場合は採用せず警告する。
7. **標高**: 読み込み時には**再取得しない**（入力ファイルの座標をそのまま使用）。
   標高は地点の新規追加時・移動時にのみ取得する。

---

## 6. 背景（ハイキングマップ）の読み込みデータ

位置指定の目印として重ねる**表示専用**のデータ。編集・出力・公開の対象にはしない。

| 項目 | 内容 |
|------|------|
| 対象 | `.geojson` / `.json`（`features` を持つ GeoJSON）。複数まとめて選択可 |
| 想定する中身 | 緊急ポイント・ハイキングルート／スポット（GeoReferencer 由来の統合 GeoJSON） |
| 使用するプロパティ | `properties.type`（`spot` / `スポット` / `route_waypoint` / それ以外）— 点の描画スタイルの判定にのみ使用 |
| Geometry | `LineString` / `MultiLineString`（ルート）、`Polygon` / `MultiPolygon`（エリア）、`Point`（ポイント）を描画 |

描画スタイルは [機能仕様 §3.2](funcspec-202607.md) を参照。

---

## 7. 公開時のデータ

「公開」で送信するボディは、[4章](#4-出力処理仕様ファイル出力)で組み立てた
FeatureCollection と**同一**である（ファイル出力と公開でデータを分けない）。

公開API の検証内容・エラー応答は **minoh-hiking 設計書 §5（契約バージョン 1.0）が正本**であり、
**本書には書き写さない**。ClosureEditor はサーバーが返した日本語メッセージをそのまま表示する。
依存している契約項目の一覧は [機能仕様 §6](funcspec-202607.md) を参照。

---

## 8. 変更履歴

| 日付 | バージョン | 内容 |
|------|-----------|------|
| 2026-07-28 | 2.1 | `dataspec-geojson-closure-202607.md` から改称・統合。背景データの仕様（§6）を追加。廃止した文書（設計書・移行検討結果）への参照を解消 |
| 2026-07-28 | 2.0 | MapEditor から ClosureEditor へ移管。トップレベル `version` を必須化、`status` を廃止、出力ファイル名を `Closure-yyyymmdd_Cx_Dy.geojson` に変更、読み込み判定を `Point` ベースに変更 |
| 2026-06-21 | 1.0 | MapEditor 用に新規作成（`dataspec-geojson-closure-202606.md`） |

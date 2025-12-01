# GeoReferencer - Firebaseデータ構造仕様書(共有プロジェクト版)

## 概要

GeoReferencerアプリケーションは、Firebase Firestoreを使用してハイキングマップ画像上のポイント、ルート、スポットデータを永続化します。本仕様書では、**共有プロジェクト**として、認証済みユーザー全員が全プロジェクトを読み書き可能なデータ構造、セキュリティルール、データの流れについて説明します。

**【重要な設計方針】**
- ユーザーID階層を削除し、`projects/{projectId}/` に直接保存
- 認証済みユーザーなら誰でも全プロジェクトを読み書き可能
- PNG画像ファイル名がプロジェクトキー(画像配布によるアクセス制御)

---

## 1. Firebase構成

### 1.1 使用サービス

| サービス | 用途 | バージョン |
|---------|------|-----------|
| **Firebase Authentication** | 匿名認証によるユーザー管理 | 10.14.1 (Compat) |
| **Cloud Firestore** | データ永続化・リアルタイム同期 | 10.14.1 (Compat) |
| **Firebase App** | Firebase初期化 | 10.14.1 (Compat) |

### 1.2 認証方式

- **匿名認証(Anonymous Authentication)**: 有効
- **メール/パスワード認証**: 未実装(将来の拡張用)
- **Google認証**: 未実装

---

## 2. Firestoreデータ構造

### 2.1 コレクション階層

```
projects/{projectId}/
  ├── (プロジェクトメタデータ)
  ├── points/{pointId}/                # 画像内ポイント座標
  │   └── (ポイントデータ)
  ├── routes/{routeId}/                # 画像内ルート座標
  │   └── (ルートデータ)
  ├── spots/{spotId}/                  # 画像内スポット座標
  │   └── (スポットデータ)
  ├── gpsPoints/{gpsPointId}/          # GPS変換済みポイント
  │   └── (GPS変換済みポイントデータ)
  ├── gpsRoutes/{gpsRouteId}/          # GPS変換済みルート
  │   └── (GPS変換済みルートデータ)
  └── gpsSpots/{gpsSpotId}/            # GPS変換済みスポット
      └── (GPS変換済みスポットデータ)
```

**階層構造の特徴:**
- **共有プロジェクト**: ユーザーID階層なし、`projects/{projectId}` に直接保存
- **全員アクセス可能**: 認証済みユーザーなら誰でも全プロジェクトを読み書き可能
- **画像ファイル名がキー**: プロジェクトID = 画像ファイル名(拡張子なし)
- **アクセス制御**: PNG画像ファイルをメンバーにのみ配布することで制限
- **サブコレクション**: ポイント、ルート、スポットはプロジェクトのサブコレクション

---

### 2.2 ドキュメント構造

#### 2.2.1 プロジェクトメタデータ

**コレクションパス**: `projects/{projectId}`

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|---|------|------|---|
| `projectName` | string | ✅ | プロジェクト名 | "箕面大滝" |
| `imageName` | string | ✅ | 画像ファイル名 | "箕面大滝.png" |
| `imageWidth` | number | ✅ | 画像の幅(ピクセル) | 1920 |
| `imageHeight` | number | ✅ | 画像の高さ(ピクセル) | 1080 |
| `createdBy` | string | ✅ | 作成者のユーザーID | "user_abc123..." |
| `createdAt` | timestamp | ✅ | 作成日時(サーバータイムスタンプ) | 2025-12-01T10:00:00Z |
| `updatedAt` | timestamp | ✅ | 更新日時(サーバータイムスタンプ) | 2025-12-01T12:30:00Z |
| `lastAccessedAt` | timestamp | ✅ | 最終アクセス日時 | 2025-12-01T12:30:00Z |
| `lastUpdatedBy` | string | ✅ | 最終更新者のユーザーID | "user_xyz789..." |
| `pointCount` | number | ✅ | ポイント数(集計用) | 15 |
| `routeCount` | number | ✅ | ルート数(集計用) | 1 |
| `spotCount` | number | ✅ | スポット数(集計用) | 8 |

**プロジェクトID**: 画像ファイル名(拡張子なし)を使用

**作成・更新タイミング**:
- 作成: 初回保存時に `createProjectMetadata()` で作成
- 更新: データ保存時に `updateProjectMetadata()` でタイムスタンプ更新
- カウンター: ポイント・ルート・スポットの追加/削除時に自動更新

---

#### 2.2.2 画像内ポイントデータ

**コレクションパス**: `projects/{projectId}/points/{pointId}`

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|---|------|------|---|
| `id` | string | ✅ | ポイントID(X-nn形式) | "A-01", "B-15" |
| `x` | number | ✅ | X座標(画像座標系) | 512 |
| `y` | number | ✅ | Y座標(画像座標系) | 768 |
| `index` | number | ⚪ | 表示順序インデックス | 0 |
| `isMarker` | boolean | ⚪ | マーカーフラグ | false |
| `createdAt` | timestamp | ✅ | 作成日時(サーバータイムスタンプ) | 2025-12-01T10:00:00Z |
| `updatedAt` | timestamp | ✅ | 更新日時(サーバータイムスタンプ) | 2025-12-01T12:30:00Z |

**ポイントID形式**: 正規表現 `/^[A-Z]-\d{2}$/`(大文字1文字 + ハイフン + 2桁数字)

**座標系**: 画像座標系(PNG画像の実ピクセル座標)

**重複チェック**: ポイントID(`id`フィールド)が一致する場合は重複と判定

---

#### 2.2.3 画像内ルートデータ

**コレクションパス**: `projects/{projectId}/routes/{routeId}`

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|---|------|------|---|
| `routeName` | string | ✅ | ルート名 | "A-01 → B-05" |
| `startPoint` | string | ✅ | 開始ポイント(ポイントIDまたはスポット名) | "A-01" |
| `endPoint` | string | ✅ | 終了ポイント(ポイントIDまたはスポット名) | "B-05" |
| `waypoints` | array | ✅ | 中間点の配列(画像座標系) | `[{x: 100, y: 200}, {x: 150, y: 250}]` |
| `waypointCount` | number | ✅ | 中間点の数(集計用) | 2 |
| `description` | string | ⚪ | ルートの説明 | "" |
| `createdAt` | timestamp | ✅ | 作成日時(サーバータイムスタンプ) | 2025-12-01T10:00:00Z |
| `updatedAt` | timestamp | ✅ | 更新日時(サーバータイムスタンプ) | 2025-12-01T12:30:00Z |

**中間点(waypoints)の構造**:
```javascript
{
  x: number,  // X座標(画像座標系)
  y: number   // Y座標(画像座標系)
}
```

**ルート名**: `{startPoint} → {endPoint}` の形式で自動生成

**重複チェック**: 開始ポイント(`startPoint`)と終了ポイント(`endPoint`)の両方が一致する場合は重複と判定

---

#### 2.2.4 画像内スポットデータ

**コレクションパス**: `projects/{projectId}/spots/{spotId}`

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|---|------|------|---|
| `name` | string | ✅ | スポット名 | "箕面大滝", "展望台" |
| `x` | number | ✅ | X座標(画像座標系) | 512 |
| `y` | number | ✅ | Y座標(画像座標系) | 768 |
| `index` | number | ⚪ | 表示順序インデックス | 0 |
| `description` | string | ⚪ | スポットの説明 | "" |
| `category` | string | ⚪ | カテゴリ | "" |
| `createdAt` | timestamp | ✅ | 作成日時(サーバータイムスタンプ) | 2025-12-01T10:00:00Z |
| `updatedAt` | timestamp | ✅ | 更新日時(サーバータイムスタンプ) | 2025-12-01T12:30:00Z |

**スポット名**: 任意の文字列(ポイントIDのような形式制限なし)

**座標系**: 画像座標系(PNG画像の実ピクセル座標)

**重複チェック**: X座標(`x`)、Y座標(`y`)の2つが一致する場合は重複と判定

---

#### 2.2.5 GPS変換済みポイントデータ

**コレクションパス**: `projects/{projectId}/gpsPoints/{gpsPointId}`

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|---|------|------|---|
| `id` | string | ✅ | ポイントID | "A-01" |
| `name` | string | ✅ | ポイント名 | "箕面大滝" |
| `coordinates` | array | ✅ | GPS座標 [経度, 緯度, 標高] | [135.472041, 34.853667, 450] |
| `source` | string | ✅ | データソース | "GPS_Excel" |
| `description` | string | ⚪ | 説明 | "緊急ポイント(Excel管理GPS値)" |
| `createdAt` | timestamp | ✅ | 作成日時(サーバータイムスタンプ) | 2025-12-01T10:00:00Z |
| `updatedAt` | timestamp | ✅ | 更新日時(サーバータイムスタンプ) | 2025-12-01T12:30:00Z |

**座標形式**: GeoJSON準拠 `[経度, 緯度, 標高]`

**データソース**:
- `GPS_Excel`: GPS座標データ(Excel)から読み込み

---

#### 2.2.6 GPS変換済みルートデータ

**コレクションパス**: `projects/{projectId}/gpsRoutes/{gpsRouteId}`

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|---|------|------|---|
| `routeName` | string | ✅ | ルート名 | "A-01 → B-05" |
| `startPoint` | string | ✅ | 開始ポイント | "A-01" |
| `endPoint` | string | ✅ | 終了ポイント | "B-05" |
| `waypoints` | array | ✅ | 中間点GPS座標配列 | `[{coordinates: [135.47, 34.85, 450]}]` |
| `description` | string | ⚪ | ルートの説明 | "ルート中間点(画像変換)" |
| `createdAt` | timestamp | ✅ | 作成日時(サーバータイムスタンプ) | 2025-12-01T10:00:00Z |
| `updatedAt` | timestamp | ✅ | 更新日時(サーバータイムスタンプ) | 2025-12-01T12:30:00Z |

**中間点(waypoints)の構造**:
```javascript
{
  coordinates: [lng, lat, elev]  // [経度, 緯度, 標高]
}
```

**標高データ**: 初期値はnull、標高取得ボタンで取得後に更新

---

#### 2.2.7 GPS変換済みスポットデータ

**コレクションパス**: `projects/{projectId}/gpsSpots/{gpsSpotId}`

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|---|------|------|---|
| `name` | string | ✅ | スポット名 | "展望台" |
| `coordinates` | array | ✅ | GPS座標 [経度, 緯度, 標高] | [135.472041, 34.853667, 450] |
| `category` | string | ⚪ | カテゴリ | "" |
| `description` | string | ⚪ | スポットの説明 | "スポット(画像変換)" |
| `createdAt` | timestamp | ✅ | 作成日時(サーバータイムスタンプ) | 2025-12-01T10:00:00Z |
| `updatedAt` | timestamp | ✅ | 更新日時(サーバータイムスタンプ) | 2025-12-01T12:30:00Z |

**座標形式**: GeoJSON準拠 `[経度, 緯度, 標高]`

**標高データ**: 初期値はnull、標高取得ボタンで取得後に更新

---

## 3. データ操作フロー

### 3.1 PNG画像読み込み時のフロー

```
1. PNG画像選択
   ↓
2. Firebase初期化確認
   ↓
3. プロジェクトID設定(PNG画像ファイル名)
   ↓
4. プロジェクトメタデータ取得
   ├── 存在しない → 「新規プロジェクトです」メッセージ
   └── 存在する → Firebaseから画像内座標データ読み込み
       ├── points取得
       ├── routes取得
       └── spots取得
   ↓
5. 地図上にマーカー表示
   ↓
6. UI更新(カウンター表示)
```

### 3.2 ジオリファレンス実行フロー

```
1. ジオリファレンスボタンクリック
   ↓
2. 前提条件チェック
   ├── PNG画像読み込み済み
   └── GPS座標データ読み込み済み
   ↓
3. ポイントIDマッチング
   ├── GPS座標のポイントID
   └── 画像内座標のポイントID
   ↓
4. アフィン変換計算(最小二乗法)
   ├── 制御点3点以上
   └── 6パラメータアフィン変換
   ↓
5. 画像位置調整
   ↓
6. ルート・スポット座標変換
   ├── 画像座標 → Web Mercator
   └── Web Mercator → GPS座標
   ↓
7. マーカー位置更新
   ↓
8. UI更新(マッチング結果表示)
```

### 3.3 Firebase保存フロー

```
1. Firebase保存ボタンクリック
   ↓
2. 前提条件チェック
   ├── Firebase接続済み
   ├── プロジェクトID設定済み
   └── ジオリファレンス実行済み
   ↓
3. GPS変換済みデータ収集
   ├── gpsPoints (GPS座標データから)
   ├── gpsRoutes (画像内ルート変換)
   └── gpsSpots (画像内スポット変換)
   ↓
4. 既存GPS変換済みデータ削除(上書き保存)
   ├── gpsPoints削除
   ├── gpsRoutes削除
   └── gpsSpots削除
   ↓
5. 新規データ保存
   ├── gpsPoints追加
   ├── gpsRoutes追加
   └── gpsSpots追加
   ↓
6. 標高未取得件数更新
   ↓
7. UI更新(保存件数表示)
```

### 3.4 標高取得フロー

```
1. 標高取得ボタンクリック
   ↓
2. チェックボックス確認
   ├── ルート中間点
   └── スポット
   ↓
3. メモリ上のマーカーから標高未設定を抽出
   ↓
4. 国土地理院API呼び出し(0.5秒間隔)
   ├── fetchElevation(lng, lat)
   └── レスポンス: {elevation: 123.4, hsrc: "5m メッシュ(レーザ)"}
   ↓
5. マーカーメタデータに標高設定
   ├── marker.__meta.elevation = elevation
   └── 進捗表示更新
   ↓
6. 標高未取得件数更新
   ↓
7. 完了メッセージ表示
```

**注意**: 標高はメモリ上のマーカーに設定されるだけで、Firebaseへの保存は「Firebase保存ボタン」クリック時に実行される。

---

## 4. セキュリティルール

### 4.1 Firestoreセキュリティルール(共有プロジェクト版)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 共有プロジェクト: 認証済みユーザーなら誰でも読み書き可能
    match /projects/{projectId} {
      // 認証必須(匿名認証でもOK)
      allow read, write: if request.auth != null;

      // ポイント・ルート・スポットのサブコレクション
      match /{document=**} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

**ルールの特徴**:
- **認証必須**: すべての操作で認証が必須(`request.auth != null`)
- **全員アクセス可能**: 認証済みユーザーなら誰でも全プロジェクトを読み書き可能
- **再帰的ルール**: `{document=**}` でサブコレクションすべてに適用
- **アクセス制御**: PNG画像ファイルをメンバーにのみ配布することでプロジェクトアクセスを制限

---

### 4.2 APIキーのセキュリティ

**HTTPリファラー制限**(Google Cloud Console):
```
https://<ユーザー名>.github.io/GeoReferencer/*
http://localhost/*
```

**API制限**:
- Identity Toolkit API
- Cloud Firestore API
- Token Service API

**公開リポジトリ対応**: HTTPリファラー制限を設定すれば、`firebase.config.js` を公開リポジトリにコミットしても安全

---

## 5. データ同期とキャッシング

### 5.1 オフライン永続化

**Firestore設定**(FirebaseClient.js:33):
```javascript
this.db.enablePersistence({synchronizeTabs: true})
```

**機能**:
- オフライン時もデータ読み書き可能
- 複数タブ間でデータ同期
- オンライン復帰時に自動同期

**制限事項**:
- ブラウザがIndexedDBをサポートしている必要あり
- 永続化失敗時はエラーを無視(オンラインのみ動作)

---

### 5.2 リアルタイムリスナー

**実装状況**: FirestoreDataManagerにリスナー機能実装済み(現在未使用)

**利用可能なメソッド**:
- `onPointsSnapshot(projectId, callback)`: ポイント変更監視
- `onRoutesSnapshot(projectId, callback)`: ルート変更監視
- `onSpotsSnapshot(projectId, callback)`: スポット変更監視

**将来の拡張**:
- リアルタイム同期機能
- 複数デバイス間のデータ共有
- 変更通知機能

---

## 6. エラーハンドリング

### 6.1 重複検出

**重複検出ロジック**(FirestoreDataManager):

| データ種別 | 重複判定条件 | メソッド |
|-----------|------------|---------|
| ポイント | `id` が一致 | `findPointById()` |
| ルート | `startPoint` と `endPoint` が両方一致 | `findRouteByStartEnd()` |
| スポット | `x`, `y` が両方一致 | `findSpotByCoords()` |

**重複時の戻り値**:
```javascript
{
  status: 'duplicate',
  type: 'point' | 'route' | 'spot',
  existing: { /* 既存データ */ },
  attempted: { /* 追加しようとしたデータ */ }
}
```

---

### 6.2 エラーメッセージ

**主なエラーケース**:

| エラー | 原因 | メッセージ |
|-------|------|-----------|
| Firebase未接続 | Firebase初期化失敗 | "Firebase接続が利用できません" |
| 画像未読み込み | 画像選択前に操作 | "PNG画像を先に読み込んでください" |
| プロジェクト不在 | 保存履歴なし | "新規プロジェクトです" |
| 権限エラー | セキュリティルール違反 | "Missing or insufficient permissions" |
| CORS エラー | file:// プロトコルでアクセス | "CORS policy" |

---

## 7. パフォーマンス最適化

### 7.1 インデックス設定(推奨)

**複合インデックス**:

1. **ポイントID検索**
   - コレクショングループ: `points`
   - フィールド: `id` (昇順)

2. **ルート検索**
   - コレクショングループ: `routes`
   - フィールド: `startPoint` (昇順), `endPoint` (昇順)

3. **スポット検索**
   - コレクショングループ: `spots`
   - フィールド: `x` (昇順), `y` (昇順)

**設定方法**: Firebase Console → Firestore Database → インデックス → 複合インデックス追加

---

### 7.2 無料枠の範囲

**Firebase Sparkプラン(無料)**:

| サービス | 上限 |
|---------|------|
| Firestore 保存容量 | 1GB |
| 読み取り | 50,000回/日 |
| 書き込み | 20,000回/日 |
| 削除 | 20,000回/日 |
| 匿名認証 | 無制限 |

**個人利用では無料枠で十分**

---

## 8. クラス構成

### 8.1 Firebaseクラス

**FirebaseClient** ([js/firebase/FirebaseClient.js](../js/firebase/FirebaseClient.js)):
- Firebase初期化
- Firestoreインスタンス取得
- オフライン永続化設定

**AuthManager** ([js/firebase/AuthManager.js](../js/firebase/AuthManager.js)):
- 匿名認証
- 認証状態監視
- ユーザーID取得

**FirestoreDataManager** ([js/firebase/FirestoreDataManager.js](../js/firebase/FirestoreDataManager.js)):
- プロジェクト管理(CRUD)
- ポイント管理(CRUD + 重複チェック)
- ルート管理(CRUD + 重複チェック)
- スポット管理(CRUD + 重複チェック)
- GPS変換済みデータ管理(CRUD)
- 標高更新機能
- リアルタイムリスナー管理

---

### 8.2 統合(app-main.js)

**グローバルスコープでの管理**:
```javascript
window.firebaseClient    // FirebaseClientインスタンス
window.authManager       // AuthManagerインスタンス
window.firestoreManager  // FirestoreDataManagerインスタンス
window.elevationFetcher  // ElevationFetcherインスタンス
```

**初期化フロー**(app-main.js:78-111):
```
1. FirebaseClient初期化
2. AuthManager初期化 + 匿名ログイン
3. FirestoreDataManager初期化
4. ElevationFetcher初期化
5. GeoReferencerApp初期化
```

---

## 9. まとめ

### 9.1 データ構造の特徴

✅ **共有プロジェクト**: ユーザーID階層なし、`projects/{projectId}` に直接保存
✅ **全員編集可能**: 認証済みユーザーなら誰でも全プロジェクトを読み書き可能
✅ **画像ファイル名がキー**: プロジェクトID = PNG画像ファイル名
✅ **アクセス制御**: 画像ファイルの配布によるアクセス制御
✅ **2段階データ**: 画像内座標 → GPS変換済みデータ
✅ **標高データ**: 国土地理院APIから取得・Firebaseに保存
✅ **重複検出**: データ種別ごとに適切な重複判定
✅ **オフライン対応**: 永続化によりオフラインでも動作
✅ **作成者記録**: `createdBy`/`lastUpdatedBy`フィールドで誰が作成・更新したかを記録

---

### 9.2 今後の拡張可能性

- リアルタイムリスナーによる同期機能
- 複数ルートのサポート
- プロジェクト一覧画面
- データエクスポート/インポート機能(GeoJSON)
- 権限管理機能(セキュリティルール要変更)

---

**作成日**: 2025年12月1日
**最終更新**: 2025年12月1日
**バージョン**: 2.0(共有プロジェクト版)
**対象コード**: GeoReferencer v1.0

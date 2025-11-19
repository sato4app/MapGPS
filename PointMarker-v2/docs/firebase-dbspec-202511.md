# PointMarker - Firebaseデータ構造仕様書（共有プロジェクト版）

## 概要

PointMarkerアプリケーションは、Firebase Firestoreを使用してハイキングマップ画像上のポイント、ルート、スポットデータを永続化します。本仕様書では、**共有プロジェクト**として、認証済みユーザー全員が全プロジェクトを読み書き可能なデータ構造、セキュリティルール、データの流れについて説明します。

**【重要な変更点】**
- ユーザーID階層を削除し、`projects/{projectId}/` に直接保存
- 認証済みユーザーなら誰でも全プロジェクトを読み書き可能
- PNG画像ファイル名がプロジェクトキー（画像配布によるアクセス制御）

---

## 1. Firebase構成

### 1.1 使用サービス

| サービス | 用途 | バージョン |
|---------|------|-----------|
| **Firebase Authentication** | 匿名認証によるユーザー管理 | 9.22.0 (Compat) |
| **Cloud Firestore** | データ永続化・リアルタイム同期 | 9.22.0 (Compat) |
| **Firebase App** | Firebase初期化 | 9.22.0 (Compat) |

### 1.2 認証方式

- **匿名認証（Anonymous Authentication）**: 有効
- **メール/パスワード認証**: 実装済み（将来の拡張用、現在未使用）
- **Google認証**: 未実装

---

## 2. Firestoreデータ構造

### 2.1 コレクション階層

```
projects/{projectId}/
  ├── (プロジェクトメタデータ)
  ├── points/{pointId}/
  │   └── (ポイントデータ)
  ├── routes/{routeId}/
  │   └── (ルートデータ)
  └── spots/{spotId}/
      └── (スポットデータ)
```

**階層構造の特徴:**
- **共有プロジェクト**: ユーザーID階層なし、`projects/{projectId}` に直接保存
- **全員アクセス可能**: 認証済みユーザーなら誰でも全プロジェクトを読み書き可能
- **画像ファイル名がキー**: プロジェクトID = 画像ファイル名（拡張子なし）
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
| `imageWidth` | number | ✅ | 画像の幅（ピクセル） | 1920 |
| `imageHeight` | number | ✅ | 画像の高さ（ピクセル） | 1080 |
| `createdBy` | string | ✅ | 作成者のユーザーID | "user_abc123..." |
| `createdAt` | timestamp | ✅ | 作成日時（サーバータイムスタンプ） | 2025-11-16T10:00:00Z |
| `updatedAt` | timestamp | ✅ | 更新日時（サーバータイムスタンプ） | 2025-11-16T12:30:00Z |
| `lastAccessedAt` | timestamp | ✅ | 最終アクセス日時 | 2025-11-16T12:30:00Z |
| `lastUpdatedBy` | string | ✅ | 最終更新者のユーザーID | "user_xyz789..." |
| `pointCount` | number | ✅ | ポイント数（集計用） | 15 |
| `routeCount` | number | ✅ | ルート数（集計用） | 1 |
| `spotCount` | number | ✅ | スポット数（集計用） | 8 |

**プロジェクトID**: 画像ファイル名（拡張子なし）を使用

**作成・更新タイミング**:
- 作成: 初回保存時に `createProjectMetadata()` で作成
- 更新: データ保存時に `updateProjectMetadata()` でタイムスタンプ更新
- カウンター: ポイント・ルート・スポットの追加/削除時に自動更新

---

#### 2.2.2 ポイントデータ

**コレクションパス**: `projects/{projectId}/points/{pointId}`

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|---|------|------|---|
| `id` | string | ✅ | ポイントID（X-nn形式） | "A-01", "B-15" |
| `x` | number | ✅ | X座標（画像座標系） | 512 |
| `y` | number | ✅ | Y座標（画像座標系） | 768 |
| `index` | number | ⚪ | 表示順序インデックス | 0 |
| `isMarker` | boolean | ⚪ | マーカーフラグ | false |
| `createdAt` | timestamp | ✅ | 作成日時（サーバータイムスタンプ） | 2025-11-16T10:00:00Z |
| `updatedAt` | timestamp | ✅ | 更新日時（サーバータイムスタンプ） | 2025-11-16T12:30:00Z |

**ポイントID形式**: 正規表現 `/^[A-Z]-\d{2}$/`（大文字1文字 + ハイフン + 2桁数字）

**座標系**: 画像座標系（PNG画像の実ピクセル座標）
- 保存時: キャンバス座標 → 画像座標に変換
- 読み込み時: 画像座標 → キャンバス座標に変換

**重複チェック**: ポイントID（`id`フィールド）が一致する場合は重複と判定

**空白ID処理**:
- 保存時: 空白ID（`id.trim() === ''`）のポイントはスキップ
- 読み込み時: 空白IDのポイントはスキップ

---

#### 2.2.3 ルートデータ

**コレクションパス**: `projects/{projectId}/routes/{routeId}`

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|---|------|------|---|
| `routeName` | string | ✅ | ルート名 | "A-01 → B-05" |
| `startPoint` | string | ✅ | 開始ポイント（ポイントIDまたはスポット名） | "A-01" |
| `endPoint` | string | ✅ | 終了ポイント（ポイントIDまたはスポット名） | "B-05" |
| `waypoints` | array | ✅ | 中間点の配列（画像座標系） | `[{x: 100, y: 200}, {x: 150, y: 250}]` |
| `waypointCount` | number | ✅ | 中間点の数（集計用） | 2 |
| `description` | string | ⚪ | ルートの説明 | "" |
| `createdAt` | timestamp | ✅ | 作成日時（サーバータイムスタンプ） | 2025-11-16T10:00:00Z |
| `updatedAt` | timestamp | ✅ | 更新日時（サーバータイムスタンプ） | 2025-11-16T12:30:00Z |

**中間点（waypoints）の構造**:
```javascript
{
  x: number,  // X座標（画像座標系）
  y: number   // Y座標（画像座標系）
}
```

**ルート名**: `{startPoint} → {endPoint}` の形式で自動生成

**重複チェック**: 開始ポイント（`startPoint`）と終了ポイント（`endPoint`）の両方が一致する場合は重複と判定

**現在の制限**: アプリケーション側では1プロジェクトにつき1ルートのみサポート（Firestore側では複数ルート保存可能だが、読み込み時は最初のルートのみ使用）

---

#### 2.2.4 スポットデータ

**コレクションパス**: `projects/{projectId}/spots/{spotId}`

| フィールド名 | 型 | 必須 | 説明 | 例 |
|------------|---|------|------|---|
| `name` | string | ✅ | スポット名 | "箕面大滝", "展望台" |
| `x` | number | ✅ | X座標（画像座標系） | 512 |
| `y` | number | ✅ | Y座標（画像座標系） | 768 |
| `index` | number | ⚪ | 表示順序インデックス | 0 |
| `description` | string | ⚪ | スポットの説明 | "" |
| `category` | string | ⚪ | カテゴリ | "" |
| `createdAt` | timestamp | ✅ | 作成日時（サーバータイムスタンプ） | 2025-11-16T10:00:00Z |
| `updatedAt` | timestamp | ✅ | 更新日時（サーバータイムスタンプ） | 2025-11-16T12:30:00Z |

**スポット名**: 任意の文字列（ポイントIDのような形式制限なし）

**座標系**: 画像座標系（PNG画像の実ピクセル座標）
- 保存時: キャンバス座標 → 画像座標に変換
- 読み込み時: 画像座標 → キャンバス座標に変換

**重複チェック**: スポット名（`name`）、X座標（`x`）、Y座標（`y`）の3つすべてが一致する場合は重複と判定

**空白名処理**:
- 保存時: 空白名（`name.trim() === ''`）のスポットはスキップ
- 読み込み時: 空白名のスポットはスキップ

---

## 3. データ操作フロー

### 3.1 保存フロー（saveToFirebase）

```
1. バリデーション
   ├── Firebase接続確認
   ├── 画像読み込み確認
   └── ポイントID重複チェック

2. プロジェクトメタデータ処理
   ├── プロジェクトID取得（画像ファイル名）
   ├── メタデータ作成/更新
   └── 既存データ全削除（上書き保存）

3. ポイント保存
   ├── 空白IDスキップ
   ├── キャンバス座標 → 画像座標変換
   ├── Firestore追加（addPoint）
   └── カウンター更新（pointCount++）

4. ルート保存
   ├── 開始・終了ポイント確認
   ├── 中間点の座標変換（キャンバス → 画像）
   ├── Firestore追加（addRoute）
   └── カウンター更新（routeCount++）

5. スポット保存
   ├── 空白名スキップ
   ├── キャンバス座標 → 画像座標変換
   ├── Firestore追加（addSpot）
   └── カウンター更新（spotCount++）

6. 結果表示
   └── 保存件数メッセージ
```

**重要な仕様**:
- **上書き保存**: 既存データを全削除してから新規データを保存
- **座標変換**: すべての座標は画像座標系で保存（可逆性保証）
- **空白データ除外**: 空白ID/名のデータは保存しない

---

### 3.2 読み込みフロー（loadFromFirebase）

```
1. バリデーション
   ├── Firebase接続確認
   ├── 画像読み込み確認
   └── プロジェクト存在確認

2. 既存データクリア確認
   ├── 既存データ有無チェック
   ├── ユーザー確認ダイアログ
   └── データクリア実行

3. ポイント読み込み
   ├── Firestoreから取得（getPoints）
   ├── 空白IDスキップ
   ├── 画像座標 → キャンバス座標変換
   └── PointManager追加

4. ルート読み込み
   ├── Firestoreから取得（getRoutes）
   ├── 最初のルートのみ使用
   ├── 開始・終了ポイント設定
   ├── 中間点の座標変換（画像 → キャンバス）
   └── RouteManager追加

5. スポット読み込み
   ├── Firestoreから取得（getSpots）
   ├── 空白名スキップ
   ├── 画像座標 → キャンバス座標変換
   └── SpotManager追加

6. UI更新
   ├── キャンバス再描画
   ├── ポップアップ位置更新
   └── 読み込み件数メッセージ
```

**重要な仕様**:
- **上書き確認**: 既存データがある場合は確認ダイアログ表示
- **座標変換**: 保存時と逆の変換で元の表示位置を復元
- **1ルート制限**: 複数ルートが保存されていても最初の1件のみ読み込み

---

## 4. セキュリティルール

### 4.1 Firestoreセキュリティルール（共有プロジェクト版）

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 共有プロジェクト: 認証済みユーザーなら誰でも読み書き可能
    match /projects/{projectId} {
      // 認証必須（匿名認証でもOK）
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
- **認証必須**: すべての操作で認証が必須（`request.auth != null`）
- **全員アクセス可能**: 認証済みユーザーなら誰でも全プロジェクトを読み書き可能
- **再帰的ルール**: `{document=**}` でサブコレクションすべてに適用
- **アクセス制御**: PNG画像ファイルをメンバーにのみ配布することでプロジェクトアクセスを制限

---

### 4.2 APIキーのセキュリティ

**HTTPリファラー制限**（Google Cloud Console）:
```
https://<ユーザー名>.github.io/PointMarker/*
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

**Firestore設定**（FirebaseClient.js:34）:
```javascript
this.db.enablePersistence({synchronizeTabs: true})
```

**機能**:
- オフライン時もデータ読み書き可能
- 複数タブ間でデータ同期
- オンライン復帰時に自動同期

**制限事項**:
- 複数タブ同時起動時は永続化無効
- ブラウザがIndexedDBをサポートしている必要あり

---

### 5.2 リアルタイムリスナー

**実装状況**: FirestoreDataManagerにリスナー機能実装済み（現在未使用）

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

**重複検出ロジック**（FirestoreDataManager）:

| データ種別 | 重複判定条件 | メソッド |
|-----------|------------|---------|
| ポイント | `id` が一致 | `findPointById()` |
| ルート | `startPoint` と `endPoint` が両方一致 | `findRouteByStartEnd()` |
| スポット | `name`, `x`, `y` が全て一致 | `findSpotByNameAndCoords()` |

**重複時の戻り値**:
```javascript
{
  status: 'duplicate',
  type: 'point' | 'route' | 'spot',
  existing: { /* 既存データ */ },
  attempted: { /* 追加しようとしたデータ */ }
}
```

**アプリ側の処理**: 現在は重複を許容せず、保存前に重複チェック実施

---

### 6.2 エラーメッセージ

**主なエラーケース**:

| エラー | 原因 | メッセージ |
|-------|------|-----------|
| Firebase未接続 | Firebase初期化失敗 | "Firebase接続が利用できません" |
| 画像未読み込み | 画像選択前に操作 | "先に画像を読み込んでください" |
| プロジェクト不在 | 保存履歴なし | "プロジェクト「xxx」のデータが見つかりません" |
| 権限エラー | セキュリティルール違反 | "Missing or insufficient permissions" |
| CORS エラー | file:// プロトコルでアクセス | "CORS policy" |

---

## 7. パフォーマンス最適化

### 7.1 インデックス設定（推奨）

**複合インデックス**:

1. **ポイントID検索**
   - コレクショングループ: `points`
   - フィールド: `id` (昇順)

2. **ルート検索**
   - コレクショングループ: `routes`
   - フィールド: `startPoint` (昇順), `endPoint` (昇順)

3. **スポット検索**
   - コレクショングループ: `spots`
   - フィールド: `name` (昇順), `x` (昇順), `y` (昇順)

**設定方法**: Firebase Console → Firestore Database → インデックス → 複合インデックス追加

---

### 7.2 無料枠の範囲

**Firebase Sparkプラン（無料）**:

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

**FirebaseClient** ([js/firebase/FirebaseClient.js](js/firebase/FirebaseClient.js)):
- Firebase初期化
- Firestoreインスタンス取得
- オフライン永続化設定

**AuthManager** ([js/firebase/AuthManager.js](js/firebase/AuthManager.js)):
- 匿名認証
- メール/パスワード認証（将来の拡張用）
- 認証状態監視

**FirestoreDataManager** ([js/firebase/FirestoreDataManager.js](js/firebase/FirestoreDataManager.js)):
- プロジェクト管理（CRUD）
- ポイント管理（CRUD + 重複チェック）
- ルート管理（CRUD + 重複チェック）
- スポット管理（CRUD + 重複チェック）
- リアルタイムリスナー管理

---

### 8.2 統合（app.js）

**グローバルスコープでの管理**:
```javascript
window.firebaseClient    // FirebaseClientインスタンス
window.authManager       // AuthManagerインスタンス
window.firestoreManager  // FirestoreDataManagerインスタンス
```

**初期化フロー**（index.html:183-213）:
```
1. FirebaseClient初期化
2. AuthManager初期化 + 匿名ログイン
3. FirestoreDataManager初期化
4. PointMarkerApp初期化
```

---

## 9. 座標系の管理

### 9.1 座標系の種類

PointMarkerでは5種類の座標系を使用しますが、Firestoreに保存する座標は**画像座標系**のみです。

| 座標系 | 説明 | Firestore保存 |
|-------|------|-------------|
| 画像座標系 | PNG画像の実ピクセル座標 | ✅ **保存する** |
| キャンバス座標系 | 表示用スケール座標 | ❌ 保存しない |
| スクリーン座標系 | ブラウザ内絶対位置 | ❌ 保存しない |
| マウス座標系 | イベントから得られる座標 | ❌ 保存しない |
| ズーム・パン座標系 | 変換行列適用後の座標 | ❌ 保存しない |

---

### 9.2 座標変換

**保存時** (キャンバス座標 → 画像座標):
```javascript
const imageCoords = CoordinateUtils.canvasToImage(
    point.x, point.y,
    canvasWidth, canvasHeight,
    imageWidth, imageHeight
);
```

**読み込み時** (画像座標 → キャンバス座標):
```javascript
const canvasCoords = CoordinateUtils.imageToCanvas(
    point.x, point.y,
    canvasWidth, canvasHeight,
    imageWidth, imageHeight
);
```

**重要**: 画像座標系で保存することで、異なる画面サイズやズーム倍率でも正確に元の位置を復元可能

---

## 10. まとめ

### 10.1 データ構造の特徴

✅ **共有プロジェクト**: ユーザーID階層なし、`projects/{projectId}` に直接保存
✅ **全員編集可能**: 認証済みユーザーなら誰でも全プロジェクトを読み書き可能
✅ **画像ファイル名がキー**: プロジェクトID = PNG画像ファイル名
✅ **アクセス制御**: 画像ファイルの配布によるアクセス制御
✅ **座標の可逆性**: 画像座標系で保存により完全な復元が可能
✅ **重複検出**: データ種別ごとに適切な重複判定
✅ **オフライン対応**: 永続化によりオフラインでも動作
✅ **共同編集**: 複数ユーザーが同時に編集可能
✅ **作成者記録**: `createdBy`/`lastUpdatedBy`フィールドで誰が作成・更新したかを記録

---

### 10.2 今後の拡張可能性

- リアルタイムリスナーによる同期機能
- 複数ルートのサポート
- プロジェクト一覧画面
- データエクスポート/インポート機能
- 共同編集機能（セキュリティルール要変更）

---

**作成日**: 2025年11月16日
**最終更新**: 2025年11月16日
**バージョン**: 2.0（共有プロジェクト版）
**対象コード**: PointMarker v5.3+

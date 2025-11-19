# 共有プロジェクトへの移行ガイド

## 概要

PointMarkerを個人用（ユーザー別データ分離）から**共有プロジェクト**（全員がアクセス可能）に変更しました。

---

## 変更内容

### 1. データ構造の変更

**変更前（個人用）:**
```
users/{userId}/projects/{projectId}/
  ├── points/*
  ├── routes/*
  └── spots/*
```

**変更後（共有プロジェクト）:**
```
projects/{projectId}/
  ├── points/*
  ├── routes/*
  └── spots/*
```

### 2. アクセス権限の変更

| 項目 | 変更前 | 変更後 |
|------|--------|--------|
| データ分離 | ユーザーごとに完全分離 | 全プロジェクト共有 |
| 読み取り | 自分のデータのみ | 認証済みなら全員 |
| 書き込み | 自分のデータのみ | 認証済みなら全員 |
| アクセス制御 | ユーザーIDで制限 | **PNG画像ファイル配布で制限** |

### 3. プロジェクトメタデータの追加フィールド

| フィールド | 説明 |
|-----------|------|
| `createdBy` | 最初に作成したユーザーID |
| `lastUpdatedBy` | 最後に更新したユーザーID |

---

## セットアップ手順

### ステップ1: Firestoreセキュリティルールの変更

**⚠️ 必須作業**: Firebase Consoleでセキュリティルールを変更してください。

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. プロジェクトを選択
3. 左メニュー「Firestore Database」→「ルール」タブ
4. 以下のルールに置き換え：

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

5. 「公開」ボタンをクリック

**セキュリティルールファイル**: [docs/FIRESTORE_SECURITY_RULES.txt](FIRESTORE_SECURITY_RULES.txt) にも同じルールがあります。

---

### ステップ2: 既存データの移行（必要な場合）

**既存データがある場合**: 旧データ構造（`users/{userId}/projects/*`）から新データ構造（`projects/*`）へ手動で移行が必要です。

#### 移行方法A: JSON経由での移行（推奨）

1. **旧バージョンのアプリで各プロジェクトをJSONエクスポート**
   - 画像を開く
   - 「JSON出力」ボタンでデータをダウンロード

2. **新バージョンのアプリでJSONインポート**
   - 同じ画像を開く
   - 「JSON読み込み」ボタンでインポート
   - 「Firebaseに保存」ボタンで新データ構造に保存

#### 移行方法B: Firebase Consoleでの直接移動

1. Firebase Console → Firestore Database
2. `users/{userId}/projects/{projectId}` のデータをコピー
3. 新しい `projects/{projectId}` に貼り付け
4. 旧データを削除

---

### ステップ3: アプリの動作確認

#### 確認1: プロジェクトの保存

1. PNG画像を選択（例: `test-map.png`）
2. ポイント、ルート、スポットをマーキング
3. 「Firebaseに保存」ボタンをクリック
4. Firebase Console → Firestore Database で確認
   - `projects/test-map/` にデータが保存されていることを確認
   - `users/{userId}/` 配下には**何も保存されていない**ことを確認

#### 確認2: 別PCでの読み込み（共有確認）

1. **PC-A**: 上記の手順でデータを保存
2. **PC-B**: 同じアプリを開く（別のブラウザ・別のPC）
3. **PC-B**: 同じPNG画像（`test-map.png`）を選択
4. **PC-B**: 「Firebaseから読み込み」ボタンをクリック
5. **結果**: PC-Aで保存したデータが読み込まれることを確認 ✅

#### 確認3: 共同編集

1. **PC-A**: データを編集して保存
2. **PC-B**: 「Firebaseから読み込み」で最新データを取得
3. **PC-B**: さらに編集して保存
4. **PC-A**: 「Firebaseから読み込み」でPC-Bの変更を取得
5. **結果**: 双方向の編集が可能であることを確認 ✅

---

## セキュリティの考え方

### PNG画像ファイルによるアクセス制御

**重要な原則**:
- プロジェクトID = PNG画像ファイル名（拡張子なし）
- 画像ファイルを持っている人のみがプロジェクトにアクセス可能
- 画像ファイルを**メンバーにのみ配布**することでアクセスを制限

**例**:
- `箕面大滝.png` というファイルをチームメンバーに配布
- ファイルを持っている人だけが「箕面大滝」プロジェクトにアクセス可能
- ファイルを持っていない第三者はプロジェクトIDを知らないためアクセス不可

**セキュリティレベル**:
- ✅ 同じチーム内での共同作業: 十分なセキュリティ
- ⚠️ 機密性の高いデータ: 追加の認証機能が必要（将来の拡張）

---

## トラブルシューティング

### エラー: "Missing or insufficient permissions"

**原因**: Firestoreセキュリティルールが変更されていない

**解決方法**:
1. Firebase Console → Firestore Database → ルール
2. 上記の共有プロジェクト用ルールに変更
3. 「公開」をクリック

---

### データが読み込めない

**原因1**: 別のユーザーIDで保存されたデータ（旧データ構造）

**解決方法**:
- 「既存データの移行」セクションを参照してJSON経由で移行

**原因2**: 画像ファイル名が異なる

**解決方法**:
- 保存時と同じファイル名のPNG画像を選択

---

### 他のPCで読み込めない

**確認事項**:
1. ✅ Firestoreセキュリティルールが変更済みか
2. ✅ 同じPNG画像ファイル名を使用しているか
3. ✅ Firebase Consoleでデータが `projects/{projectId}/` に保存されているか

---

## 関連ドキュメント

- [firebase-dbspec-202511.md](firebase-dbspec-202511.md) - 詳細なデータ構造仕様書
- [FIREBASE_SETUP.md](FIREBASE_SETUP.md) - Firebase初期セットアップガイド
- [FIRESTORE_SECURITY_RULES.txt](FIRESTORE_SECURITY_RULES.txt) - セキュリティルール

---

**更新日**: 2025年11月16日
**バージョン**: 1.0

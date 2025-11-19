# Firebase セットアップガイド（共有プロジェクト版）

このガイドでは、PointMarkerアプリでFirebaseを使用するための環境構築手順を説明します。

**【重要】共有プロジェクト設定**
- ユーザーID階層なし、`projects/{projectId}` に直接保存
- 認証済みユーザーなら誰でも全プロジェクトを読み書き可能
- PNG画像ファイル名がプロジェクトキー（画像配布によるアクセス制御）

## 1. Firebaseプロジェクトの作成

### 1.1 Firebaseコンソールにアクセス
1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. Googleアカウントでログイン
3. 「プロジェクトを追加」をクリック

### 1.2 プロジェクト情報の入力
1. **プロジェクト名**: `PointMarker` （または任意の名前）
2. **Google アナリティクス**: 無効でOK（オプション）
3. 「プロジェクトを作成」をクリック

## 2. Firebaseアプリの登録

### 2.1 Webアプリの追加
1. プロジェクトのダッシュボードで「ウェブ」アイコン（`</>`）をクリック
2. **アプリのニックネーム**: `PointMarker Web`
3. **Firebase Hosting**: チェック不要
4. 「アプリを登録」をクリック

### 2.2 設定情報のコピー
表示されるFirebase SDKスニペットから、以下の情報をコピーします：

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy.....................",
  authDomain: "pointmarker-xxxxx.firebaseapp.com",
  projectId: "pointmarker-xxxxx",
  storageBucket: "pointmarker-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

### 2.3 firebase.config.js の作成
1. PointMarkerプロジェクトの `js/firebase/` ディレクトリに `firebase.config.js` を作成
2. 上記の設定情報を以下の形式で貼り付け：

```javascript
// Firebase設定情報
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

**⚠️ セキュリティ注意:**
- GitHub Pagesで公開する場合は、Google Cloud ConsoleでHTTPリファラー制限を設定してください
- 制限設定: `https://<ユーザー名>.github.io/PointMarker/*` と `http://localhost/*`
- APIキーに適切な制限をかければ、公開リポジトリにコミットしても安全です

## 3. Firebase Authentication の設定

### 3.1 認証方法の有効化
1. Firebaseコンソールで「Authentication」→「Sign-in method」を選択
2. 「匿名」を選択して「有効にする」をON
3. 「保存」をクリック

**推奨設定:**
- ✅ **匿名認証**: 有効（ユーザー登録不要で使える）
- ⚪ **メール/パスワード**: オプション（将来的にアカウント機能を追加する場合）
- ⚪ **Google**: オプション（Googleアカウントでログインする場合）

## 4. Cloud Firestore の設定

### 4.1 Firestoreデータベースの作成
1. Firebaseコンソールで「Firestore Database」を選択
2. 「データベースを作成」をクリック
3. **セキュリティルール**: 「本番環境モードで開始」を選択
4. **ロケーション**: `asia-northeast1`（東京）を選択
5. 「有効にする」をクリック

### 4.2 セキュリティルールの設定（共有プロジェクト版）

**⚠️ 重要**: 共有プロジェクト用のセキュリティルールを設定してください

1. 「ルール」タブを選択
2. 以下のルールに置き換え：

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

3. 「公開」をクリック

**セキュリティの説明**:
- 認証済みユーザーなら誰でも全プロジェクトを読み書き可能
- PNG画像ファイルをメンバーにのみ配布することでアクセスを制限
- 画像ファイル名を知らない第三者はデータにアクセス不可

### 4.3 インデックスの作成（オプション）
パフォーマンス向上のため、以下のインデックスを作成します：

1. 「インデックス」タブを選択
2. 「複合」→「インデックスを追加」
3. 以下の設定で3つのインデックスを作成：

**インデックス1: ポイントID検索**
- コレクショングループ: `points`
- フィールド1: `id` (昇順)
- クエリスコープ: コレクション

**インデックス2: ルート検索**
- コレクショングループ: `routes`
- フィールド1: `startPoint` (昇順)
- フィールド2: `endPoint` (昇順)
- クエリスコープ: コレクション

**インデックス3: スポット検索**
- コレクショングループ: `spots`
- フィールド1: `name` (昇順)
- フィールド2: `x` (昇順)
- フィールド3: `y` (昇順)
- クエリスコープ: コレクション

## 5. 動作確認

### 5.1 ローカルサーバーの起動
```bash
python -m http.server 8000
# または
npx serve .
```

### 5.2 ブラウザでアクセス
```
http://localhost:8000
```

### 5.3 認証の確認
1. アプリを開くと自動的に匿名ログイン
2. Firebaseコンソールの「Authentication」→「Users」で匿名ユーザーが作成されていることを確認

### 5.4 データ保存の確認
1. 画像を選択
2. ポイントを追加
3. Firebaseコンソールの「Firestore Database」でデータが保存されていることを確認

## 6. トラブルシューティング

### エラー: "Firebase: Firebase App named '[DEFAULT]' already exists"
→ ブラウザをリロードしてください

### エラー: "Missing or insufficient permissions"
→ Firestoreセキュリティルールを確認してください

### エラー: "CORS policy"
→ ローカルサーバー経由でアクセスしているか確認してください（file://では動作しません）

### データが保存されない
→ ブラウザのコンソールでエラーメッセージを確認してください

## 7. 無料枠の確認

Firebaseの無料枠（Sparkプラン）で利用可能な範囲：

- **Firestore**:
  - 保存容量: 1GB
  - 読み取り: 50,000/日
  - 書き込み: 20,000/日
  - 削除: 20,000/日

- **Authentication**:
  - 匿名認証: 無制限

**個人利用では無料枠で十分です。**

## 8. セキュリティのベストプラクティス

1. **APIキーの管理**
   - Google Cloud ConsoleでHTTPリファラー制限を設定
   - 許可ドメイン: `https://<ユーザー名>.github.io/PointMarker/*` と `http://localhost/*`
   - API制限: Identity Toolkit API, Cloud Firestore API, Token Service API
   - 制限を設定すれば、`firebase.config.js` を公開リポジトリにコミットしても安全

2. **セキュリティルール**
   - 本番環境では必ず適切なセキュリティルールを設定
   - `allow read, write: if true;` は絶対に使わない
   - 認証済みユーザーのみアクセス可能にする

3. **定期的な確認**
   - Firebaseコンソールで使用量を定期的に確認
   - 異常なアクセスがないかチェック

---

**セットアップ完了！**

これでPointMarkerアプリでFirebaseを使用する準備が整いました。

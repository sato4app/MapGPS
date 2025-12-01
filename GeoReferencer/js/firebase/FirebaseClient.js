/**
 * FirebaseClient.js
 * Firebase初期化とFirestore接続を管理するクラス
 */

export class FirebaseClient {
    constructor(config) {
        this.config = config;
        this.app = null;
        this.db = null;
        this.initialized = false;
    }

    /**
     * Firebaseを初期化
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            // Firebase アプリの初期化
            this.app = firebase.initializeApp(this.config);

            // Firestore インスタンスの取得
            this.db = firebase.firestore();

            // Firestore設定（オフライン永続化を有効化）
            // 注: enablePersistence()は将来非推奨となる予定だが、Compat版SDKでは
            // 新しいFirestoreSettings.cacheがサポートされていないため、現行のAPIを使用
            this.db.enablePersistence({synchronizeTabs: true})
                .catch(() => {
                    // エラーは無視（永続化が無効でも動作可能）
                });

            this.initialized = true;
        } catch (error) {
            console.error('Firebase initialization failed:', error);
            throw new Error('Firebaseの初期化に失敗しました: ' + error.message);
        }
    }

    /**
     * Firestoreインスタンスを取得
     * @returns {firebase.firestore.Firestore}
     */
    getFirestore() {
        if (!this.initialized) {
            throw new Error('Firebase is not initialized. Call initialize() first.');
        }
        return this.db;
    }

    /**
     * Firebase Appインスタンスを取得
     * @returns {firebase.app.App}
     */
    getApp() {
        if (!this.initialized) {
            throw new Error('Firebase is not initialized. Call initialize() first.');
        }
        return this.app;
    }

    /**
     * 初期化状態を確認
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Firebaseタイムスタンプを取得
     * @returns {firebase.firestore.FieldValue}
     */
    getServerTimestamp() {
        return firebase.firestore.FieldValue.serverTimestamp();
    }

    /**
     * 配列要素を追加するFieldValueを取得
     * @param {*} element - 追加する要素
     * @returns {firebase.firestore.FieldValue}
     */
    arrayUnion(element) {
        return firebase.firestore.FieldValue.arrayUnion(element);
    }

    /**
     * 配列要素を削除するFieldValueを取得
     * @param {*} element - 削除する要素
     * @returns {firebase.firestore.FieldValue}
     */
    arrayRemove(element) {
        return firebase.firestore.FieldValue.arrayRemove(element);
    }
}

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
            console.warn('Firebase is already initialized');
            return;
        }

        try {
            // Firebase アプリの初期化
            this.app = firebase.initializeApp(this.config);

            // Firestore インスタンスの取得
            this.db = firebase.firestore();

            // Firestore設定（オフライン永続化は無効化）
            // 注: enablePersistence() は古いSDKバージョンのデータとの互換性問題を引き起こすため、
            // メモリキャッシュのみを使用します。これによりアプリは正常に動作します。
            // 必要に応じて、ブラウザのIndexedDBをクリアして永続化を有効にできます。
            console.log('Firestore: メモリキャッシュモードで動作（永続化は無効）');

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

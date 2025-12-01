/**
 * AuthManager.js
 * Firebase Authentication を管理するクラス
 */

export class AuthManager {
    constructor(firebaseApp) {
        this.app = firebaseApp;
        this.auth = firebase.auth();
        this.currentUser = null;
        this.authStateCallbacks = [];
    }

    /**
     * 匿名ログインを実行
     * @returns {Promise<firebase.User>}
     */
    async signInAnonymously() {
        try {
            const result = await this.auth.signInAnonymously();
            this.currentUser = result.user;
            return this.currentUser;
        } catch (error) {
            console.error('匿名ログイン失敗:', error);
            throw new Error('匿名ログインに失敗しました: ' + error.message);
        }
    }

    /**
     * メール/パスワードでログイン（将来の拡張用）
     * @param {string} email - メールアドレス
     * @param {string} password - パスワード
     * @returns {Promise<firebase.User>}
     */
    async signInWithEmail(email, password) {
        try {
            const result = await this.auth.signInWithEmailAndPassword(email, password);
            this.currentUser = result.user;
            return this.currentUser;
        } catch (error) {
            console.error('メールログイン失敗:', error);
            throw new Error('ログインに失敗しました: ' + error.message);
        }
    }

    /**
     * メール/パスワードで新規登録（将来の拡張用）
     * @param {string} email - メールアドレス
     * @param {string} password - パスワード
     * @returns {Promise<firebase.User>}
     */
    async signUpWithEmail(email, password) {
        try {
            const result = await this.auth.createUserWithEmailAndPassword(email, password);
            this.currentUser = result.user;
            return this.currentUser;
        } catch (error) {
            console.error('新規登録失敗:', error);
            throw new Error('新規登録に失敗しました: ' + error.message);
        }
    }

    /**
     * ログアウト
     * @returns {Promise<void>}
     */
    async signOut() {
        try {
            await this.auth.signOut();
            this.currentUser = null;
        } catch (error) {
            console.error('ログアウト失敗:', error);
            throw new Error('ログアウトに失敗しました: ' + error.message);
        }
    }

    /**
     * 認証状態の変更を監視
     * @param {Function} callback - 認証状態変更時のコールバック関数
     * @returns {Function} unsubscribe関数
     */
    onAuthStateChanged(callback) {
        return this.auth.onAuthStateChanged((user) => {
            this.currentUser = user;
            callback(user);
        });
    }

    /**
     * 現在のユーザーを取得
     * @returns {firebase.User|null}
     */
    getCurrentUser() {
        return this.currentUser || this.auth.currentUser;
    }

    /**
     * ユーザーIDを取得
     * @returns {string|null}
     */
    getUserId() {
        const user = this.getCurrentUser();
        return user ? user.uid : null;
    }

    /**
     * ログイン状態を確認
     * @returns {boolean}
     */
    isSignedIn() {
        return this.getCurrentUser() !== null;
    }

    /**
     * 匿名ユーザーかどうかを確認
     * @returns {boolean}
     */
    isAnonymous() {
        const user = this.getCurrentUser();
        return user ? user.isAnonymous : false;
    }

    /**
     * ユーザー情報を取得
     * @returns {Object|null}
     */
    getUserInfo() {
        const user = this.getCurrentUser();
        if (!user) {
            return null;
        }

        return {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            isAnonymous: user.isAnonymous,
            creationTime: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime
        };
    }

    /**
     * 認証状態のコールバックを登録
     * @param {Function} callback - コールバック関数
     */
    addAuthStateCallback(callback) {
        this.authStateCallbacks.push(callback);
    }

    /**
     * すべての認証状態コールバックを実行
     * @param {firebase.User|null} user - ユーザーオブジェクト
     */
    notifyAuthStateChanged(user) {
        this.authStateCallbacks.forEach(callback => {
            try {
                callback(user);
            } catch (error) {
                console.error('認証状態コールバックエラー:', error);
            }
        });
    }
}

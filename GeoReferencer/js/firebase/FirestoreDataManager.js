/**
 * FirestoreDataManager.js
 * Firestoreデータ操作と重複検出を管理するクラス
 *
 * 【共有設定】
 * - ユーザーID階層なし: projects/{projectId}/ に直接保存
 * - 認証済みユーザーなら誰でも全プロジェクトを読み書き可能
 * - PNG画像ファイル名がプロジェクトキー
 */

export class FirestoreDataManager {
    constructor(firestore, userId) {
        this.db = firestore;
        this.userId = userId; // 認証確認用のみ（パス構築には使用しない）
        this.currentProjectId = null;
        this.listeners = new Map(); // リアルタイムリスナーの管理
    }

    /**
     * プロジェクトIDを設定
     * @param {string} projectId - プロジェクトID
     */
    setCurrentProject(projectId) {
        this.currentProjectId = projectId;
    }

    /**
     * 現在のプロジェクトIDを取得
     * @returns {string}
     */
    getCurrentProjectId() {
        return this.currentProjectId;
    }

    // ========================================
    // プロジェクト管理
    // ========================================

    /**
     * プロジェクトのメタデータを作成
     * @param {string} projectId - プロジェクトID
     * @param {Object} metadata - メタデータ
     * @returns {Promise<void>}
     */
    async createProjectMetadata(projectId, metadata) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .set({
                    projectName: metadata.projectName || 'Untitled Project',
                    imageName: metadata.imageName || '',
                    imageWidth: metadata.imageWidth || 0,
                    imageHeight: metadata.imageHeight || 0,
                    createdBy: this.userId, // 最初に作成したユーザーID
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastAccessedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastUpdatedBy: this.userId, // 最後に更新したユーザーID
                    pointCount: 0,
                    routeCount: 0,
                    spotCount: 0
                });

        } catch (error) {
            console.error('プロジェクトメタデータ作成失敗:', error);
            throw new Error('プロジェクトの作成に失敗しました: ' + error.message);
        }
    }

    /**
     * プロジェクトのメタデータを更新
     * @param {string} projectId - プロジェクトID
     * @param {Object} updates - 更新データ
     * @returns {Promise<void>}
     */
    async updateProjectMetadata(projectId, updates) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .update({
                    ...updates,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastUpdatedBy: this.userId // 最後に更新したユーザーID
                });
        } catch (error) {
            console.error('プロジェクトメタデータ更新失敗:', error);
            throw error;
        }
    }

    /**
     * プロジェクトのメタデータを取得
     * @param {string} projectId - プロジェクトID
     * @returns {Promise<Object|null>}
     */
    async getProjectMetadata(projectId) {
        try {
            const doc = await this.db
                .collection('projects')
                .doc(projectId)
                .get();

            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('プロジェクトメタデータ取得失敗:', error);
            throw error;
        }
    }

    /**
     * すべてのプロジェクト一覧を取得
     * @returns {Promise<Array>}
     */
    async getAllProjects() {
        try {
            const snapshot = await this.db
                .collection('projects')
                .orderBy('lastAccessedAt', 'desc')
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('プロジェクト一覧取得失敗:', error);
            throw error;
        }
    }

    // ========================================
    // ポイント管理
    // ========================================

    /**
     * ポイントを追加（重複チェック付き）
     * @param {string} projectId - プロジェクトID
     * @param {Object} point - ポイントデータ {x, y, id}
     * @returns {Promise<Object>} {status: 'success'|'duplicate', firestoreId?, existing?, attempted?}
     */
    async addPoint(projectId, point) {
        try {
            // 重複チェック（ポイントID名が一致）
            if (point.id && point.id.trim() !== '') {
                const existingPoint = await this.findPointById(projectId, point.id);
                if (existingPoint) {
                    return {
                        status: 'duplicate',
                        type: 'point',
                        existing: existingPoint,
                        attempted: point
                    };
                }
            }

            // 新規追加
            const docRef = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('points')
                .add({
                    id: point.id || '',
                    x: point.x,
                    y: point.y,
                    index: point.index || 0,
                    isMarker: point.isMarker || false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            // プロジェクトのポイント数を更新
            await this.incrementCounter(projectId, 'pointCount', 1);

            return {
                status: 'success',
                firestoreId: docRef.id
            };
        } catch (error) {
            console.error('ポイント追加失敗:', error);
            throw error;
        }
    }

    /**
     * ポイントIDでポイントを検索
     * @param {string} projectId - プロジェクトID
     * @param {string} pointId - ポイントID
     * @returns {Promise<Object|null>}
     */
    async findPointById(projectId, pointId) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('points')
                .where('id', '==', pointId)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return {
                firestoreId: doc.id,
                ...doc.data()
            };
        } catch (error) {
            console.error('ポイント検索失敗:', error);
            throw error;
        }
    }

    /**
     * 座標でポイントを検索
     * @param {string} projectId - プロジェクトID
     * @param {number} x - X座標（画像座標系）
     * @param {number} y - Y座標（画像座標系）
     * @returns {Promise<Object|null>} ポイントデータ（firestoreIdを含む）またはnull
     */
    async findPointByCoords(projectId, x, y) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('points')
                .where('x', '==', x)
                .where('y', '==', y)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return {
                firestoreId: doc.id,
                ...doc.data()
            };
        } catch (error) {
            console.error('座標でポイント検索失敗:', error);
            throw error;
        }
    }

    /**
     * ポイントを更新
     * @param {string} projectId - プロジェクトID
     * @param {string} firestoreId - FirestoreドキュメントID
     * @param {Object} updates - 更新データ
     * @returns {Promise<void>}
     */
    async updatePoint(projectId, firestoreId, updates) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .collection('points')
                .doc(firestoreId)
                .update({
                    ...updates,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
        } catch (error) {
            console.error('ポイント更新失敗:', error);
            throw error;
        }
    }

    /**
     * ポイントを削除
     * @param {string} projectId - プロジェクトID
     * @param {string} firestoreId - FirestoreドキュメントID
     * @returns {Promise<void>}
     */
    async deletePoint(projectId, firestoreId) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .collection('points')
                .doc(firestoreId)
                .delete();

            // プロジェクトのポイント数を更新
            await this.incrementCounter(projectId, 'pointCount', -1);
        } catch (error) {
            console.error('ポイント削除失敗:', error);
            throw error;
        }
    }

    /**
     * すべてのポイントを取得
     * @param {string} projectId - プロジェクトID
     * @returns {Promise<Array>}
     */
    async getPoints(projectId) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('points')
                .orderBy('index', 'asc')
                .get();

            return snapshot.docs.map(doc => ({
                firestoreId: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('ポイント取得失敗:', error);
            throw error;
        }
    }

    /**
     * ポイントの変更を監視
     * @param {string} projectId - プロジェクトID
     * @param {Function} callback - コールバック関数
     * @returns {Function} unsubscribe関数
     */
    onPointsSnapshot(projectId, callback) {
        const unsubscribe = this.db
            .collection('projects')
            .doc(projectId)
            .collection('points')
            .orderBy('index', 'asc')
            .onSnapshot(snapshot => {
                const points = snapshot.docs.map(doc => ({
                    firestoreId: doc.id,
                    ...doc.data()
                }));
                callback(points);
            }, error => {
                console.error('ポイント監視エラー:', error);
            });

        this.listeners.set('points', unsubscribe);
        return unsubscribe;
    }

    // ========================================
    // ルート管理
    // ========================================

    /**
     * ルートを追加（重複チェック付き）
     * @param {string} projectId - プロジェクトID
     * @param {Object} route - ルートデータ {startPoint, endPoint, waypoints}
     * @returns {Promise<Object>} {status: 'success'|'duplicate', firestoreId?, existing?, attempted?}
     */
    async addRoute(projectId, route) {
        try {
            // 重複チェック（開始ポイントと終了ポイントの両方が一致）
            const existingRoute = await this.findRouteByStartEnd(
                projectId,
                route.startPoint,
                route.endPoint
            );

            if (existingRoute) {
                return {
                    status: 'duplicate',
                    type: 'route',
                    existing: existingRoute,
                    attempted: route
                };
            }

            // 新規追加
            const docRef = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('routes')
                .add({
                    routeName: route.routeName || 'Unnamed Route',
                    startPoint: route.startPoint || '',
                    endPoint: route.endPoint || '',
                    waypoints: route.waypoints || [],
                    waypointCount: (route.waypoints || []).length,
                    description: route.description || '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            // プロジェクトのルート数を更新
            await this.incrementCounter(projectId, 'routeCount', 1);

            return {
                status: 'success',
                firestoreId: docRef.id
            };
        } catch (error) {
            console.error('ルート追加失敗:', error);
            throw error;
        }
    }

    /**
     * 開始・終了ポイントでルートを検索
     * @param {string} projectId - プロジェクトID
     * @param {string} startPoint - 開始ポイント
     * @param {string} endPoint - 終了ポイント
     * @returns {Promise<Object|null>}
     */
    async findRouteByStartEnd(projectId, startPoint, endPoint) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('routes')
                .where('startPoint', '==', startPoint)
                .where('endPoint', '==', endPoint)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return {
                firestoreId: doc.id,
                ...doc.data()
            };
        } catch (error) {
            console.error('ルート検索失敗:', error);
            throw error;
        }
    }

    /**
     * ルートを更新
     * @param {string} projectId - プロジェクトID
     * @param {string} firestoreId - FirestoreドキュメントID
     * @param {Object} updates - 更新データ
     * @returns {Promise<void>}
     */
    async updateRoute(projectId, firestoreId, updates) {
        try {
            // waypointsが更新される場合、waypointCountも更新
            if (updates.waypoints) {
                updates.waypointCount = updates.waypoints.length;
            }

            await this.db
                .collection('projects')
                .doc(projectId)
                .collection('routes')
                .doc(firestoreId)
                .update({
                    ...updates,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
        } catch (error) {
            console.error('ルート更新失敗:', error);
            throw error;
        }
    }

    /**
     * ルートを削除
     * @param {string} projectId - プロジェクトID
     * @param {string} firestoreId - FirestoreドキュメントID
     * @returns {Promise<void>}
     */
    async deleteRoute(projectId, firestoreId) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .collection('routes')
                .doc(firestoreId)
                .delete();

            // プロジェクトのルート数を更新
            await this.incrementCounter(projectId, 'routeCount', -1);
        } catch (error) {
            console.error('ルート削除失敗:', error);
            throw error;
        }
    }

    /**
     * すべてのルートを取得
     * @param {string} projectId - プロジェクトID
     * @returns {Promise<Array>}
     */
    async getRoutes(projectId) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('routes')
                .get();

            return snapshot.docs.map(doc => ({
                firestoreId: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('ルート取得失敗:', error);
            throw error;
        }
    }

    /**
     * ルートの変更を監視
     * @param {string} projectId - プロジェクトID
     * @param {Function} callback - コールバック関数
     * @returns {Function} unsubscribe関数
     */
    onRoutesSnapshot(projectId, callback) {
        const unsubscribe = this.db
            .collection('projects')
            .doc(projectId)
            .collection('routes')
            .onSnapshot(snapshot => {
                const routes = snapshot.docs.map(doc => ({
                    firestoreId: doc.id,
                    ...doc.data()
                }));
                callback(routes);
            }, error => {
                console.error('ルート監視エラー:', error);
            });

        this.listeners.set('routes', unsubscribe);
        return unsubscribe;
    }

    // ========================================
    // スポット管理
    // ========================================

    /**
     * スポットを追加（重複チェック付き）
     * @param {string} projectId - プロジェクトID
     * @param {Object} spot - スポットデータ {x, y, name}
     * @returns {Promise<Object>} {status: 'success'|'duplicate', firestoreId?, existing?, attempted?}
     */
    async addSpot(projectId, spot) {
        try {
            // 重複チェック（座標のみで一致確認）
            const existingSpot = await this.findSpotByCoords(
                projectId,
                spot.x,
                spot.y
            );

            if (existingSpot) {
                return {
                    status: 'duplicate',
                    type: 'spot',
                    existing: existingSpot,
                    attempted: spot
                };
            }

            // 新規追加
            const docRef = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('spots')
                .add({
                    name: spot.name || '',
                    x: spot.x,
                    y: spot.y,
                    index: spot.index || 0,
                    description: spot.description || '',
                    category: spot.category || '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            // プロジェクトのスポット数を更新
            await this.incrementCounter(projectId, 'spotCount', 1);

            return {
                status: 'success',
                firestoreId: docRef.id
            };
        } catch (error) {
            console.error('スポット追加失敗:', error);
            throw error;
        }
    }

    /**
     * 名称と座標でスポットを検索
     * @param {string} projectId - プロジェクトID
     * @param {string} name - スポット名
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @returns {Promise<Object|null>}
     */
    async findSpotByNameAndCoords(projectId, name, x, y) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('spots')
                .where('name', '==', name)
                .where('x', '==', x)
                .where('y', '==', y)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return {
                firestoreId: doc.id,
                ...doc.data()
            };
        } catch (error) {
            console.error('スポット検索失敗:', error);
            throw error;
        }
    }

    /**
     * 座標でスポットを検索（削除用）
     * @param {string} projectId - プロジェクトID
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @returns {Promise<Object|null>}
     */
    async findSpotByCoords(projectId, x, y) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('spots')
                .where('x', '==', x)
                .where('y', '==', y)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return {
                firestoreId: doc.id,
                ...doc.data()
            };
        } catch (error) {
            console.error('スポット検索失敗:', error);
            throw error;
        }
    }

    /**
     * スポット名でスポットを検索（更新用）
     * @param {string} projectId - プロジェクトID
     * @param {string} name - スポット名
     * @returns {Promise<Object|null>}
     */
    async findSpotByName(projectId, name) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('spots')
                .where('name', '==', name)
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return {
                firestoreId: doc.id,
                ...doc.data()
            };
        } catch (error) {
            console.error('スポット検索失敗:', error);
            throw error;
        }
    }

    /**
     * スポットを更新
     * @param {string} projectId - プロジェクトID
     * @param {string} firestoreId - FirestoreドキュメントID
     * @param {Object} updates - 更新データ
     * @returns {Promise<void>}
     */
    async updateSpot(projectId, firestoreId, updates) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .collection('spots')
                .doc(firestoreId)
                .update({
                    ...updates,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
        } catch (error) {
            console.error('スポット更新失敗:', error);
            throw error;
        }
    }

    /**
     * スポットを削除
     * @param {string} projectId - プロジェクトID
     * @param {string} firestoreId - FirestoreドキュメントID
     * @returns {Promise<void>}
     */
    async deleteSpot(projectId, firestoreId) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .collection('spots')
                .doc(firestoreId)
                .delete();

            // プロジェクトのスポット数を更新
            await this.incrementCounter(projectId, 'spotCount', -1);
        } catch (error) {
            console.error('スポット削除失敗:', error);
            throw error;
        }
    }

    /**
     * すべてのスポットを取得
     * @param {string} projectId - プロジェクトID
     * @returns {Promise<Array>}
     */
    async getSpots(projectId) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('spots')
                .orderBy('index', 'asc')
                .get();

            return snapshot.docs.map(doc => ({
                firestoreId: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('スポット取得失敗:', error);
            throw error;
        }
    }

    /**
     * スポットの変更を監視
     * @param {string} projectId - プロジェクトID
     * @param {Function} callback - コールバック関数
     * @returns {Function} unsubscribe関数
     */
    onSpotsSnapshot(projectId, callback) {
        const unsubscribe = this.db
            .collection('projects')
            .doc(projectId)
            .collection('spots')
            .orderBy('index', 'asc')
            .onSnapshot(snapshot => {
                const spots = snapshot.docs.map(doc => ({
                    firestoreId: doc.id,
                    ...doc.data()
                }));
                callback(spots);
            }, error => {
                console.error('スポット監視エラー:', error);
            });

        this.listeners.set('spots', unsubscribe);
        return unsubscribe;
    }

    // ========================================
    // ユーティリティ
    // ========================================

    /**
     * カウンターを増減
     * @param {string} projectId - プロジェクトID
     * @param {string} field - フィールド名
     * @param {number} increment - 増減値
     * @returns {Promise<void>}
     */
    async incrementCounter(projectId, field, increment) {
        try {
            await this.db
                .collection('projects')
                .doc(projectId)
                .update({
                    [field]: firebase.firestore.FieldValue.increment(increment),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
        } catch (error) {
            console.error('カウンター更新失敗:', error);
            // カウンター更新失敗は致命的でないため、エラーを投げない
        }
    }

    /**
     * すべてのリスナーを解除
     */
    unsubscribeAll() {
        this.listeners.forEach((unsubscribe, key) => {
            unsubscribe();
        });
        this.listeners.clear();
    }

    /**
     * 特定のリスナーを解除
     * @param {string} key - リスナーのキー ('points', 'routes', 'spots')
     */
    unsubscribe(key) {
        const unsubscribe = this.listeners.get(key);
        if (unsubscribe) {
            unsubscribe();
            this.listeners.delete(key);
        }
    }

    // ========================================
    // GPS変換済みデータ管理 (Phase 3追加)
    // ========================================

    /**
     * GPS変換済みポイントを追加
     * @param {string} projectId - プロジェクトID
     * @param {Object} gpsPoint - GPS変換済みポイントデータ
     * @returns {Promise<string>} - Firestore document ID
     */
    async addGpsPoint(projectId, gpsPoint) {
        try {
            const docRef = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('gpsPoints')
                .add({
                    id: gpsPoint.id || '',
                    name: gpsPoint.name || '',
                    coordinates: gpsPoint.coordinates || [0, 0, null], // [lng, lat, elev]
                    source: gpsPoint.source || 'transformed',
                    description: gpsPoint.description || '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            return docRef.id;
        } catch (error) {
            console.error('GPS変換済みポイント追加失敗:', error);
            throw error;
        }
    }

    /**
     * すべてのGPS変換済みポイントを取得
     * @param {string} projectId - プロジェクトID
     * @returns {Promise<Array>}
     */
    async getGpsPoints(projectId) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('gpsPoints')
                .get();

            return snapshot.docs.map(doc => ({
                firestoreId: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('GPS変換済みポイント取得失敗:', error);
            throw error;
        }
    }

    /**
     * GPS変換済みルートを追加
     * @param {string} projectId - プロジェクトID
     * @param {Object} gpsRoute - GPS変換済みルートデータ
     * @returns {Promise<string>} - Firestore document ID
     */
    async addGpsRoute(projectId, gpsRoute) {
        try {
            const docRef = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('gpsRoutes')
                .add({
                    routeName: gpsRoute.routeName || '',
                    startPoint: gpsRoute.startPoint || '',
                    endPoint: gpsRoute.endPoint || '',
                    waypoints: gpsRoute.waypoints || [], // [{coordinates: [lng, lat, elev]}]
                    description: gpsRoute.description || '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            return docRef.id;
        } catch (error) {
            console.error('GPS変換済みルート追加失敗:', error);
            throw error;
        }
    }

    /**
     * すべてのGPS変換済みルートを取得
     * @param {string} projectId - プロジェクトID
     * @returns {Promise<Array>}
     */
    async getGpsRoutes(projectId) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('gpsRoutes')
                .get();

            return snapshot.docs.map(doc => ({
                firestoreId: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('GPS変換済みルート取得失敗:', error);
            throw error;
        }
    }

    /**
     * GPS変換済みスポットを追加
     * @param {string} projectId - プロジェクトID
     * @param {Object} gpsSpot - GPS変換済みスポットデータ
     * @returns {Promise<string>} - Firestore document ID
     */
    async addGpsSpot(projectId, gpsSpot) {
        try {
            const docRef = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('gpsSpots')
                .add({
                    name: gpsSpot.name || '',
                    coordinates: gpsSpot.coordinates || [0, 0, null], // [lng, lat, elev]
                    category: gpsSpot.category || '',
                    description: gpsSpot.description || '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            return docRef.id;
        } catch (error) {
            console.error('GPS変換済みスポット追加失敗:', error);
            throw error;
        }
    }

    /**
     * すべてのGPS変換済みスポットを取得
     * @param {string} projectId - プロジェクトID
     * @returns {Promise<Array>}
     */
    async getGpsSpots(projectId) {
        try {
            const snapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('gpsSpots')
                .get();

            return snapshot.docs.map(doc => ({
                firestoreId: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('GPS変換済みスポット取得失敗:', error);
            throw error;
        }
    }

    /**
     * GPS変換済みルートの中間点の標高を更新 (Phase 4用)
     * @param {string} projectId - プロジェクトID
     * @param {string} routeId - FirestoreドキュメントID
     * @param {number} waypointIndex - 中間点のインデックス
     * @param {number} elevation - 標高値
     * @returns {Promise<void>}
     */
    async updateGpsRouteWaypointElevation(projectId, routeId, waypointIndex, elevation) {
        try {
            const docRef = this.db
                .collection('projects')
                .doc(projectId)
                .collection('gpsRoutes')
                .doc(routeId);

            const doc = await docRef.get();
            if (!doc.exists) {
                throw new Error(`ルートが見つかりません: ${routeId}`);
            }

            const waypoints = doc.data().waypoints || [];
            if (waypointIndex < 0 || waypointIndex >= waypoints.length) {
                throw new Error(`無効なwaypointIndex: ${waypointIndex}`);
            }

            // coordinates[2] に標高を設定
            waypoints[waypointIndex].coordinates[2] = elevation;

            await docRef.update({
                waypoints: waypoints,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        } catch (error) {
            console.error('ルート中間点の標高更新失敗:', error);
            throw error;
        }
    }

    /**
     * GPS変換済みスポットの標高を更新 (Phase 4用)
     * @param {string} projectId - プロジェクトID
     * @param {string} spotId - FirestoreドキュメントID
     * @param {number} elevation - 標高値
     * @returns {Promise<void>}
     */
    async updateGpsSpotElevation(projectId, spotId, elevation) {
        try {
            const docRef = this.db
                .collection('projects')
                .doc(projectId)
                .collection('gpsSpots')
                .doc(spotId);

            const doc = await docRef.get();
            if (!doc.exists) {
                throw new Error(`スポットが見つかりません: ${spotId}`);
            }

            const coordinates = doc.data().coordinates || [0, 0, null];
            coordinates[2] = elevation;

            await docRef.update({
                coordinates: coordinates,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        } catch (error) {
            console.error('スポットの標高更新失敗:', error);
            throw error;
        }
    }

    /**
     * GPS変換済みデータを全削除 (上書き保存用)
     * @param {string} projectId - プロジェクトID
     * @returns {Promise<void>}
     */
    async deleteAllGpsData(projectId) {
        try {
            // gpsPoints削除
            const gpsPointsSnapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('gpsPoints')
                .get();

            const gpsPointsDeletePromises = gpsPointsSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(gpsPointsDeletePromises);

            // gpsRoutes削除
            const gpsRoutesSnapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('gpsRoutes')
                .get();

            const gpsRoutesDeletePromises = gpsRoutesSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(gpsRoutesDeletePromises);

            // gpsSpots削除
            const gpsSpotsSnapshot = await this.db
                .collection('projects')
                .doc(projectId)
                .collection('gpsSpots')
                .get();

            const gpsSpotsDeletePromises = gpsSpotsSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(gpsSpotsDeletePromises);

        } catch (error) {
            console.error('GPS変換済みデータ削除失敗:', error);
            throw error;
        }
    }
}

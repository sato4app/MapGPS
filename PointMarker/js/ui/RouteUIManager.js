import { UIHelper } from './UIHelper.js';
import { Validators } from '../utils/Validators.js';
import { ValidationManager } from './ValidationManager.js';
import { CoordinateUtils } from '../utils/Coordinates.js';

export class RouteUIManager {
    /**
     * @param {PointMarkerApp} app - アプリケーションのメインインスタンス
     */
    constructor(app) {
        this.app = app;
    }

    /**
     * ルート選択ドロップダウンを更新
     * @param {Array} routes - ルート配列
     */
    updateRouteDropdown(routes) {
        const dropdown = document.getElementById('routeSelectDropdown');
        if (!dropdown) return;

        // 現在の選択を保持
        const currentSelectedIndex = this.app.routeManager.selectedRouteIndex;

        // 既存のオプションをクリア（最初の「-- ルートを選択 --」以外）
        dropdown.innerHTML = '<option value="">-- ルートを選択 --</option>';

        // ルートを表示名・元インデックスのペアで昇順ソートして追加
        const sortedRoutes = routes
            .map((route, index) => ({
                originalIndex: index,
                displayName: route.routeName || `${route.startPointId} ～ ${route.endPointId}`
            }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));

        sortedRoutes.forEach(({ originalIndex, displayName }) => {
            const option = document.createElement('option');
            option.value = originalIndex.toString();
            option.textContent = displayName;
            dropdown.appendChild(option);
        });

        // 選択を復元
        dropdown.value = currentSelectedIndex >= 0 ? currentSelectedIndex.toString() : '';
    }

    /**
     * ルートポイント（開始・終了）のblur処理を統合処理
     * @param {string} inputValue - 入力値
     * @param {string} pointType - ポイントタイプ ('start' or 'end')
     * @param {string} previousValue - 前回の値
     * @returns {string} 設定された値
     */
    handleRoutePointBlur(inputValue, pointType, previousValue) {
        const isStartPoint = pointType === 'start';
        const setPointMethod = isStartPoint ? 'setStartPoint' : 'setEndPoint';
        const pointLabel = isStartPoint ? '開始ポイント' : '終了ポイント';

        // 入力値が空でない場合のみ処理
        if (inputValue !== '') {
            // まず元の入力値でスポット名の部分一致検索
            const matchingSpots = this.app.spotManager.findSpotsByPartialName(inputValue);

            if (matchingSpots.length === 1) {
                // 1件のみ該当する場合、そのスポット名を設定（フォーマット処理も適用）
                const formattedSpotName = Validators.formatPointId(matchingSpots[0].name);
                this.app.routeManager[setPointMethod](formattedSpotName);
            } else if (matchingSpots.length > 1) {
                // 複数件該当する場合、ポイントIDとしてフォーマット処理を試みる
                // （警告は表示せず、バリデーション時にピンク背景で表示）
                this.app.routeManager[setPointMethod](inputValue);
            } else {
                // スポット名が該当しない場合、ポイントIDとしてフォーマット処理
                this.app.routeManager[setPointMethod](inputValue);
            }
        } else {
            // 空の場合はそのまま設定
            this.app.routeManager[setPointMethod](inputValue);
        }

        const newValue = isStartPoint
            ? this.app.routeManager.getStartEndPoints().start
            : this.app.routeManager.getStartEndPoints().end;

        // 開始・終了ポイント両方の検証フィードバック（複数一致したスポット名を取得）
        const matchingSpots = ValidationManager.updateBothRoutePointsValidation(
            this.app.routeManager,
            this.app.pointManager,
            this.app.spotManager
        );

        // 複数一致したスポット名をエラー状態として設定
        const allMatchingSpotNames = [...matchingSpots.start, ...matchingSpots.end];
        this.app.inputManager.setErrorSpotNames(allMatchingSpotNames);

        // 値が変更された場合の処理（ブランクも含む）
        if (previousValue !== newValue) {
            this.checkRoutePointChange(previousValue, newValue, pointLabel);
            // ポイントID表示チェックボックスをオンにする
            const checkbox = document.getElementById('showPointIdsCheckbox');
            if (!checkbox.checked) {
                checkbox.checked = true;
                this.app.handlePointIdVisibilityChange(true);
            }
        }

        // 開始・終了ポイントがスポット名の場合、常に表示するように設定
        this.app.updateAlwaysVisibleSpotNames();

        return newValue;
    }

    /**
     * ルートポイント変更チェック
     * @param {string} previousValue - 編集前の値
     * @param {string} newValue - 編集後の値
     * @param {string} pointType - ポイントタイプ（'開始ポイント' or '終了ポイント'）
     */
    checkRoutePointChange(previousValue, newValue, pointType) {
        // 値が変更され、かつ中間点が存在する場合
        if (previousValue !== newValue && this.app.routeManager.getRoutePoints().length > 0) {
            const waypointCount = this.app.routeManager.getRoutePoints().length;
            const message = `${pointType}が変更されました（${previousValue || '(空)'} → ${newValue || '(空)'}）。\n\n` +
                `ルート上の中間点（${waypointCount}個）をクリアしますか？`;

            if (confirm(message)) {
                this.app.routeManager.clearRoutePoints();
                UIHelper.showMessage(`${waypointCount}個の中間点をクリアしました`);
            }
        }
    }

    /**
     * 新しいルートを追加
     */
    handleAddRoute() {
        const newRoute = {
            routeName: `ルート${this.app.routeManager.getAllRoutes().length + 1}`,
            startPointId: '',
            endPointId: '',
            routePoints: []
        };
        this.app.routeManager.addRoute(newRoute);
        // 追加したルートを自動選択
        const newIndex = this.app.routeManager.getAllRoutes().length - 1;
        this.app.routeManager.selectRoute(newIndex);

        // 開始・終了ポイント入力フィールドを編集可能にする
        this.setRouteInputsEditable(true);

        // ポイントID表示チェックボックスを自動的にONにする
        const pointIdCheckbox = document.getElementById('showPointIdsCheckbox');
        if (pointIdCheckbox && !pointIdCheckbox.checked) {
            pointIdCheckbox.checked = true;
            this.app.handlePointIdVisibilityChange(true);
        }

        UIHelper.showMessage('新しいルートを追加しました。開始ポイントを画像上で選択してください');
    }

    /**
     * すべてのルートを保存（Firebase）
     */
    async handleSaveRoute() {
        // Firebaseマネージャーの存在確認（未接続時はスキップ）
        if (!window.firestoreManager) {
            return;
        }

        const selectedRoute = this.app.routeManager.getSelectedRoute();
        if (!selectedRoute) {
            UIHelper.showError('ルートが選択されていません');
            return;
        }

        // 開始・終了ポイントが設定されているか確認
        if (!selectedRoute.startPointId || !selectedRoute.endPointId) {
            UIHelper.showError('開始ポイントと終了ポイントを設定してください');
            return;
        }

        // 中間点が1件以上設定されているか確認
        if (!selectedRoute.routePoints || selectedRoute.routePoints.length === 0) {
            UIHelper.showError('中間点を1件以上設定してください');
            return;
        }

        try {
            // プロジェクトIDを画像ファイル名から取得
            const projectId = this.app.fileHandler.getCurrentImageFileName();
            if (!projectId) {
                UIHelper.showError('画像ファイル名を取得できません');
                return;
            }

            // すべてのルートを保存
            const allRoutes = this.app.routeManager.getAllRoutes();
            let savedCount = 0;
            let updatedCount = 0;
            let addedCount = 0;
            const savedRouteNames = [];

            for (const route of allRoutes) {
                // 開始・終了ポイント、中間点が設定されていないルートはスキップ
                if (!route.startPointId || !route.endPointId ||
                    !route.routePoints || route.routePoints.length === 0) {
                    continue;
                }

                // キャンバス座標を画像座標に変換
                const waypoints = route.routePoints.map(point => {
                    const imageCoords = CoordinateUtils.canvasToImage(
                        point.x, point.y,
                        this.app.canvas.width, this.app.canvas.height,
                        this.app.currentImage.width, this.app.currentImage.height
                    );
                    return { x: imageCoords.x, y: imageCoords.y };
                });

                // Firebaseに保存するルートデータ
                const routeData = {
                    routeName: route.routeName || `${route.startPointId} ～ ${route.endPointId}`,
                    startPoint: route.startPointId,
                    endPoint: route.endPointId,
                    waypoints: waypoints
                };

                // 更新されたルートかどうかを記録
                const wasModified = route.isModified;

                // FirestoreIDがあれば更新、なければ新規追加
                if (route.firestoreId) {
                    // 既存ルートを更新
                    updatedCount++;
                } else {
                    // 新規ルートを追加
                    // 開発用ダミー処理
                    const result = { status: 'success', firestoreId: 'temp_id_' + Date.now() };

                    if (result.status === 'success') {
                        // FirestoreIDを保存
                        route.firestoreId = result.firestoreId;
                        addedCount++;
                    } else if (result.status === 'duplicate') {
                        // 重複している場合は既存のFirestoreIDを保存
                        route.firestoreId = result.existing.firestoreId;
                        // 既存ルートを更新
                        updatedCount++;
                    }
                }

                // 更新フラグをクリア
                route.isModified = false;
                savedCount++;

                // 更新されたルートのみ一覧に追加
                if (wasModified) {
                    savedRouteNames.push(routeData.routeName);
                }
            }

            // 開始・終了ポイント入力フィールドを読み取り専用にする
            this.setRouteInputsEditable(false);

            // UI更新
            this.app.routeManager.notify('onModifiedStateChange', { isModified: false });
            this.app.routeManager.notify('onRouteListChange', allRoutes);

        } catch (error) {
            UIHelper.showError('ルート保存中にエラーが発生しました: ' + error.message);
        }
    }

    /**
     * 選択中のルートを削除
     */
    async handleDeleteRoute() {
        const selectedIndex = this.app.routeManager.selectedRouteIndex;
        if (selectedIndex < 0) {
            UIHelper.showError('ルートが選択されていません');
            return;
        }

        const selectedRoute = this.app.routeManager.getSelectedRoute();
        const routeName = selectedRoute.routeName || `${selectedRoute.startPointId} ～ ${selectedRoute.endPointId}`;

        if (confirm(`ルート「${routeName}」を削除しますか？`)) {
            try {
                // Firebaseから削除
                if (selectedRoute.firestoreId) {
                    const projectId = this.app.fileHandler.getCurrentImageFileName();
                }

                // RouteManagerから削除
                this.app.routeManager.deleteRoute(selectedIndex);
                UIHelper.showMessage(`ルート「${routeName}」を削除しました`);
            } catch (error) {
                UIHelper.showError('ルート削除中にエラーが発生しました: ' + error.message);
            }
        }
    }

    /**
     * ルート入力フィールドの編集可/不可を設定
     * @param {boolean} editable - 編集可能かどうか
     */
    setRouteInputsEditable(editable) {
        const startPointInput = document.getElementById('startPointInput');
        const endPointInput = document.getElementById('endPointInput');

        if (editable) {
            startPointInput.removeAttribute('readonly');
            endPointInput.removeAttribute('readonly');
        } else {
            startPointInput.setAttribute('readonly', 'readonly');
            endPointInput.setAttribute('readonly', 'readonly');
        }
    }

    /**
     * ルートポイント編集リクエスト処理
     * @param {string} pointType - 'start' または 'end'
     */
    handleRoutePointEditRequest(pointType) {
        const selectedRoute = this.app.routeManager.getSelectedRoute();
        if (!selectedRoute) return;

        // 中間点をクリア
        if (selectedRoute.routePoints && selectedRoute.routePoints.length > 0) {
            selectedRoute.routePoints = [];
            this.app.routeManager.notify('onCountChange', 0);
            this.app.routeManager.notify('onChange');
        }

        // 入力を編集可能にする
        this.setRouteInputsEditable(true);

        // 入力フィールドにフォーカス
        const inputId = pointType === 'start' ? 'startPointInput' : 'endPointInput';
        const input = document.getElementById(inputId);
        if (input) {
            input.focus();
            input.select();
        }

        UIHelper.showMessage(`${pointType === 'start' ? '開始' : '終了'}ポイントを変更します。画像上で選択するか、直接入力してください`);
    }
}

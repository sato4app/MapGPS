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
     * ルートの編集内容をローカルに確定する（更新フラグ・入力欄・一覧表示の更新）
     *
     * ※Firestoreへの保存はコスト削減のためリアルタイムでは行わず、
     *   「データベース保存」ボタン（FirebaseSyncManager.saveAllToFirebase）でまとめて実行する。
     *   そのため、ここではローカル状態の更新のみを行う。
     */
    handleSaveRoute() {
        const selectedRoute = this.app.routeManager.getSelectedRoute();
        if (!selectedRoute) {
            return;
        }

        // 開始・終了ポイント・中間点が揃っていない場合は確定しない（自動呼び出しのため通知は出さない）
        if (!selectedRoute.startPointId || !selectedRoute.endPointId ||
            !selectedRoute.routePoints || selectedRoute.routePoints.length === 0) {
            return;
        }

        // 全ルートの更新フラグをクリアし、入力欄を読み取り専用に戻す
        const allRoutes = this.app.routeManager.getAllRoutes();
        allRoutes.forEach(route => { route.isModified = false; });

        this.setRouteInputsEditable(false);
        this.app.routeManager.notify('onModifiedStateChange', { isModified: false });
        this.app.routeManager.notify('onRouteListChange', allRoutes);
    }

    /**
     * ルート中間点の経路最適化を実行
     * 開始→中間点→終了の経路の合計距離が最小になるように中間点の訪問順を並べ替える。
     * 並べ替えた結果はルートデータ（routePoints）に反映されるため、
     * 「保存」（Firebase）や「出力」（JSON）にもそのまま反映される。
     */
    handleOptimizeRoute() {
        // 「ルート経路を描画」チェックがオンの場合のみ動作
        const showRoutePathCheckbox = document.getElementById('showRoutePathCheckbox');
        if (!showRoutePathCheckbox || !showRoutePathCheckbox.checked) {
            UIHelper.showMessage('最適化を実行するには「ルート経路を描画」をオンにしてください', 'warning');
            return;
        }

        const selectedRoute = this.app.routeManager.getSelectedRoute();
        if (!selectedRoute) {
            UIHelper.showError('ルートが選択されていません。ルートを選択してから最適化を実行してください');
            return;
        }

        // 開始・終了ポイントの座標を解決（ポイントIDまたはスポット名）
        const startCoord = this.app.resolveRouteEndpointCoord(selectedRoute.startPointId);
        const endCoord = this.app.resolveRouteEndpointCoord(selectedRoute.endPointId);
        if (!startCoord || !endCoord) {
            UIHelper.showError('開始ポイントと終了ポイントの両方を設定してから最適化を実行してください');
            return;
        }

        const waypoints = selectedRoute.routePoints || [];
        if (waypoints.length < 2) {
            UIHelper.showMessage('最適化には中間点が2つ以上必要です', 'warning');
            return;
        }

        const result = this.app.routeManager.optimizeRoutePoints(startCoord, endCoord);
        if (!result) return;

        if (result.changed) {
            UIHelper.showMessage(
                `中間点の経路を最適化しました（経路長: ${Math.round(result.beforeLength)} → ${Math.round(result.afterLength)}）。` +
                `「保存」または「出力」で反映してください`
            );
        } else {
            UIHelper.showMessage('中間点の経路はすでに最適です', 'info');
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
                // Firestoreからの削除は「データベース保存」ボタンで同期するため、ここではローカル削除のみ
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

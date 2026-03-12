import { CoordinateUtils } from '../utils/Coordinates.js';
import { ObjectDetector } from '../utils/ObjectDetector.js';
import { UIHelper } from './UIHelper.js';

/**
 * キャンバスイベント（マウス操作等）を管理するクラス
 */
export class CanvasEventHandler {
    /**
     * @param {PointMarkerApp} app - アプリケーションのメインインスタンス
     */
    constructor(app) {
        this.app = app;

        // 状態のみ保持し、ロジック内でappのプロパティを参照する
        this.isRightDragging = false;
        this.rightDragStartX = 0;
        this.rightDragStartY = 0;
        this.rightDragCurrentX = 0;
        this.rightDragCurrentY = 0;
        this.justFinishedDragging = false;
        this.spotDragStartCoords = null; // スポットドラッグ開始位置
    }

    /**
     * カーソルスタイルを更新
     * @param {boolean} hasObject - マウス下にオブジェクトがあるか
     */
    updateCursor(hasObject) {
        // カーソルは常にcrosshairで固定 (元コード通り)
        this.app.canvas.style.cursor = 'crosshair';
    }

    /**
     * キャンバスマウスダウン処理
     * @param {MouseEvent} event 
     */
    handleCanvasMouseDown(event) {
        if (!this.app.currentImage) return;

        // ズーム・パン情報を取得
        const scale = this.app.canvasRenderer.getScale();
        const offset = this.app.canvasRenderer.getOffset();

        // マウス座標をキャンバス座標に変換
        const coords = CoordinateUtils.mouseToCanvas(event, this.app.canvas, scale, offset.x, offset.y);
        const mode = this.app.layoutManager.getCurrentEditingMode();

        // 右クリック（button === 2）の場合、削除範囲ドラッグ開始
        if (event.button === 2 && mode === 'route') {
            this.isRightDragging = true;
            this.rightDragStartX = coords.x;
            this.rightDragStartY = coords.y;
            this.rightDragCurrentX = coords.x;
            this.rightDragCurrentY = coords.y;
            event.preventDefault();
            return;
        }

        // ルート編集モードの場合、中間点ドラッグを優先チェック
        if (mode === 'route') {
            const routePointInfo = this.app.routeManager.findRoutePointAt(coords.x, coords.y);
            if (routePointInfo) {
                const selectedRoute = this.app.routeManager.getSelectedRoute();
                // ルートが選択されていない場合
                if (!selectedRoute) {
                    UIHelper.showWarning('ルートが選択されていません。ルートを選択または追加してください');
                    event.preventDefault();
                    return;
                }
                // 開始・終了ポイントが設定済みの場合のみドラッグ可能
                if (selectedRoute.startPointId && selectedRoute.endPointId) {
                    this.app.dragDropHandler.startDrag(
                        'routePoint',
                        routePointInfo.index,
                        coords.x,
                        coords.y,
                        routePointInfo.point
                    );
                    event.preventDefault();
                } else {
                    UIHelper.showWarning('開始ポイントと終了ポイントを先に選択してください');
                    event.preventDefault();
                }
                return;
            }
        }

        // ポイント・スポットのドラッグ処理
        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);
        if (!objectInfo) return;

        // 適切なモードでのドラッグ開始をチェック
        const canDrag = (objectInfo.type === 'point' && mode === 'point') ||
            (objectInfo.type === 'spot' && mode === 'spot') ||
            (objectInfo.type === 'vertex' && mode === 'area');

        if (canDrag) {
            const object = objectInfo.type === 'point'
                ? this.app.pointManager.getPoints()[objectInfo.index]
                : (objectInfo.type === 'spot'
                    ? this.app.spotManager.getSpots()[objectInfo.index]
                    : this.app.areaManager.getAreaVertex(objectInfo.index));

            // スポットドラッグ開始時に元の座標を保存（Firebase更新用）
            if (objectInfo.type === 'spot') {
                this.spotDragStartCoords = {
                    x: object.x,
                    y: object.y
                };
            }

            this.app.dragDropHandler.startDrag(
                objectInfo.type,
                objectInfo.index,
                coords.x,
                coords.y,
                object
            );

            event.preventDefault();
        }
    }

    /**
     * キャンバスマウス移動処理
     * @param {MouseEvent} event 
     */
    handleCanvasMouseMove(event) {
        if (!this.app.currentImage) return;

        const scale = this.app.canvasRenderer.getScale();
        const offset = this.app.canvasRenderer.getOffset();
        const coords = CoordinateUtils.mouseToCanvas(event, this.app.canvas, scale, offset.x, offset.y);

        // 右クリックドラッグ中の処理（削除範囲の更新）
        if (this.isRightDragging) {
            this.rightDragCurrentX = coords.x;
            this.rightDragCurrentY = coords.y;
            this.app.redrawCanvas();
            // 削除範囲矩形を描画
            this.app.canvasRenderer.drawDeletionRectangle(
                this.rightDragStartX,
                this.rightDragStartY,
                this.rightDragCurrentX,
                this.rightDragCurrentY
            );
            return;
        }

        // ドラッグ中の処理
        if (this.app.dragDropHandler.isDraggingObject()) {
            this.app.dragDropHandler.updateDrag(
                coords.x,
                coords.y,
                this.app.pointManager,
                this.app.spotManager,
                this.app.routeManager,
                this.app.areaManager
            );
            this.app.redrawCanvas();
            return;
        }

        // カーソル更新（ホバー効果）
        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);

        // エリア編集モードで、エリア名（ラベル）上にいる場合はテキストカーソルにする
        if (this.app.layoutManager.getCurrentEditingMode() === 'area') {
            const areas = this.app.areaManager.getAllAreas();
            const hitAreaIndex = this.findAreaLabelAt(coords.x, coords.y, areas, scale);
            if (hitAreaIndex !== -1) {
                this.app.canvas.style.cursor = 'text';
                return;
            }
        }

        this.updateCursor(!!objectInfo);
    }

    /**
     * キャンバスマウスアップ処理
     * @param {MouseEvent} event 
     */
    async handleCanvasMouseUp(event) {
        // 右クリックドラッグ終了時の処理
        if (this.isRightDragging) {
            // ドラッグ距離を計算（3px以上移動していたらドラッグ扱い）
            const dragDistance = Math.sqrt(
                Math.pow(this.rightDragCurrentX - this.rightDragStartX, 2) +
                Math.pow(this.rightDragCurrentY - this.rightDragStartY, 2)
            );

            // 右クリックドラッグ状態をリセット
            this.isRightDragging = false;
            this.app.redrawCanvas(); // 矩形を消す

            if (dragDistance >= 3) {
                // ドラッグ扱い：矩形内の中間点を検索
                const pointsInRect = this.app.routeManager.findRoutePointsInRectangle(
                    this.rightDragStartX,
                    this.rightDragStartY,
                    this.rightDragCurrentX,
                    this.rightDragCurrentY
                );

                // 中間点が見つかった場合、確認後に削除
                if (pointsInRect.length > 0) {
                    const confirmed = confirm(`${pointsInRect.length}個のルート中間点を削除しますか？`);

                    if (confirmed) {
                        // 削除実行
                        const indices = pointsInRect.map(p => p.index);
                        const deletedCount = this.app.routeManager.removeRoutePoints(indices);

                        // Firebase自動保存
                        await this.app.routeUIManager.handleSaveRoute();

                        UIHelper.showMessage(`${deletedCount}個のルート中間点を削除しました`);
                    } else {
                        // キャンセル時はメッセージのみ表示
                        UIHelper.showMessage('削除をキャンセルしました');
                    }
                } else {
                    UIHelper.showWarning('削除対象の中間点が見つかりませんでした');
                }
            }

            event.preventDefault();
            return;
        }

        // ポイントドラッグ終了時のコールバック
        const onPointDragEnd = (pointIndex) => {
            // 【リアルタイムFirebase更新】ポイント移動完了時にFirebase更新
            // [TEMP_DISABLE_FIREBASE]
            // this.app.firebaseSyncManager.updatePointToFirebase(pointIndex);
        };

        // スポットドラッグ終了時のコールバック
        const onSpotDragEnd = async (spotIndex) => {
            // 【リアルタイムFirebase更新】スポット移動完了時にFirebase更新
            // 移動前の座標のデータを削除してから、新しい座標で追加
            if (this.spotDragStartCoords) {
                const spots = this.app.spotManager.getSpots();
                if (spotIndex >= 0 && spotIndex < spots.length) {
                    const currentSpot = spots[spotIndex];
                    // 座標が変わった場合のみ、古いデータを削除
                    if (this.spotDragStartCoords.x !== currentSpot.x ||
                        this.spotDragStartCoords.y !== currentSpot.y) {
                        // [TEMP_DISABLE_FIREBASE]
                        // await this.app.firebaseSyncManager.deleteSpotFromFirebase(this.spotDragStartCoords.x, this.spotDragStartCoords.y);
                    }
                }
                this.spotDragStartCoords = null; // リセット
            }
            // 新しい座標で更新/追加
            // [TEMP_DISABLE_FIREBASE]
            // await this.app.firebaseSyncManager.updateSpotToFirebase(spotIndex);
        };

        // ルート中間点ドラッグ終了時のコールバック
        const onRoutePointDragEnd = async (routePointIndex) => {
            // 中間点移動後、自動保存
            await this.app.routeUIManager.handleSaveRoute();
        };

        // エリア頂点ドラッグ終了時のコールバック
        const onVertexDragEnd = (vertexIndex) => {
            const areaIndex = this.app.areaManager.selectedAreaIndex;
            if (areaIndex >= 0) {
                this.app.areaManager.reinsertNearestEdge(areaIndex, vertexIndex);
                // Firebase連携: エリア更新
                // [TEMP_DISABLE_FIREBASE]
                // this.app.firebaseSyncManager.updateAreaToFirebase(areaIndex);
            }
            this.app.redrawCanvas();
        };

        const dragInfo = this.app.dragDropHandler.endDrag(
            this.app.inputManager,
            this.app.pointManager,
            onPointDragEnd,
            onSpotDragEnd,
            onRoutePointDragEnd,
            onVertexDragEnd
        );

        // ドラッグ操作だった場合、clickイベントの発火を防止
        if (dragInfo.wasDragging && dragInfo.hasMoved) {
            this.justFinishedDragging = true;
            event.preventDefault();
        }
    }

    /**
     * キャンバスクリック処理
     * @param {MouseEvent} event 
     */
    handleCanvasClick(event) {
        // ドラッグ直後の場合はクリック処理をスキップ
        if (this.justFinishedDragging) {
            this.justFinishedDragging = false;
            return;
        }

        // ドラッグ中の場合はクリック処理をスキップ
        if (!this.app.currentImage || this.app.dragDropHandler.isDraggingObject()) return;

        const scale = this.app.canvasRenderer.getScale();
        const offset = this.app.canvasRenderer.getOffset();
        const coords = CoordinateUtils.mouseToCanvas(event, this.app.canvas, scale, offset.x, offset.y);

        const mode = this.app.layoutManager.getCurrentEditingMode();

        // 既存のオブジェクトをクリックしたかチェック
        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);

        // ルート編集モードの場合の処理
        if (mode === 'route') {
            // ポイントまたはスポットをクリックした場合
            if (objectInfo && (objectInfo.type === 'point' || objectInfo.type === 'spot')) {
                this.handleRoutePointSelection(objectInfo);
                return;
            }
            // 開始・終了ポイントが設定済みの場合のみ中間点を追加
            const selectedRoute = this.app.routeManager.getSelectedRoute();
            // ルートが選択されていない場合
            if (!selectedRoute) {
                UIHelper.showWarning('ルートが選択されていません。ルートを選択または追加してください');
                return;
            }
            if (selectedRoute.startPointId && selectedRoute.endPointId) {
                this.handleNewObjectCreation(coords.x, coords.y, mode);
            } else {
                UIHelper.showWarning('開始ポイントと終了ポイントを先に選択してください');
            }
            return;
        }

        // 既存オブジェクトクリック時の処理
        if (objectInfo) {
            this.handleExistingObjectClick(objectInfo, mode);
        } else {
            // エリア編集モードの場合、エリア名のクリック判定を行う
            if (mode === 'area') {
                const areas = this.app.areaManager.getAllAreas();
                const hitAreaIndex = this.findAreaLabelAt(coords.x, coords.y, areas, scale);

                if (hitAreaIndex !== -1) {
                    // エリアを選択
                    this.app.areaManager.selectArea(hitAreaIndex);

                    // 現在の名前を取得
                    const area = areas[hitAreaIndex];
                    const currentName = area.areaName || '';

                    // リネームダイアログを表示
                    // eslint-disable-next-line no-alert
                    const newName = prompt('新しいエリア名を入力してください:', currentName);

                    if (newName !== null) {
                        // 名前を更新
                        this.app.areaManager.setAreaName(newName || 'Area ' + (hitAreaIndex + 1));
                        // Firebase連携: エリア更新
                        this.app.firebaseSyncManager.updateAreaToFirebase(hitAreaIndex);
                        this.app.redrawCanvas();
                        return;
                    }
                }
            }

            // 空白部分をクリックした場合（新規作成）
            this.handleNewObjectCreation(coords.x, coords.y, mode);
        }
    }

    /**
     * 指定座標がエリア名の表示領域（重心付近）にあるか判定
     * @param {number} x - クリックしたX座標（画像座標系）
     * @param {number} y - クリックしたY座標（画像座標系）
     * @param {Array} areas - エリア配列
     * @param {number} scale - 現在のズームスケール
     * @returns {number} ヒットしたエリアのインデックス、なければ-1
     */
    findAreaLabelAt(x, y, areas, scale) {
        // ヒット判定の閾値（画面上のピクセル数 / スケール）
        // テキストの背景paddingなども考慮して少し広めに設定（画面上で約20px程度）
        const threshold = 20 / scale;

        for (let i = 0; i < areas.length; i++) {
            const area = areas[i];
            const vertices = area.vertices;

            if (!vertices || vertices.length === 0) continue;

            // 重心を計算
            let cx = 0, cy = 0;
            vertices.forEach(v => {
                cx += v.x;
                cy += v.y;
            });
            cx /= vertices.length;
            cy /= vertices.length;

            // 距離チェック
            const dx = x - cx;
            const dy = y - cy;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= threshold) {
                return i;
            }
        }
        return -1;
    }

    /**
     * 右クリック（コンテキストメニュー）処理
     * @param {MouseEvent} event 
     */
    async handleCanvasContextMenu(event) {
        // デフォルトのコンテキストメニューを抑制
        event.preventDefault();

        if (!this.app.currentImage) return;

        const mode = this.app.layoutManager.getCurrentEditingMode();

        // ズーム・パン情報を取得
        const scale = this.app.canvasRenderer.getScale();
        const offset = this.app.canvasRenderer.getOffset();

        // マウス座標をキャンバス座標に変換
        const coords = CoordinateUtils.mouseToCanvas(event, this.app.canvas, scale, offset.x, offset.y);

        // ルート編集モードの場合のみ処理
        if (mode === 'route') {
            // 最も近い中間点を検索（最大50px以内）
            const nearestInfo = this.app.routeManager.findNearestRoutePoint(coords.x, coords.y, 50);

            if (nearestInfo) {
                // 中間点を削除
                const deleted = this.app.routeManager.removeRoutePoint(nearestInfo.index);

                if (deleted) {
                    // Firebase自動保存
                    await this.app.routeUIManager.handleSaveRoute();

                    // 削除成功メッセージ
                    UIHelper.showMessage('ルート中間点を削除しました');
                }
            } else {
                UIHelper.showWarning('近くに中間点が見つかりませんでした');
            }
        } else if (mode === 'area') {
            const vertexInfo = this.app.areaManager.findVertexAt(coords.x, coords.y, 10);
            if (vertexInfo) {
                const areaIndex = this.app.areaManager.selectedAreaIndex;
                if (this.app.areaManager.removeVertex(vertexInfo.index)) {
                    UIHelper.showMessage('エリア頂点を削除しました');
                    // Firebase連携: エリア更新
                    // [TEMP_DISABLE_FIREBASE]
                    // this.app.firebaseSyncManager.updateAreaToFirebase(areaIndex);
                }
            }
        }
    }

    /**
     * 指定座標上のオブジェクト（ポイント/スポット）を検出
     * @param {number} mouseX - マウスX座標
     * @param {number} mouseY - マウスY座標
     * @returns {{type: string, index: number} | null} 検出されたオブジェクト情報
     */
    findObjectAtMouse(mouseX, mouseY) {
        const mode = this.app.layoutManager.getCurrentEditingMode();
        const managers = {
            pointManager: this.app.pointManager,
            spotManager: this.app.spotManager,
            routeManager: null, // ルート中間点は別途チェック
            areaManager: this.app.areaManager
        };
        const result = ObjectDetector.findObjectAt(mouseX, mouseY, managers, mode);
        return result ? { type: result.type, index: result.index } : null;
    }

    /**
     * 既存オブジェクトクリック時の処理
     * @param {Object} objectInfo - オブジェクト情報
     * @param {string} mode - 編集モード
     */
    handleExistingObjectClick(objectInfo, mode) {
        if (objectInfo.type === 'point' && mode === 'point') {
            UIHelper.focusInputForPoint(objectInfo.index);
        } else if (objectInfo.type === 'spot' && mode === 'spot') {
            UIHelper.focusInputForSpot(objectInfo.index);
        }
    }

    /**
     * 新規オブジェクト作成処理
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {string} mode - 編集モード
     */
    handleNewObjectCreation(x, y, mode) {
        if (mode === 'point') {
            this.createNewPoint(x, y);
        } else if (mode === 'spot') {
            this.createNewSpot(x, y);
        } else if (mode === 'route') {
            // ルート中間点を追加
            const selectedRouteIndex = this.app.routeManager.selectedRouteIndex;
            if (selectedRouteIndex >= 0) {
                this.app.routeManager.addRoutePoint(x, y);
                // Firebase連携: ルート更新
                this.app.routeUIManager.handleSaveRoute();
                this.app.redrawCanvas();
            } else {
                UIHelper.showWarning('ルートを選択してください');
            }
        } else if (mode === 'area') {
            // 選択中のエリアがあれば頂点を追加
            const selectedAreaIndex = this.app.areaManager.selectedAreaIndex;
            if (selectedAreaIndex >= 0) {
                this.app.areaManager.addVertex(x, y);
                // Firebase連携: エリア更新
                // [TEMP_DISABLE_FIREBASE]
                // this.app.firebaseSyncManager.updateAreaToFirebase(selectedAreaIndex);
                this.app.redrawCanvas();
            } else {
                UIHelper.showWarning('頂点を追加するには、まずエリアを選択してください');
            }
        }
    }

    /**
     * 新規ポイント作成
     */
    async createNewPoint(x, y) {
        // 追加後のインデックスを事前に計算
        const newIndex = this.app.pointManager.getPoints().length;

        // 新規ポイント追加（onChangeのredrawInputBoxesをスキップして二重描画を防ぐ）
        this.app.pointManager.addPoint(x, y, '', true);

        // 入力ボックスを再描画し、新規ポイントにフォーカス（カーソル）を当てる
        await this.app.inputManager.redrawInputBoxes(this.app.pointManager.getPoints(), newIndex);

        // 描画更新
        this.app.redrawCanvas();
    }

    /**
     * 新規スポット作成
     */
    async createNewSpot(x, y) {
        // 追加後のインデックスを事前に計算
        const newIndex = this.app.spotManager.getSpots().length;

        // 新規スポット追加（onChangeのredrawSpotInputBoxesをスキップして二重描画を防ぐ）
        this.app.spotManager.addSpot(x, y, '', true);

        // 描画更新
        this.app.redrawCanvas();

        // スポット入力ボックスを再描画し、完了を待機
        await this.app.inputManager.redrawSpotInputBoxes(this.app.spotManager.getSpots());

        // 新規スポットの入力欄にフォーカス（カーソルを移動）
        UIHelper.focusInputForSpot(newIndex);
    }
    /**
     * ルート編集モードでポイント/スポット選択時の処理
     * @param {Object} objectInfo - オブジェクト情報
     */
    handleRoutePointSelection(objectInfo) {
        const selectedRoute = this.app.routeManager.getSelectedRoute();
        if (!selectedRoute) {
            UIHelper.showWarning('先にルートを選択または追加してください');
            return;
        }

        let selectedName = '';

        // ポイントIDまたはスポット名を取得
        if (objectInfo.type === 'point') {
            const points = this.app.pointManager.getPoints();
            const point = points[objectInfo.index];
            selectedName = point.id || '';
            if (!selectedName) {
                UIHelper.showWarning('このポイントにはIDが設定されていません');
                return;
            }
        } else if (objectInfo.type === 'spot') {
            const spots = this.app.spotManager.getSpots();
            const spot = spots[objectInfo.index];
            selectedName = spot.name || '';
            if (!selectedName) {
                UIHelper.showWarning('このスポットには名前が設定されていません');
                return;
            }
        }

        // 開始ポイントが未設定の場合は開始ポイントに設定
        if (!selectedRoute.startPointId) {
            this.app.routeManager.setStartPoint(selectedName, true);
            UIHelper.showMessage(`開始ポイントを "${selectedName}" に設定しました。終了ポイントを画像上で選択してください`);
        }
        // 開始ポイントは設定済みで終了ポイントが未設定の場合は終了ポイントに設定
        else if (!selectedRoute.endPointId) {
            this.app.routeManager.setEndPoint(selectedName, true);
            UIHelper.showMessage(`終了ポイントを "${selectedName}" に設定しました`);
            // 両方設定完了したので入力フィールドをreadonly（変更不可）にする
            this.app.setRouteInputsEditable(false);
        }
        // 両方設定済みの場合は何もしない（中間点追加モード）
        else {
            // 中間点追加モードでは、ポイント/SPOTクリックでは開始・終了ポイントを変更しない
            return;
        }
    }
}

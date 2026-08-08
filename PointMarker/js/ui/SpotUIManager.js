import { UIHelper } from './UIHelper.js';
import { DUPLICATE_SPOT_DISTANCE } from '../data/SpotManager.js';

/**
 * スポット編集モードの操作（領域指定によるスポット削除）を管理するクラス
 *
 * MapEditorの「重複スポット抽出」と同様に、ボタンで領域選択モードに入り、
 * 画像上をドラッグして囲んだ矩形範囲に対して削除処理を行う。
 * - 'duplicate': 範囲内の重複スポット（同名かつ近接）を1つ残して削除
 * - 'all':       範囲内のスポットをすべて削除
 */
export class SpotUIManager {
    /**
     * @param {PointMarkerApp} app - アプリケーションのメインインスタンス
     */
    constructor(app) {
        this.app = app;

        // 領域選択モードの種別（null | 'duplicate' | 'all'）
        this.regionMode = null;
        // 矩形ドラッグ中かどうか
        this.isSelecting = false;
        this.startX = 0;
        this.startY = 0;
        this.currentX = 0;
        this.currentY = 0;

        // ボタンと領域選択モードの対応
        this.buttonIds = {
            duplicate: 'deleteDuplicateSpotsBtn',
            all: 'deleteSpotsInRegionBtn'
        };
    }

    /**
     * 領域選択モードの開始／解除を切り替え
     * @param {string} mode - 'duplicate' または 'all'
     */
    toggleRegionMode(mode) {
        if (this.regionMode === mode) {
            this.exitRegionMode();
            UIHelper.showMessage('領域の指定を解除しました');
            return;
        }

        this.enterRegionMode(mode);
    }

    /**
     * 領域選択モードを開始
     * @param {string} mode - 'duplicate' または 'all'
     */
    enterRegionMode(mode) {
        if (!this.app.currentImage) {
            UIHelper.showWarning('先にPNG画像を読み込んでください');
            return;
        }

        this.regionMode = mode;
        this.isSelecting = false;
        this.updateButtonStates();

        // 領域選択中はスポット名ポップアップをマウス操作の対象外にする
        // （ポップアップ上を通過してもドラッグが途切れないようにするため）
        document.body.classList.add('spot-region-selecting');

        const target = (mode === 'duplicate') ? '重複スポット' : 'スポット';
        UIHelper.showMessage(`削除する${target}の範囲を画像上でドラッグして囲んでください（ボタンを再クリックで解除）`);
    }

    /**
     * 領域選択モードを解除
     */
    exitRegionMode() {
        if (!this.regionMode && !this.isSelecting) return;

        const wasSelecting = this.isSelecting;
        this.regionMode = null;
        this.isSelecting = false;
        this.updateButtonStates();

        document.body.classList.remove('spot-region-selecting');

        // ドラッグ中に解除された場合は矩形を消すために再描画
        if (wasSelecting) {
            this.app.redrawCanvas();
        }
    }

    /**
     * 領域選択モードが有効かどうか
     * @returns {boolean}
     */
    isRegionModeActive() {
        return this.regionMode !== null;
    }

    /**
     * 矩形ドラッグ中かどうか
     * @returns {boolean}
     */
    isSelectingRegion() {
        return this.isSelecting;
    }

    /**
     * ボタンの選択状態（active）を更新
     */
    updateButtonStates() {
        Object.entries(this.buttonIds).forEach(([mode, buttonId]) => {
            const button = document.getElementById(buttonId);
            if (!button) return;
            button.classList.toggle('active', this.regionMode === mode);
        });
    }

    /**
     * 矩形ドラッグ開始
     * @param {number} x - キャンバス座標X
     * @param {number} y - キャンバス座標Y
     */
    startRegionSelection(x, y) {
        this.isSelecting = true;
        this.startX = x;
        this.startY = y;
        this.currentX = x;
        this.currentY = y;

        // キャンバス外でマウスを離した場合にも確実に処理を終える
        // （キャンバス上で離した場合はキャンバスのmouseupが先に処理するため、ここでは何もしない）
        window.addEventListener('mouseup', () => {
            if (this.isSelecting) {
                this.finishRegionSelection();
            }
        }, { once: true });
    }

    /**
     * 矩形ドラッグ中の範囲更新（矩形の再描画）
     * @param {number} x - キャンバス座標X
     * @param {number} y - キャンバス座標Y
     */
    updateRegionSelection(x, y) {
        this.currentX = x;
        this.currentY = y;

        this.app.redrawCanvas();
        this.app.canvasRenderer.drawDeletionRectangle(
            this.startX,
            this.startY,
            this.currentX,
            this.currentY
        );
    }

    /**
     * 矩形ドラッグ終了（削除処理の実行）
     */
    finishRegionSelection() {
        if (!this.isSelecting) return;

        const mode = this.regionMode;
        this.isSelecting = false;
        this.app.redrawCanvas(); // 矩形を消す

        // ドラッグ距離が3px未満の場合は単なるクリックとみなして何もしない
        const dragDistance = Math.hypot(this.currentX - this.startX, this.currentY - this.startY);
        if (dragDistance < 3) return;

        if (mode === 'duplicate') {
            this.deleteDuplicateSpotsInRegion();
        } else if (mode === 'all') {
            this.deleteAllSpotsInRegion();
        }
    }

    /**
     * 指定範囲内の重複スポット（同名かつ近接）を1つ残して削除
     */
    deleteDuplicateSpotsInRegion() {
        const duplicateGroups = this.app.spotManager.findDuplicateSpotsInRectangle(
            this.startX, this.startY, this.currentX, this.currentY
        );

        if (duplicateGroups.length === 0) {
            UIHelper.showWarning(`指定した範囲に重複スポット（同名かつ${DUPLICATE_SPOT_DISTANCE}px以内）は見つかりませんでした`);
            return;
        }

        const removeIndexes = duplicateGroups.flatMap(group => group.removeIndexes);
        const detail = duplicateGroups
            .slice(0, 10)
            .map(group => `・${group.name}（${group.removeIndexes.length + 1}個 → 1個）`)
            .join('\n');
        const omitted = duplicateGroups.length > 10 ? `\n…ほか${duplicateGroups.length - 10}件` : '';

        const message = `重複スポット${removeIndexes.length}個を削除しますか？\n`
            + `（同名のスポットごとに1個だけ残します）\n\n${detail}${omitted}`
            + this.buildRouteUsageWarning(removeIndexes);

        if (!confirm(message)) {
            UIHelper.showMessage('削除をキャンセルしました');
            return;
        }

        const deletedCount = this.app.spotManager.removeSpots(removeIndexes);
        UIHelper.showMessage(`重複スポットを${deletedCount}個削除しました`);
    }

    /**
     * 指定範囲内のスポットをすべて削除
     */
    deleteAllSpotsInRegion() {
        const spotsInRect = this.app.spotManager.findSpotsInRectangle(
            this.startX, this.startY, this.currentX, this.currentY
        );

        if (spotsInRect.length === 0) {
            UIHelper.showWarning('指定した範囲にスポットが見つかりませんでした');
            return;
        }

        const names = spotsInRect.map(({ spot }) => `・${(spot.name || '').trim() || '（名称未設定）'}`);
        const detail = names.slice(0, 10).join('\n');
        const omitted = names.length > 10 ? `\n…ほか${names.length - 10}個` : '';

        const removeIndexes = spotsInRect.map(({ index }) => index);
        const message = `指定した範囲内のスポット${spotsInRect.length}個を削除しますか？\n\n${detail}${omitted}`
            + this.buildRouteUsageWarning(removeIndexes);

        if (!confirm(message)) {
            UIHelper.showMessage('削除をキャンセルしました');
            return;
        }

        const deletedCount = this.app.spotManager.removeSpots(removeIndexes);
        UIHelper.showMessage(`${deletedCount}個のスポットを削除しました`);
    }

    /**
     * 削除対象のスポットがルートの開始・終了ポイントに使われている場合の警告文を作成
     * @param {Array<number>} removeIndexes - 削除対象スポットのインデックス配列
     * @returns {string} 警告文（該当なしの場合は空文字列）
     */
    buildRouteUsageWarning(removeIndexes) {
        const spots = this.app.spotManager.getSpots();
        const routes = this.app.routeManager.getAllRoutes();

        const usedNames = new Set();
        removeIndexes.forEach(index => {
            const spot = spots[index];
            const name = spot && (spot.name || '').trim();
            if (!name) return;

            const isUsed = routes.some(route => route.startPointId === name || route.endPointId === name);
            if (isUsed) {
                usedNames.add(name);
            }
        });

        if (usedNames.size === 0) return '';

        return `\n\n【注意】次のスポットはルートの開始・終了ポイントに使われています:\n`
            + [...usedNames].map(name => `・${name}`).join('\n');
    }
}

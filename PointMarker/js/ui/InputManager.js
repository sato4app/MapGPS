import { CoordinateUtils } from '../utils/Coordinates.js';
import { Validators } from '../utils/Validators.js';

/**
 * 動的入力フィールドの管理を行うクラス
 */
export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.inputElements = [];
        this.spotInputElements = [];
        this.isRouteEditMode = false;
        this.isSpotEditMode = false;
        this.highlightedPointIds = new Set(); // 強調表示するポイントIDのセット
        this.highlightedSpotNames = new Set(); // 強調表示するスポット名のセット
        this.errorSpotNames = new Set(); // エラー状態のスポット名のセット
        this.spotNameVisibility = false; // スポット名表示チェックボックスの状態
        // ズーム・パン状態
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.callbacks = {
            onPointIdChange: null,
            onPointRemove: null,
            onSpotNameChange: null,
            onSpotRemove: null
        };
    }

    /**
     * コールバック関数を設定
     * @param {string} event - イベント名
     * @param {Function} callback - コールバック関数
     */
    setCallback(event, callback) {
        this.callbacks[event] = callback;
    }

    /**
     * 変更通知を発行
     * @param {string} event - イベント名
     * @param {any} data - イベントデータ
     */
    notify(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event](data);
        }
    }

    /**
     * 編集モードを設定
     * @param {string} mode - 編集モード ('point', 'route', 'spot')
     */
    setEditMode(mode) {
        this.isRouteEditMode = (mode === 'route');
        this.isSpotEditMode = (mode === 'spot');

        if (mode !== 'route') {
            // ルート編集モード終了時は強調表示とエラー状態をクリア
            this.highlightedPointIds.clear();
            this.highlightedSpotNames.clear();
            this.errorSpotNames.clear();
        }

        this.updateInputsState();
        this.updateSpotInputsState();
    }


    /**
     * 指定したポイントIDを強調表示
     * @param {Array<string>} pointIds - 強調表示するポイントIDの配列
     */
    setHighlightedPoints(pointIds) {
        this.highlightedPointIds.clear();
        if (pointIds) {
            pointIds.forEach(id => {
                if (id && id.trim()) {
                    this.highlightedPointIds.add(id);
                }
            });
        }
        this.updateInputsState();
    }

    /**
     * 指定したスポット名を強調表示
     * @param {Array<string>} spotNames - 強調表示するスポット名の配列
     */
    setHighlightedSpotNames(spotNames) {
        this.highlightedSpotNames.clear();
        if (spotNames) {
            spotNames.forEach(name => {
                if (name && name.trim()) {
                    this.highlightedSpotNames.add(name);
                }
            });
        }
        this.updateSpotInputsState();
    }

    /**
     * 指定したスポット名をエラー状態に設定
     * @param {Array<string>} spotNames - エラー状態にするスポット名の配列
     */
    setErrorSpotNames(spotNames) {
        this.errorSpotNames.clear();
        if (spotNames) {
            spotNames.forEach(name => {
                if (name && name.trim()) {
                    this.errorSpotNames.add(name);
                }
            });
        }
        this.updateSpotInputsState();
    }

    /**
     * ポイント入力状態を更新
     */
    updateInputsState() {
        this.inputElements.forEach(input => {
            const inputValue = input.value;
            const isHighlighted = this.highlightedPointIds.has(inputValue);
            const container = input._container;

            if (this.isSpotEditMode) {
                // スポット編集モード時は編集不可にする（表示/非表示はチェックボックスで制御）
                input.disabled = true;
                input.style.backgroundColor = '#f0f0f0';
                if (container) {
                    container.style.backgroundColor = '#f0f0f0';
                    container.style.border = '1px solid #ccc';
                }
                input.title = 'スポット編集モード中はポイントID名の編集はできません';
            } else if (this.isRouteEditMode) {
                // ルート編集モードでは表示し、開始・終了ポイントを強調
                if (container) {
                    container.style.display = 'block';
                }
                input.disabled = true;
                if (isHighlighted) {
                    // 開始・終了ポイントとして指定されている場合は白背景
                    input.style.backgroundColor = 'white';
                    if (container) {
                        container.style.backgroundColor = 'white';
                        container.style.border = '2px solid #007bff';
                    }
                    input.title = '開始または終了ポイントとして指定されています';
                } else {
                    // ルート編集モード時の背景色
                    input.style.backgroundColor = '#e0e0e0';
                    if (container) {
                        container.style.backgroundColor = '#e0e0e0';
                        container.style.border = '2px solid #999';
                    }
                    input.title = 'ルート編集モード中はポイントID名の編集はできません';
                }
            } else {
                // ポイント編集モードでは通常表示
                if (container) {
                    container.style.display = 'block';
                }
                input.disabled = false;
                input.style.backgroundColor = '';
                if (container) {
                    container.style.backgroundColor = '';
                    container.style.border = '';
                }
                input.title = '';
            }
        });
    }

    /**
     * ポイント用の入力ボックスを作成
     * @param {Object} point - ポイントオブジェクト
     * @param {number} index - ポイントのインデックス
     * @param {boolean} shouldFocus - フォーカスするかどうか
     */
    createInputBox(point, index, shouldFocus = false) {
        
        // ポップアップコンテナを作成
        const container = document.createElement('div');
        container.className = 'point-id-popup';
        container.style.position = 'absolute';
        container.style.zIndex = '1100';

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 4;
        input.className = 'point-id-input';
        input.placeholder = 'ID';
        input.value = point.id || '';
        
        container.appendChild(input);
        
        this.positionInputBox(container, point);
        
        // input時は変換処理を一切行わない
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            
            // 入力中は変換処理なし、そのまま保存（表示更新なし）
            this.notify('onPointIdChange', { index, id: value, skipFormatting: true, skipDisplay: true });
        });
        
        // blur時はフォーマット処理を実行して保存
        input.addEventListener('blur', (e) => {
            const value = e.target.value.trim();

            // フォーマット処理なしで通知（PointManager側で処理）
            this.notify('onPointIdChange', { index, id: value, skipFormatting: false });
            container.classList.remove('is-editing');
        });
        
        // キーボードイベント（Escapeキーでポイント削除）
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.notify('onPointRemove', { index, point });
            }
        });
        
        // フォーカス時に編集中スタイル
        input.addEventListener('focus', () => {
            container.classList.add('is-editing');
        });
        
        // ポイントインデックスを属性として設定
        input.setAttribute('data-point-index', index);
        
        document.body.appendChild(container);
        this.inputElements.push(input);
        // 入力からコンテナへ参照
        input._container = container;

        // 編集モードの状態を適用
        if (this.isSpotEditMode) {
            // スポット編集モード時はポイントID名ポップアップを完全に非表示
            container.style.display = 'none';
        } else if (this.isRouteEditMode) {
            // ルート編集モードでは表示し、開始・終了ポイントを強調
            const isHighlighted = this.highlightedPointIds.has(point.id);
            input.disabled = true;
            if (isHighlighted) {
                // 開始・終了ポイントとして指定されている場合は白背景
                input.style.backgroundColor = 'white';
                container.style.backgroundColor = 'white';
                container.style.border = '2px solid #007bff';
                input.title = '開始または終了ポイントとして指定されています';
            } else {
                // ルート編集モード時の背景色
                input.style.backgroundColor = '#e0e0e0';
                container.style.backgroundColor = '#e0e0e0';
                container.style.border = '2px solid #999';
                input.title = 'ルート編集モード中はポイントID名の編集はできません';
            }
        }

        if (shouldFocus) {
            setTimeout(() => {
                input.focus();
                // カーソルを末尾に設定
                input.setSelectionRange(input.value.length, input.value.length);
            }, 0);
        }
    }

    /**
     * ズーム・パン状態を更新し、全ポップアップ位置を再計算
     * @param {number} scale - ズーム倍率
     * @param {number} offsetX - X方向オフセット
     * @param {number} offsetY - Y方向オフセット
     * @param {Array} points - ポイント配列
     * @param {Array} spots - スポット配列
     */
    updateTransform(scale, offsetX, offsetY, points = [], spots = []) {
        this.scale = scale;
        this.offsetX = offsetX;
        this.offsetY = offsetY;

        // 既存のポップアップを全て削除
        this.clearInputBoxes();
        this.clearSpotInputBoxes();

        // ポップアップを再作成
        points.forEach((point, index) => {
            this.createInputBox(point, index, false);
        });

        // スポット入力ボックスを常に再作成（表示・非表示はupdateSpotInputsStateで制御）
        spots.forEach((spot, index) => {
            this.createSpotInputBox(spot, index, false);
        });
    }

    /**
     * 入力ボックスの最適な表示位置を計算・設定
     * @param {HTMLInputElement} input - 入力要素
     * @param {Object} point - ポイントオブジェクト
     */
    positionInputBox(container, point) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width / this.canvas.width;
        const scaleY = rect.height / this.canvas.height;

        // ズーム・パン変換を適用
        const transformedX = point.x * this.scale + this.offsetX;
        const transformedY = point.y * this.scale + this.offsetY;

        const inputX = this.findOptimalInputPosition(transformedX, transformedY, scaleX, rect.left);
        const inputY = transformedY * scaleY + rect.top - 15;

        container.style.left = inputX + 'px';
        container.style.top = inputY + 'px';
    }

    /**
     * 画面端を考慮した入力ボックスの横位置計算
     * @param {number} pointX - ポイントX座標
     * @param {number} pointY - ポイントY座標
     * @param {number} scaleX - X方向スケール
     * @param {number} canvasLeft - キャンバス左端位置
     * @returns {number} 最適な横位置
     */
    findOptimalInputPosition(pointX, pointY, scaleX, canvasLeft) {
        const inputWidth = 50;
        const margin = 10;
        const scaledPointX = pointX * scaleX + canvasLeft;
        
        const rightPos = scaledPointX + margin;
        const leftPos = scaledPointX - inputWidth - margin;
        
        if (rightPos + inputWidth < window.innerWidth - 20) {
            return rightPos;
        } else {
            return Math.max(leftPos, canvasLeft + 5);
        }
    }

    /**
     * 特定のポイントのIDのみを更新（入力ボックスは再作成しない）
     * @param {number} pointIndex - 更新するポイントのインデックス
     * @param {string} newId - 新しいID
     */
    updatePointIdDisplay(pointIndex, newId) {
        const input = this.inputElements.find((element) => {
            // 入力要素に紐づくポイントのインデックスを確認
            return element.getAttribute('data-point-index') == pointIndex;
        });
        if (input && input.value !== newId) {
            input.value = newId;
        }
    }

    /**
     * 全入力ボックスをクリア・再作成
     * @param {Array} points - ポイント配列
     */
    redrawInputBoxes(points) {
        this.clearInputBoxes();
        
        setTimeout(() => {
            points.forEach((point, index) => {
                this.createInputBox(point, index);
                const input = this.inputElements[this.inputElements.length - 1];
                if (input) {
                    input.value = point.id || '';
                    input.setAttribute('data-point-index', index);
                }
            });
        }, 10);
    }

    /**
     * スポット用の入力ボックスを作成
     * @param {Object} spot - スポットオブジェクト
     * @param {number} index - スポットのインデックス
     * @param {boolean} shouldFocus - フォーカスするかどうか
     */
    createSpotInputBox(spot, index, shouldFocus = false) {
        // ポップアップコンテナを作成
        const container = document.createElement('div');
        container.className = 'spot-name-popup';
        container.style.position = 'absolute';
        container.style.zIndex = '1100';

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 10;  // 10文字程度に設定
        input.className = 'spot-name-input';
        input.placeholder = 'スポット名';
        input.value = spot.name || '';
        
        container.appendChild(input);
        
        this.positionSpotInputBox(container, spot);
        
        // input時は変換処理を一切行わない
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            // 入力中は変換処理なし、そのまま保存（表示更新なし）
            this.notify('onSpotNameChange', { index, name: value, skipFormatting: true, skipDisplay: true });
        });

        // blur時はフォーマット処理を実行して保存
        input.addEventListener('blur', (e) => {
            const value = e.target.value.trim();
            // フォーマット処理を実行（SpotManager側で処理）
            this.notify('onSpotNameChange', { index, name: value, skipFormatting: false });
            container.classList.remove('is-editing');
        });
        
        // キーボードイベント（Escapeキーでスポット削除）
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.notify('onSpotRemove', { index, spot });
            }
        });
        
        // フォーカス時に編集中スタイル
        input.addEventListener('focus', () => {
            container.classList.add('is-editing');
        });
        
        // スポットインデックスを属性として設定
        input.setAttribute('data-spot-index', index);
        
        document.body.appendChild(container);
        this.spotInputElements.push(input);
        // 入力からコンテナへ参照
        input._container = container;

        if (shouldFocus) {
            setTimeout(() => {
                input.focus();
                // カーソルを末尾に設定
                input.setSelectionRange(input.value.length, input.value.length);
            }, 0);
        }
    }

    /**
     * スポット入力ボックスの最適な表示位置を計算・設定
     * @param {HTMLElement} container - コンテナ要素
     * @param {Object} spot - スポットオブジェクト
     */
    positionSpotInputBox(container, spot) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width / this.canvas.width;
        const scaleY = rect.height / this.canvas.height;

        // ズーム・パン変換を適用
        const transformedX = spot.x * this.scale + this.offsetX;
        const transformedY = spot.y * this.scale + this.offsetY;

        const inputX = this.findOptimalInputPosition(transformedX, transformedY, scaleX, rect.left);
        const inputY = transformedY * scaleY + rect.top - 15;

        container.style.left = inputX + 'px';
        container.style.top = inputY + 'px';
    }

    /**
     * スポット入力状態を更新
     */
    updateSpotInputsState() {
        this.spotInputElements.forEach(input => {
            const container = input._container;

            if (!container) return;

            const inputValue = input.value;
            const isHighlighted = this.highlightedSpotNames.has(inputValue);
            const isError = this.errorSpotNames.has(inputValue);

            // スポット編集モードの場合は常に表示・編集可能
            if (this.isSpotEditMode) {
                container.style.display = 'block';
                input.disabled = false;
                input.style.backgroundColor = '';
                container.style.backgroundColor = '';
                container.style.border = '';
                input.title = '';
                return;
            }

            // ルート編集モードでチェックボックスがオンの場合
            if (this.isRouteEditMode && this.spotNameVisibility) {
                container.style.display = 'block';

                if (isError) {
                    // エラー状態の場合はピンク背景（複数一致など）
                    input.disabled = true;
                    input.style.backgroundColor = '#ffebee';
                    container.style.backgroundColor = '#ffebee';
                    container.style.border = '2px solid #f44336';
                    input.title = 'このスポット名は複数一致の対象です';
                } else if (isHighlighted) {
                    // 開始・終了ポイントとして指定されている場合は白背景（ポイントIDと同じ扱い）
                    input.disabled = true;
                    input.style.backgroundColor = 'white';
                    container.style.backgroundColor = 'white';
                    container.style.border = '2px solid #007bff';
                    input.title = '開始または終了ポイントとして指定されています';
                } else {
                    // 通常のスポット名は灰色背景
                    input.disabled = true;
                    input.style.backgroundColor = '#e0e0e0';
                    container.style.backgroundColor = '#e0e0e0';
                    container.style.border = '2px solid #999';
                    input.title = 'ルート編集モード中はスポット名の編集はできません';
                }
                return;
            }

            // その他のモードでチェックボックスがオンの場合
            if (this.spotNameVisibility) {
                container.style.display = 'block';
                input.disabled = false;
                input.style.backgroundColor = '';
                container.style.backgroundColor = '';
                container.style.border = '';
                input.title = '';
            } else {
                container.style.display = 'none';
            }
        });
    }

    /**
     * 特定のスポットの名前のみを更新（入力ボックスは再作成しない）
     * @param {number} spotIndex - 更新するスポットのインデックス
     * @param {string} newName - 新しいスポット名
     */
    updateSpotNameDisplay(spotIndex, newName) {
        const input = this.spotInputElements.find((element) => {
            // 入力要素に紐づくスポットのインデックスを確認
            return element.getAttribute('data-spot-index') == spotIndex;
        });
        if (input && input.value !== newName) {
            input.value = newName;
        }
    }

    /**
     * 全スポット入力ボックスをクリア・再作成
     * @param {Array} spots - スポット配列
     */
    redrawSpotInputBoxes(spots) {
        this.clearSpotInputBoxes();

        // スポット編集モードまたはスポット名表示チェックボックスがオンの時のみ再作成
        if (this.isSpotEditMode || this.spotNameVisibility) {
            setTimeout(() => {
                spots.forEach((spot, index) => {
                    this.createSpotInputBox(spot, index);
                    const input = this.spotInputElements[this.spotInputElements.length - 1];
                    if (input) {
                        input.value = spot.name || '';
                        input.setAttribute('data-spot-index', index);
                    }
                });
            }, 10);
        }
    }

    /**
     * 全ての動的入力ボックスをDOMから削除
     */
    clearInputBoxes() {
        this.inputElements.forEach(input => {
            const container = input && input._container;
            if (container && container.parentNode) {
                container.parentNode.removeChild(container);
            } else if (input && input.parentNode) {
                // 後方互換（コンテナ未設定の場合）
                input.parentNode.removeChild(input);
            }
        });
        this.inputElements = [];
    }

    /**
     * 全スポット入力ボックスをDOMから削除
     */
    clearSpotInputBoxes() {
        this.spotInputElements.forEach(input => {
            const container = input && input._container;
            if (container && container.parentNode) {
                container.parentNode.removeChild(container);
            } else if (input && input.parentNode) {
                // 後方互換（コンテナ未設定の場合）
                input.parentNode.removeChild(input);
            }
        });
        this.spotInputElements = [];
    }

    /**
     * 全ての入力ボックスをクリア
     */
    clearAllInputBoxes() {
        this.clearInputBoxes();
        this.clearSpotInputBoxes();
    }

    /**
     * ポイントID入力ボックスの表示/非表示を切り替え
     * @param {boolean} visible - 表示するかどうか
     */
    setPointIdVisibility(visible) {
        this.inputElements.forEach(input => {
            const container = input._container;
            if (container) {
                // visibleがtrueの場合は表示、falseの場合は非表示
                // ただし、updateInputsState()で設定されたスタイルは維持
                if (visible) {
                    // スポット編集モード時でもチェックボックスがオンなら表示
                    container.style.display = 'block';
                } else {
                    // チェックボックスがオフなら非表示
                    container.style.display = 'none';
                }
            }
        });
    }

    /**
     * スポット名入力ボックスの表示/非表示を切り替え
     * @param {boolean} visible - 表示するかどうか
     * @param {Array} spots - スポットデータの配列（オプション）
     */
    setSpotNameVisibility(visible, spots = null) {
        // チェックボックスの状態を保存
        this.spotNameVisibility = visible;

        // 表示する場合は、すべてのスポット入力ボックスの位置を再計算
        if (visible && spots) {
            this.spotInputElements.forEach(input => {
                const container = input._container;
                if (!container) return;

                const spotIndex = parseInt(input.getAttribute('data-spot-index'));
                const spot = spots[spotIndex];

                if (spot) {
                    this.positionSpotInputBox(container, spot);
                }
            });
        }

        // スポット入力状態を更新
        this.updateSpotInputsState();
    }
}
/**
 * PanelDragHandler
 * コントロールパネル（.controls-sidebar）をマウスでドラッグ移動できるようにする。
 *
 * - タイトル領域（h2）をドラッグハンドルとして使用
 * - ドラッグ中はパネルを top/left で絶対配置し、ビューポート内に収まるよう制限
 * - 入力要素（input, button, select 等）の上ではドラッグを開始しない
 */
export class PanelDragHandler {
    /**
     * @param {HTMLElement} panel - ドラッグ対象のパネル要素
     * @param {HTMLElement} handle - ドラッグ開始のハンドル要素（通常はパネル内のヘッダー）
     */
    constructor(panel, handle) {
        this.panel = panel;
        this.handle = handle;

        this.isDragging = false;
        this.startMouseX = 0;
        this.startMouseY = 0;
        this.startPanelLeft = 0;
        this.startPanelTop = 0;

        // bind してリスナー解除に備える
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);

        this.init();
    }

    init() {
        if (!this.panel || !this.handle) return;

        // ハンドルを「掴める」見た目に
        this.handle.style.cursor = 'move';
        this.handle.style.userSelect = 'none';

        this.handle.addEventListener('mousedown', this.onMouseDown);
    }

    onMouseDown(e) {
        // 左クリック以外は無視
        if (e.button !== 0) return;

        // 入力要素やボタンの上ではドラッグを開始しない
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') {
            return;
        }

        const rect = this.panel.getBoundingClientRect();

        // right 指定を無効化して、left/top で位置制御する
        this.panel.style.right = 'auto';
        this.panel.style.left = `${rect.left}px`;
        this.panel.style.top = `${rect.top}px`;

        this.isDragging = true;
        this.startMouseX = e.clientX;
        this.startMouseY = e.clientY;
        this.startPanelLeft = rect.left;
        this.startPanelTop = rect.top;

        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);

        e.preventDefault();
    }

    onMouseMove(e) {
        if (!this.isDragging) return;

        const dx = e.clientX - this.startMouseX;
        const dy = e.clientY - this.startMouseY;

        let newLeft = this.startPanelLeft + dx;
        let newTop = this.startPanelTop + dy;

        // ビューポート内に収めるための制限
        const panelWidth = this.panel.offsetWidth;
        const panelHeight = this.panel.offsetHeight;
        const maxLeft = window.innerWidth - panelWidth;
        const maxTop = window.innerHeight - panelHeight;

        if (newLeft < 0) newLeft = 0;
        if (newTop < 0) newTop = 0;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop > maxTop) newTop = maxTop;

        this.panel.style.left = `${newLeft}px`;
        this.panel.style.top = `${newTop}px`;
    }

    onMouseUp() {
        if (!this.isDragging) return;
        this.isDragging = false;
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
    }
}

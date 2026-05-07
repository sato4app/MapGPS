// コースの作成・編集

export function isEditingMode() { return editingMode; }
export function getCourses() { return courses; }
export function setMarkerColors({ selectedPoint, selectedRoute, otherPoint, otherRoute } = {}) {
    if (selectedPoint !== undefined) COURSE_POINT_STYLE.fillColor = selectedPoint;
    if (selectedRoute !== undefined) COURSE_ROUTE_STYLE.color = selectedRoute;
    if (otherPoint  !== undefined) COURSE_POINT_STYLE_OTHER.fillColor = otherPoint;
    if (otherRoute  !== undefined) COURSE_ROUTE_STYLE_OTHER.color = otherRoute;
    renderCourseOverlay();
}

export function loadCourses(newCourses) {
    if (editingMode) exitEditingMode();
    closeNameArea();
    courses.length = 0;
    newCourses.forEach(c => courses.push(c));
    nextId = courses.reduce((max, c) => Math.max(max, c.id), 0) + 1;
    currentIndex = courses.length > 0 ? 0 : -1;
    selectedPointIndex = -1;
    renderSelect();
    renderPointList();
    updateButtons();
}

// courses[i] = { id, name, points: [{ pointId, name }], segmentRoutes: [coords|null,...], fixed: bool }
// segmentRoutes[i] = points[i] → points[i+1] 間のルート座標（一度確定したら保持）
const courses = [];
let currentIndex = -1;
let nextId = 1;
let editingMode = false;
let nameAreaMode = null; // 'new' | 'rename' | null
let selectedPointIndex = -1; // 選択中のポイント行インデックス
let _map = null;
let _markerStore = null;
let _routeFeatureStore = null;
let courseLayer = null;

// コースオーバーレイ: 赤マーカー（interactive: false でクリックを元マーカーに透過）
const COURSE_POINT_STYLE = {
    radius: 8,
    fillColor: '#ff0000',
    color: '#ffffff',
    weight: 1,
    stroke: true,
    opacity: 1,
    fillOpacity: 0.9,
    interactive: false
};

// コースオーバーレイ: オレンジルート（interactive: false でマーカーへのクリックを妨げない）
const COURSE_ROUTE_STYLE = {
    color: '#ff8c00',
    weight: 4,
    opacity: 0.9,
    interactive: false
};

// 非選択コースのスタイル
const COURSE_POINT_STYLE_OTHER = {
    radius: 8,
    fillColor: '#f08080',
    color: '#ffffff',
    weight: 1,
    stroke: true,
    opacity: 1,
    fillOpacity: 0.9,
    interactive: false
};
const COURSE_ROUTE_STYLE_OTHER = {
    color: '#d2b48c',
    weight: 4,
    opacity: 0.9,
    interactive: false
};

// ========================================
// 初期化
// ========================================
export function setupCourseEditor(map, markerStore, routeFeatureStore) {
    _map = map;
    _markerStore = markerStore;
    _routeFeatureStore = routeFeatureStore;
    courseLayer = L.layerGroup().addTo(map);

    document.getElementById('courseNewBtn').addEventListener('click', openNewMode);
    document.getElementById('courseRenameBtn').addEventListener('click', openRenameMode);
    document.getElementById('courseDeleteBtn').addEventListener('click', deleteCourse);
    document.getElementById('courseSelect').addEventListener('change', onSelectChange);
    document.getElementById('courseConfirmBtn').addEventListener('click', confirmName);
    document.getElementById('courseCancelBtn').addEventListener('click', closeNameArea);
    document.getElementById('courseName').addEventListener('keydown', e => {
        if (e.key === 'Enter') confirmName();
        if (e.key === 'Escape') closeNameArea();
    });
    document.getElementById('editStartBtn').addEventListener('click', startEditing);
    document.getElementById('fixBtn').addEventListener('click', fixCourse);
    document.getElementById('pointUpBtn').addEventListener('click', movePointUp);
    document.getElementById('pointDownBtn').addEventListener('click', movePointDown);
    document.getElementById('pointRemoveBtn').addEventListener('click', removePoint);

    document.addEventListener('gpsPointClicked', onGpsPointClicked);

    renderSelect();
    updateButtons();
}

// ========================================
// 名称入力エリア
// ========================================
function openNewMode() {
    nameAreaMode = 'new';
    document.getElementById('courseName').value = '';
    document.getElementById('courseNameArea').style.display = 'block';
    document.getElementById('courseName').focus();
}

function openRenameMode() {
    if (currentIndex < 0) return;
    nameAreaMode = 'rename';
    document.getElementById('courseName').value = courses[currentIndex].name;
    document.getElementById('courseNameArea').style.display = 'block';
    document.getElementById('courseName').focus();
}

function closeNameArea() {
    nameAreaMode = null;
    document.getElementById('courseNameArea').style.display = 'none';
    document.getElementById('courseName').value = '';
}

function confirmName() {
    const name = document.getElementById('courseName').value.trim();
    if (!name) return;

    if (nameAreaMode === 'new') {
        courses.push({ id: nextId++, name, points: [], segmentRoutes: [], fixed: false });
        currentIndex = courses.length - 1;
        renderSelect();
        renderPointList();
    } else if (nameAreaMode === 'rename' && currentIndex >= 0) {
        courses[currentIndex].name = name;
        const opt = document.getElementById('courseSelect').options[currentIndex];
        if (opt) opt.textContent = name;
    }

    closeNameArea();
    updateButtons();
}

// ========================================
// コース操作
// ========================================
function deleteCourse() {
    if (currentIndex < 0 || currentIndex >= courses.length) return;
    if (editingMode) exitEditingMode();
    closeNameArea();
    selectedPointIndex = -1;
    courses.splice(currentIndex, 1);
    currentIndex = courses.length > 0 ? Math.min(currentIndex, courses.length - 1) : -1;
    renderSelect();
    renderPointList();
    updateButtons();
}

function onSelectChange() {
    if (editingMode) exitEditingMode();
    closeNameArea();
    selectedPointIndex = -1;
    const val = parseInt(document.getElementById('courseSelect').value, 10);
    currentIndex = isNaN(val) ? -1 : val;
    renderPointList();
    updateButtons();
}

// ========================================
// コース選択リスト描画
// ========================================
function renderSelect() {
    const sel = document.getElementById('courseSelect');
    sel.innerHTML = '';
    if (courses.length === 0) {
        const opt = document.createElement('option');
        opt.value = -1;
        opt.textContent = '（コースなし）';
        sel.appendChild(opt);
        currentIndex = -1;
    } else {
        courses.forEach((c, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = c.name;
            sel.appendChild(opt);
        });
        sel.value = currentIndex;
    }
}

// ========================================
// 編集モード
// ========================================
function startEditing() {
    if (currentIndex < 0) return;
    const course = courses[currentIndex];
    // 既にポイントが設定済みの場合はクリアせず、そのまま編集を続ける
    if (course.points.length === 0) {
        course.points = [];
    }
    course.fixed = false;
    editingMode = true;
    if (_map) _map.getContainer().style.cursor = 'crosshair';
    renderPointList();
    updateButtons();
}

function fixCourse() {
    if (currentIndex < 0) return;
    courses[currentIndex].fixed = true;
    exitEditingMode();
    renderPointList();
}

function exitEditingMode() {
    editingMode = false;
    if (_map) _map.getContainer().style.cursor = '';
    updateButtons();
}

function onGpsPointClicked(e) {
    if (!editingMode || currentIndex < 0) return;
    const { pointId, name } = e.detail;
    const course = courses[currentIndex];

    if (selectedPointIndex >= 0 && selectedPointIndex < course.points.length) {
        // 選択行の次に挿入
        const insertIndex = selectedPointIndex + 1;
        course.points.splice(insertIndex, 0, { pointId, name });

        const N = course.points.length; // 挿入後の要素数
        if (insertIndex >= N - 1) {
            // 末尾への追加
            course.segmentRoutes.push(null);
        } else {
            // 中間への挿入: 既存セグメントを2つのnullスロットに置換
            course.segmentRoutes.splice(insertIndex - 1, 1, null, null);
        }

        selectedPointIndex = insertIndex;
    } else {
        // 選択なし: 末尾に追加
        course.points.push({ pointId, name });
        if (course.segmentRoutes.length < course.points.length - 1) {
            course.segmentRoutes.push(null);
        }
    }

    renderPointList(true);
}

// ========================================
// ポイント移動・削除
// ========================================
function movePointUp() {
    if (currentIndex < 0 || selectedPointIndex <= 0) return;
    const { points, segmentRoutes } = courses[currentIndex];
    const i = selectedPointIndex;
    [points[i - 1], points[i]] = [points[i], points[i - 1]];
    // 前後の隣接セグメントを無効化（接続先が変わるため）
    if (i - 2 >= 0) segmentRoutes[i - 2] = null;
    if (i < segmentRoutes.length) segmentRoutes[i] = null;
    selectedPointIndex = i - 1;
    renderPointList();
}

function movePointDown() {
    if (currentIndex < 0 || selectedPointIndex < 0) return;
    const { points, segmentRoutes } = courses[currentIndex];
    const i = selectedPointIndex;
    if (i >= points.length - 1) return;
    [points[i], points[i + 1]] = [points[i + 1], points[i]];
    // 前後の隣接セグメントを無効化
    if (i - 1 >= 0) segmentRoutes[i - 1] = null;
    if (i + 1 < segmentRoutes.length) segmentRoutes[i + 1] = null;
    selectedPointIndex = i + 1;
    renderPointList();
}

function removePoint() {
    if (currentIndex < 0 || selectedPointIndex < 0) return;
    const { points, segmentRoutes } = courses[currentIndex];
    const i = selectedPointIndex;
    points.splice(i, 1);
    if (points.length === 0) {
        segmentRoutes.length = 0;
    } else if (i === 0) {
        segmentRoutes.splice(0, 1);
    } else if (i >= points.length) {
        // 末尾ポイントを削除した場合
        segmentRoutes.splice(segmentRoutes.length - 1, 1);
    } else {
        // 中間ポイントを削除: 前後2セグメントを除去し、新しい接続にnullを挿入
        segmentRoutes.splice(i - 1, 2, null);
    }
    selectedPointIndex = -1;
    renderPointList();
}

// ========================================
// ボタン有効/無効
// ========================================
function updateButtons() {
    const hasCourse = currentIndex >= 0 && currentIndex < courses.length;
    const total = hasCourse ? courses[currentIndex].points.length : 0;
    const sel = selectedPointIndex;
    document.getElementById('courseRenameBtn').disabled = !hasCourse;
    document.getElementById('courseDeleteBtn').disabled = !hasCourse;
    document.getElementById('editStartBtn').disabled = !hasCourse || editingMode;
    document.getElementById('fixBtn').disabled = !editingMode;
    document.getElementById('pointUpBtn').disabled = sel <= 0;
    document.getElementById('pointDownBtn').disabled = sel < 0 || sel >= total - 1;
    document.getElementById('pointRemoveBtn').disabled = sel < 0;
}

// ========================================
// コースオーバーレイ描画（赤マーカー＋オレンジルート）
// ========================================
function calcRouteLength(coords) {
    let len = 0;
    for (let i = 1; i < coords.length; i++) {
        const dlat = coords[i][0] - coords[i - 1][0];
        const dlng = coords[i][1] - coords[i - 1][1];
        len += Math.sqrt(dlat * dlat + dlng * dlng);
    }
    return len;
}

function renderOneCourse(course, pointStyle, routeStyle) {
    const { points, segmentRoutes } = course;

    points.forEach(p => {
        const m = _markerStore && _markerStore.get(p.pointId);
        if (!m) return;
        L.circleMarker(m.getLatLng(), pointStyle).addTo(courseLayer);
    });

    for (let i = 1; i < points.length; i++) {
        const segIdx = i - 1;

        if (segmentRoutes[segIdx]) {
            L.polyline(segmentRoutes[segIdx], routeStyle).addTo(courseLayer);
            continue;
        }

        if (!_routeFeatureStore) break;
        const prevId = points[i - 1].pointId;
        const currId = points[i].pointId;
        const candidates = _routeFeatureStore.filter(r =>
            (r.startId === prevId && r.endId === currId) ||
            (r.startId === currId && r.endId === prevId)
        );
        if (candidates.length === 0) {
            const prevMarker = _markerStore && _markerStore.get(prevId);
            const currMarker = _markerStore && _markerStore.get(currId);
            if (prevMarker && currMarker) {
                L.polyline([prevMarker.getLatLng(), currMarker.getLatLng()], routeStyle).addTo(courseLayer);
            }
            continue;
        }

        let best = candidates[0];
        if (candidates.length > 1) {
            let minLen = Infinity;
            for (const r of candidates) {
                const len = calcRouteLength(r.coords);
                if (len < minLen) { minLen = len; best = r; }
            }
        }

        segmentRoutes[segIdx] = best.coords;
        L.polyline(best.coords, routeStyle).addTo(courseLayer);
    }
}

function renderCourseOverlay() {
    if (!courseLayer) return;
    courseLayer.clearLayers();
    if (courses.length === 0) return;

    // 非選択コースを先に描画（選択コースが上に重なるよう）
    courses.forEach((course, i) => {
        if (i !== currentIndex) {
            renderOneCourse(course, COURSE_POINT_STYLE_OTHER, COURSE_ROUTE_STYLE_OTHER);
        }
    });

    // 選択コースを後から描画
    if (currentIndex >= 0 && currentIndex < courses.length) {
        renderOneCourse(courses[currentIndex], COURSE_POINT_STYLE, COURSE_ROUTE_STYLE);
    }
}

// ========================================
// ポイントリスト描画
// ========================================
function getNoLabel(index, total, fixed) {
    if (index === 0) return '開始';
    if (fixed && index === total - 1) return '終了';
    return `中間${index}`;
}

function renderPointList(redrawOverlay = true) {
    const container = document.getElementById('pointListContainer');
    container.innerHTML = '';
    if (currentIndex < 0 || currentIndex >= courses.length) {
        if (redrawOverlay) renderCourseOverlay();
        return;
    }

    const { points, fixed } = courses[currentIndex];
    const total = points.length;

    points.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'point-row' + (i === selectedPointIndex ? ' point-row-selected' : '');
        row.addEventListener('click', () => {
            selectedPointIndex = (selectedPointIndex === i) ? -1 : i;
            // 行選択の変更はオーバーレイに影響しないため再描画しない
            renderPointList(false);
            updateButtons();
        });

        const noCell = document.createElement('span');
        noCell.className = 'point-no';
        noCell.textContent = getNoLabel(i, total, fixed);

        const idCell = document.createElement('span');
        idCell.className = 'point-id-cell';
        idCell.textContent = p.pointId;

        const nameCell = document.createElement('span');
        nameCell.className = 'point-name-cell';
        nameCell.textContent = p.name;

        row.appendChild(noCell);
        row.appendChild(idCell);
        row.appendChild(nameCell);
        container.appendChild(row);
    });

    if (redrawOverlay) renderCourseOverlay();
}

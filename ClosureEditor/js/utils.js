// 共通ユーティリティ（日付・座標・文字列）

// 日付文字列生成（yyyymmdd形式。出力ファイル名で使用）
export function getDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// 日付文字列生成（ISO 8601 / YYYY-MM-DD形式。地点の updatedAt で使用）
export function getDateIso() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 日時文字列生成（ISO 8601 / タイムゾーンオフセット付き。出力ファイルの updatedAt で使用）
export function getDateTimeIso() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const offsetMinutes = -now.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const offsetHH = pad(Math.floor(absMinutes / 60));
    const offsetMM = pad(absMinutes % 60);
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
        `${sign}${offsetHH}:${offsetMM}`;
}

// 座標値を小数点以下5桁に丸める（経度・緯度・標高。配列にも再帰対応）
// 内部に保持する座標は読み込んだ精度のままとし、丸めは出力時のみ適用する。
export function roundCoord(value) {
    if (typeof value === 'number') {
        return Math.round(value * 100000) / 100000;
    }
    if (Array.isArray(value)) {
        return value.map(roundCoord);
    }
    return value;
}

// HTMLエスケープ（ポップアップに地点名・備考を埋め込む際に使用）
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// BlobをGeoJSONファイルとして保存（File System Access API、未対応時はダウンロードにフォールバック）
// 戻り値: 保存した場合はtrue、ユーザーがキャンセルした場合はfalse
export async function saveBlobAsFile(blob, filename) {
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: 'GeoJSON Files',
                    accept: { 'application/json': ['.geojson', '.json'] }
                }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return true;
        } catch (err) {
            if (err.name === 'AbortError') {
                return false;
            }
            console.warn('File System Access API使用失敗、フォールバック:', err);
        }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // click直後のrevokeはダウンロード開始前に無効化される場合があるため遅延させる
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
}

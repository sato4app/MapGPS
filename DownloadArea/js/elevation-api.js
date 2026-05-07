/**
 * 国土地理院標高API連携クラス
 */
export class ElevationAPI {
    /**
     * 国土地理院の標高APIから標高データを取得
     * @param {number} lat - 緯度
     * @param {number} lng - 経度
     * @returns {Promise<number|null>} 標高値（メートル、取得失敗時はnull）
     */
    static async fetchElevation(lat, lng) {
        try {
            const url = `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lng}&lat=${lat}&outtype=JSON`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error('標高APIへのアクセスに失敗しました');
            }

            const data = await response.json();

            if (data.elevation !== null && data.elevation !== undefined) {
                // 標高データを小数点1位まで、123.0は123にする
                const elevation = parseFloat(data.elevation);
                const formatted = elevation.toFixed(1);
                return formatted.endsWith('.0') ? Math.round(elevation) : parseFloat(formatted);
            }

            return null;
        } catch (error) {
            console.warn('標高取得エラー:', error);
            return null;
        }
    }

    /**
     * 標高がblankまたは0かチェックする（APIから取得が必要かどうか）
     * @param {string} elevation - 標高値
     * @returns {boolean} API取得が必要かどうか
     */
    static needsElevationFromAPI(elevation) {
        if (!elevation || elevation === '') {
            return true; // blank の場合
        }

        const numValue = parseFloat(elevation);
        if (isNaN(numValue)) {
            return false; // 数値でない場合はAPIから取得しない
        }

        return numValue === 0; // 0 の場合のみAPIから取得
    }
}
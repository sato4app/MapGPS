// 通行止め・通行困難地点（closures）の geojson ファイル入出力
// データ仕様の正本: docs/dataspec-202607.md

import { NON_CLOSURE_TYPES } from './constants.js';
import { showMessage } from './message.js';
import { getDateString, getDateTimeIso, roundCoord, saveBlobAsFile } from './utils.js';
import * as Closure from './closureEditor.js';

// ===== 読み込み =====

// 取り込み対象の Feature か判定する。
// closure 専用ファイルには Point のみが入る想定だが、公開ストアから取得した
// geojson には properties.type が無い（minoh-hiking 設計書で廃止済み）ため、
// type の有無では絞り込まず、統合GeoJSON由来の既知 type だけを除外する。
function isImportableFeature(feature) {
    if (!feature || !feature.geometry || feature.geometry.type !== 'Point') return false;
    if (!Array.isArray(feature.geometry.coordinates)) return false;
    const type = feature.properties && feature.properties.type;
    if (!type || type === 'closure') return true;
    return !NON_CLOSURE_TYPES.includes(type);
}

// closureフィーチャーのプロパティを正規化（読み込み時）
// idが無ければ採番、不正なkind（unknown等）は未選択扱いに、廃止した status は取り除く
function normalizeImportedClosure(feature, existingIds) {
    const props = feature.properties || (feature.properties = {});
    props.type = 'closure';

    if (!props.id) {
        props.id = Closure.nextClosureId(existingIds);
    }
    if (props.kind !== 'closed' && props.kind !== 'difficult') {
        props.kind = '';
    }
    // status は廃止（データ仕様 §3.1）。読み込んだ値は捨てる
    delete props.status;
    return feature;
}

// 読み込んだファイルのトップレベル version を入力欄へ取り込む。
// 入力欄が空のときだけ採用し、既に値があれば上書きしない（意図せぬ巻き戻しの防止）。
// 複数ファイルで version が食い違う場合は採用せず警告する。
function applyLoadedVersion(versions) {
    const input = document.getElementById('closureVersionInput');
    const unique = [...new Set(versions.filter(v => typeof v === 'string' && v.trim()))];

    if (unique.length === 0) return null;
    if (unique.length > 1) {
        return `読み込んだファイルの version が一致しません（${unique.join(' / ')}）。バージョンは手入力してください`;
    }
    if (input.value.trim()) {
        return input.value.trim() === unique[0]
            ? null
            : `読み込んだファイルの version（${unique[0]}）は入力中の値と異なるため取り込みませんでした`;
    }
    input.value = unique[0];
    return null;
}

// ファイル読み込み（複数ファイルをまとめて読み込み可）
export function setupClosureFileLoad() {
    document.getElementById('closureFileInput').addEventListener('change', async function () {
        const files = Array.from(this.files);
        if (files.length === 0) return;

        let addedCount = 0;
        let skippedCount = 0;
        const versions = [];

        try {
            // 既存のclosure IDを収集（ID重複の検出・新規採番に使用）
            const existingIds = Closure.getExistingIds();

            for (const file of files) {
                let json;
                try {
                    json = JSON.parse(await file.text());
                } catch {
                    showMessage(`読み込みエラー (${file.name}): JSONとして読み込めません`, 'error');
                    continue;
                }

                if (!json || json.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
                    showMessage(`読み込みエラー (${file.name}): FeatureCollection 形式の geojson ではありません`, 'error');
                    continue;
                }

                versions.push(json.version);

                json.features.forEach(f => {
                    if (!isImportableFeature(f)) return;

                    // 既存IDと重複する地点はスキップ（IDは全地点で一意）
                    if (f.properties && f.properties.id && existingIds.has(f.properties.id)) {
                        skippedCount++;
                        return;
                    }

                    normalizeImportedClosure(f, existingIds);
                    existingIds.add(f.properties.id);

                    Closure.addLoadedFeature(f);
                    addedCount++;
                });
            }

            Closure.updateClosureDropdown();

            const versionWarning = applyLoadedVersion(versions);

            if (addedCount > 0) {
                const msg = `${addedCount}件の地点を読み込みました`
                    + (skippedCount > 0 ? `（ID重複${skippedCount}件をスキップ）` : '');
                showMessage(versionWarning ? `${msg}\n${versionWarning}` : msg,
                    versionWarning ? 'warning' : 'success');
            } else if (skippedCount > 0) {
                showMessage(`${skippedCount}件すべてがID重複のためスキップされました`, 'warning');
            } else {
                showMessage('通行止め・通行困難地点のデータが見つかりませんでした', 'warning');
            }
        } catch (error) {
            console.error('Closure load error:', error);
            showMessage(`読み込みエラー: ${error.message}`, 'error');
        } finally {
            this.value = '';
        }
    });
}

// ===== 出力 =====

// closureフィーチャーをスキーマ準拠のプロパティ順に整形（出力時）
function buildClosureExportFeature(feature) {
    const p = feature.properties || {};
    const props = {
        type: 'closure',
        id: p.id || '',
        name: p.name || '',
        kind: (p.kind === 'closed' || p.kind === 'difficult') ? p.kind : 'unknown'
    };
    if (p.reason) props.reason = p.reason;
    if (p.note) props.note = p.note;
    if (p.relatedRoute) props.relatedRoute = p.relatedRoute;
    props.updatedAt = p.updatedAt || '';

    return {
        type: 'Feature',
        properties: props,
        geometry: {
            type: 'Point',
            coordinates: roundCoord(feature.geometry.coordinates)
        }
    };
}

// 出力・公開で共通に使う FeatureCollection を組み立てる。
// トップレベル updatedAt は出力日時。公開時はサーバーが付与した値が正となる
// （公開API の契約バージョン 1.0 → docs/funcspec-202607.md §6）。
export function buildExportData(version) {
    return {
        type: 'FeatureCollection',
        version: version,
        updatedAt: getDateTimeIso(),
        features: Closure.getFeatures().map(buildClosureExportFeature)
    };
}

// 出力ファイル名: Closure-yyyymmdd_Cx_Dy.geojson
// C=通行止め件数 / D=通行困難件数。区分未選択（unknown）は件数に含めない。
export function buildExportFileName() {
    const counts = Closure.getCounts();
    return `Closure-${getDateString()}_C${counts.closed}_D${counts.difficult}.geojson`;
}

// 現在のバージョン入力値
export function getVersionInput() {
    return document.getElementById('closureVersionInput').value.trim();
}

// ファイル出力
export function setupClosureFileExport() {
    document.getElementById('exportClosureBtn').addEventListener('click', async function () {
        const counts = Closure.getCounts();
        if (counts.total === 0) {
            showMessage('出力する登録地点がありません。', 'warning');
            return;
        }

        const exportData = buildExportData(getVersionInput());
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/geo+json' });

        const saved = await saveBlobAsFile(blob, buildExportFileName());
        if (!saved) return;

        // 区分未選択・バージョン未入力は出力を止めないが、気づけるよう警告する
        const warnings = [];
        if (counts.unknown > 0) warnings.push(`区分が未選択の地点が${counts.unknown}件あります`);
        if (!exportData.version) warnings.push('バージョンが未入力です');

        if (warnings.length > 0) {
            showMessage(`ファイルを出力しました\n${warnings.join('\n')}`, 'warning');
        } else {
            showMessage('ファイルを出力しました', 'success');
        }
    });
}

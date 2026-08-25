// 公開バージョン（yyyy.nn）の検証と既定値の算出
//
// 契約 3.0 で version は送信側が決める。正本は minoh-hiking
// `docs/publish-api-202608.md` §4。サーバーは形式と重複だけを見るため、
// 「次に来るべき値」を出すのはこちら側の責務になる。
//
// nn は2桁ゼロ埋めの連番。ゼロ埋めするため文字列の大小比較が版の順序と一致するが、
// 更新判定は等値比較のみで行う（契約 §4.4）。ここでも大小比較は年の判定にしか使わない。

const VERSION_RE = /^(\d{4})\.(\d{2})$/;

// 公開できる形式かどうか。画面で公開前に確かめ、サーバーでも同じ判定が行われる
export function isValidVersion(version) {
    return typeof version === 'string' && VERSION_RE.test(version);
}

// 現在の年（JST）。端末のタイムゾーン設定に左右されないよう UTC から +9時間で求める
// （サーバー側 api/_lib/version.js と同じ考え方）
function currentYear(now) {
    return String(new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCFullYear());
}

// 次に来るべき version（入力欄の既定値。契約 §4.2）
// - 現在値が yyyy.nn でなければ今年の .01（旧形式からの移行時もここに落ちる）
// - 年が同じ、または現在値の年が未来（端末の時計ずれ）なら nn を1加算する
// - 年が変わっていれば .01 に戻す
//
// nn が 99 を超えると3桁になり isValidVersion を満たさなくなる。年に100回の公開は
// 想定しないが、その場合は黙って進まず画面のチェックで止まる（契約 §4.1）。
export function nextVersion(currentVersion, now = new Date()) {
    const year = currentYear(now);
    const matched = VERSION_RE.exec(String(currentVersion ?? '').trim());

    if (!matched) return `${year}.01`;

    const [, versionYear, serial] = matched;
    if (versionYear >= year) {
        return `${versionYear}.${String(Number(serial) + 1).padStart(2, '0')}`;
    }
    return `${year}.01`;
}

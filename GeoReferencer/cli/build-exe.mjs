#!/usr/bin/env node
// georef-cli.js を単一実行ファイル (georef-cli.exe) にビルドする。
// Node.js公式のSEA (Single Executable Application) 機能を使用。
//
// 使い方:
//   npm run build:exe
//
// 出力: dist/georef-cli.exe（このファイル1個を別PCへコピーするだけで動く）
//
// 手順:
//   1. esbuildで georef-cli.js と依存(xlsx)を単一CJSファイルにバンドル
//   2. node --experimental-sea-config でSEA blobを生成
//   3. node.exe をコピーし、postjectでblobを注入

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { inject } from 'postject';

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(cliDir, 'dist');

const bundlePath = path.join(distDir, 'georef-cli.bundle.cjs');
const seaConfigPath = path.join(distDir, 'sea-config.json');
const blobPath = path.join(distDir, 'georef-cli.blob');
const exePath = path.join(distDir, 'georef-cli.exe');

// Node.js SEA仕様で固定のヒューズ文字列
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 20) {
    console.error(`エラー: ビルドにはNode.js 20以上が必要です（現在: v${process.versions.node}）`);
    process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });

console.log('[1/4] esbuildでバンドル中...');
await build({
    entryPoints: [path.join(cliDir, 'georef-cli.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: `node${nodeMajor}`,
    outfile: bundlePath,
    logLevel: 'warning',
});

console.log('[2/4] SEA blobを生成中...');
fs.writeFileSync(seaConfigPath, JSON.stringify({
    main: bundlePath,
    output: blobPath,
    disableExperimentalSEAWarning: true,
}, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
    stdio: 'inherit',
    cwd: cliDir,
});

console.log('[3/4] node.exeをコピー中...');
fs.copyFileSync(process.execPath, exePath);

console.log('[4/4] postjectでblobを注入中...');
await inject(exePath, 'NODE_SEA_BLOB', fs.readFileSync(blobPath), {
    sentinelFuse: SEA_FUSE,
});

const sizeMB = (fs.statSync(exePath).size / 1024 / 1024).toFixed(1);
console.log('');
console.log(`完了: ${exePath} (${sizeMB} MB)`);
console.log('このexeファイル1個を別PCへコピーするだけで実行できます（Node.js不要）。');
console.log('動作確認例:');
console.log('  dist\\georef-cli.exe sample sample-map.png sample-marks.json pointGPS.xlsx sample\\out --skip-elevation');

# GeoReferencer CLI

GeoReferencer（ブラウザ版）のジオリファレンス処理をコマンドラインで実行するツールです。
PNG＋マーキングJSONのペアごとに1コマンドで、GPS変換〜標高取得〜GeoJSON出力までを自動実行します。
標高取得（国土地理院API、0.5秒/件の待機あり）を無人でまとめて流す用途を想定しています。

## セットアップ

Node.js 18以上が必要です（標高取得に内蔵`fetch`を使用）。

```bash
cd cli
npm install
```

Node.jsをインストールしていないPCで使う場合は、後述の「単一実行ファイル（exe）の作成」を参照してください。

## 使い方

```
node georef-cli.js <フォルダ> <PNGファイル名> <JSONファイル名> <GPS Excelファイル名> [出力フォルダ] [--skip-elevation]
```

| 引数 | 説明 |
|------|------|
| フォルダ | 入力ファイル（PNG/JSON/Excel）のあるフォルダ |
| PNGファイル名 | ハイキングマップPNG（出力ファイル名の略称に使用。内容は読み込まない） |
| JSONファイル名 | マーキングJSON（`dataspec-json-202604.md` の各形式に対応。カンマ区切りで複数指定可） |
| GPS Excelファイル名 | `ポイントID`・`名称`・`緯度`・`経度`（任意で`標高`・`備考`）列を持つ .xlsx |
| 出力フォルダ | 省略時は入力フォルダに出力（存在しなければ自動作成） |

| オプション | 説明 |
|------------|------|
| `--skip-elevation` | 国土地理院標高APIによる標高取得をスキップ |

### 実行例

```bash
node georef-cli.js "C:\data\maps" minoh-map.png minoh-marks.json pointGPS.xlsx "C:\data\output"
```

複数JSONファイル（ポイント・ルート・スポットを別ファイルで管理している場合）:

```bash
node georef-cli.js "C:\data\maps" minoh-map.png "points.json,route1.json,spots.json" pointGPS.xlsx "C:\data\output"
```

### バッチ実行（1行に1 png+json ペア）

`run-batch.bat.sample` を `run-batch.bat` にコピーして編集してください。
各行が順番に実行されるため、標高取得の待ち時間込みで無人実行できます。

```bat
node georef-cli.js "C:\data\maps" minoh-map.png minoh-marks.json pointGPS.xlsx "C:\data\output"
node georef-cli.js "C:\data\maps" takao-map.png takao-marks.json pointGPS.xlsx "C:\data\output"
```

## 処理内容

ブラウザ版と同一のロジックを使用します。

1. **マーキングJSON読み込み** — ポイント／ルート／スポット／エリア／複合形式を自動判定
2. **GPSポイントExcel読み込み** — 最大1000行（ヘッダー含む）
3. **制御点マッチング** — JSONポイントの`id`とExcelの`ポイントID`を対応付け（最低3点必要）
4. **アフィン変換** — 最小二乗法による6パラメータ変換（Web Mercator経由）、精度（平均・最大・最小誤差）を表示
5. **標高取得** — 国土地理院標高APIから全要素（ポイント・ルート中間点・スポット・エリア頂点）の標高を取得。0.5秒/件待機。標高設定済みの要素はスキップ
6. **GeoJSON出力** — `dataspec-geojson-202604.md` 第3章準拠。ファイル名は `{略称}-GPS-P{n}_R{n}_S{n}_A{n}-{YYYYMMDD}.geojson`

## 単一実行ファイル（exe）の作成

Node.js環境のないPCでも実行できるよう、`georef-cli.exe` 1ファイルにまとめられます
（Node.js公式のSEA機能を使用。ビルドにはNode.js 20以上が必要）。

```bash
cd cli
npm install
npm run build:exe
```

`dist\georef-cli.exe`（約83MB）が生成されます。**このファイル1個を別PCへコピーするだけ**で、
Node.jsのインストールや`npm install`なしで実行できます。

```bat
georef-cli.exe "C:\data\maps" minoh-map.png minoh-marks.json pointGPS.xlsx "C:\data\output"
```

引数・オプションは `node georef-cli.js` と完全に同一です。バッチ実行も
`node georef-cli.js` の部分を `georef-cli.exe` に置き換えるだけです。

注意事項:
- 初回実行時にWindows SmartScreenの警告が出る場合があります（未署名のexeのため）。
  「詳細情報」→「実行」で起動できます
- ビルド時の「The signature seems corrupted!」警告は、元のnode.exeの署名が
  無効化されたことを示すもので、動作に影響はありません
- georef-cli.jsを変更した場合は再ビルドが必要です

## 動作確認用サンプル

```bash
node sample/make-sample.mjs       # サンプルデータ生成
node georef-cli.js sample sample-map.png sample-marks.json pointGPS.xlsx sample\out --skip-elevation
```

## 終了コード

- `0`: 正常終了
- `1`: エラー（ファイル不存在、制御点3点未満、変換失敗など）。バッチ実行時のエラー判定に使用可

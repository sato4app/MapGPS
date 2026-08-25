### DownloadArea - オフライン対応用の領域設定

オフライン地図に同梱する地理院タイルの範囲を指定し、次の2ファイルを出力する。

| ファイル | 内容 | 用途 |
|---|---|---|
| `tile_manifest.json` | レイヤー別のタイル一覧（`source` / `layers`） | **MapPublisher で公開する** |
| `tile_buffers.geojson` | バッファ形状 | 範囲を目視確認するための作業用。公開しない |

**公開バージョンはこのアプリでは指定しない。** `yyyy.nn` 形式の公開バージョンは
MapPublisher の画面で指定する（公開API 契約 3.0）。`tile_manifest.json` に
`version` は出力しない。

`tile_buffers.geojson` の `version` は「どの回の出力か」を示す出力年月（`yyyy-mm`）であり、
公開バージョンとは別物。

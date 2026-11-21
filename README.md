# Saber Sound Converter

セーバー音源（サウンドフォント）のファイル名・フォルダ構成を、別のボード用に変換するブラウザツール。
Proffieboard（ProffieOS）／Xenopixel V3（Xeno3）／Crystal Focus X・Golden Harvest v3（CFX）の相互変換に対応（全6方向）。Verso／Asteria は読み込みのみ。
音源はブラウザの中だけで処理し、どこにも送信しない。

- 公開用：`index.html`（1枚で完結。フォントも埋め込み、外部への通信なし）
- ソース：`src/`（直したら `python3 src/build.py` で `index.html` を組み立て直す）

| ファイル | 中身 |
|---|---|
| `src/shell.html` | 画面の骨組みと CSS（Proffie Web Config の HUD テーマ） |
| `src/fonts.css` | 埋め込みフォント（Chakra Petch / Share Tech Mono、OFL） |
| `src/i18n.js` | 日本語・英語の文言 |
| `src/convert.js` | 変換ロジック（フォントの切り分け・形式判定・名前の対応表・出力ルール）。画面なしで Node でも動く |
| `src/zip.js` | ZIP の読み書き（自前実装）と WAV 形式チェック |
| `src/core.js` | 共通部品、入力（フォルダ／ZIP／ドラッグ＆ドロップ） |
| `src/app.js` | 画面 |

## テスト

実物の音源 BoBF（同じ音の Proffie／Xeno3／CFX-GHv3／Verso／Asteria 版）を正解データにして、全方向の変換結果を音声データのハッシュで照合する。

```
node test/test_bobf.js <BoBF フォルダの親>        # 変換ロジック
node test/test_zip.mjs <BoBF.zip> <出力.zip>      # ZIP 読み書き
python3 test/e2e.py <index.html の絶対パス> <BoBF.zip> <出力フォルダ>   # ブラウザで通し（Playwright）
```

© 2026 SYBER SABERS. All rights reserved.

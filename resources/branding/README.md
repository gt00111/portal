# アプリブランディング画像

Electron 打包や UI から参照するアイコン・ロゴの置き場所です。

## ディレクトリ規約

| ファイル | 用途 |
|----------|------|
| `icon.ico` | Windows 用アプリアイコン（あれば） |
| `icon.png` | PNG アイコン（ランチャー・タスクバー等） |
| `logo.png` | アプリ内ヘッダー等用のロゴ（横長・帯向け） |

## アプリ対応

| フォルダ | アプリ（ポータル `constants` の id 等） |
|----------|----------------------------------------|
| `drawing-library/` | 図面ライブラリ |
| `master-database/` | マスタDB |
| `pixo-converter/` | PixoConvert |
| `portal/` | ポータル本体 |
| `process-management/` | 工程管理 |
| `seisan-board/` | 生産ボード（ファイル名は下記のまま） |

ルートにあった元ファイル名（例: `drawing-library-rogo.png`）は、他アプリでは **`logo.png`** に統一しています。

### `seisan-board/` のファイル名（変更しない）

| ファイル | 用途 |
|----------|------|
| `seisan-board-icon.ico` | Windows 用・アイコン（ホーム一覧の画像はここを参照） |
| `seisan-board-icon.png` | PNG アイコン（例: `index.html` の favicon） |
| `seisan-board.png` | 横長ロゴ（アプリ内ヘッダー等） |

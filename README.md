# Portal

社内業務アプリの入口となるデスクトップポータル。**Electron + React 18 + TypeScript**。メインプロセスで SQLite（better-sqlite3）、レンダラーは `window.api.invoke(channel, payload)` 経由の IPC のみ。

## クイックスタート

```sh
npm install                            # postinstall で native 依存を Electron に合わせてリビルド
npm run dev                            # electron-vite（レンダラー dev サーバーはポート 5180）
npm run typecheck                      # main / renderer の型チェック
npm run build                          # 成果物は out/（main・preload・renderer）
npm run preview                        # ビルド後の起動確認
npm run dist                           # electron-builder でパッケージ（出力は dist/）
```

## ドキュメント・規約

| 内容 | 場所 |
|------|------|
| 要件・設計索引 | [docs/index.md](docs/index.md) |
| アーキテクチャ | [docs/architecture.md](docs/architecture.md) |
| IPC 一覧 | [docs/ipc-channels.md](docs/ipc-channels.md) |
| AI / エディタ向け規約 | [.cursor/rules/](.cursor/rules/)（Electron・モジュール分割・コーディング） |

## ソース構成

```
src/
├── main/           メインプロセス（DB・IPC。業務ロジックは modules/* の *.handler / *.repo）
├── preload/        contextBridge のみ（汎用 invoke）
├── renderer/       React（Node 分離）
└── shared/         型・定数・IPC チャネル名など

resources/          配布用アセット（package.json の files / extraResources を参照）
├── tools/          図面比較 exe、Poppler（pdf→画像）など ※ 大きいものは多くが Git 外
└── pixo-converter/ 内蔵 Pixo 用の任意配置（Poppler の代替パス）
```

内蔵 **PixoConverter** の UI は `renderer/src/apps/pixo-converter/`。PDF→画像は **Poppler の `pdftoppm`** を `resources/tools/poppler-*/Library/bin` 等から解決（詳細は [`resources/tools/README.md`](resources/tools/README.md) および [`resources/pixo-converter/bin/README.txt`](resources/pixo-converter/bin/README.txt)）。

## 各アプリ・機能における保存ファイルの階層

ユーザーが「名前を付けて保存」で任意パスに書き出す場合は、そのパスにフラットに保存される。以下は **アプリが既定で置く・管理する** 階層の概要（実装は `src/main/db/`・`src/main/modules/`・`src/main/seisan/` を参照）。

### ポータル本体（中央データベース）

| 種類 | 場所 |
|------|------|
| 中央 SQLite | ユーザーが選択した単一ファイル（例: `production.db`）。パスは固定ではない。 |
| 起動時の DB パス記憶 | Electron `userData` 直下の `portal-config.json`（`dbPath`） |

### 中央 DB と同じディレクトリに隣接するファイル

中央 DB を開いたとき、**中央 DB ファイルと同じフォルダ**に次が置かれる（ファイル名はコード上固定）。

| ファイル名 | アプリ・用途 |
|--------------|----------------|
| `drawing-library.db` | 図面ライブラリ（DB）。**図面実体ファイルのルート**もこの DB と同じディレクトリ。 |
| `seisan-board.db` | 生産ボード（精算）用 DB。案件添付の実ファイルもこの DB の親ディレクトリを起点にする。 |
| `process-management.db` | 工程管理（データは主にこの SQLite のみ）。 |

生産ボード DB を別パスにしたい場合は、`userData` の `seisan-board-override.json` の `overridePath` で上書きできる。その場合、案件添付のルートも **その override 先の `seisan-board.db` の親ディレクトリ**になる。

### 図面ライブラリ（実ファイル）

ルート = **`drawing-library.db` と同じディレクトリ**。DB にはルートからの相対パスが格納される。取り込み時のファイル名は `{タイムスタンプ}_{元ファイル名（安全化後）}`。

```
<drawing-library.db と同じフォルダ>/
├── drawings/
│   ├── <顧客名>/                          … 顧客向け PDF
│   └── mycompany/
│       └── <顧客名>/                     … 自社（ワーク）PDF
├── dxf/
│   └── <顧客名>/                         … DXF
└── mycompany/
    └── edraw/
        └── <顧客名>/                     … eDrawings
```

### 生産ボード（精算）— 案件に紐づく添付ファイル

`seisan-board.db` のあるディレクトリを `ROOT` とすると、案件メタの **グループ名 → 会社名 → 案件番号（`project_no`）** の3階層にコピーされる。メタが欠ける場合は `未分類` / `未登録` などのプレースホルダが使われる。

```
ROOT/
└── <グループ名>/
    └── <会社名>/
        └── <案件番号>/
            └── <ファイル名>（同名時は一意化）
```

一括ダウンロードでは、ユーザーが選んだフォルダ直下に `<案件番号>` 名のサブフォルダを作成し、その中にファイルをコピーする。

### 工程管理（process-management）

業務データは **`process-management.db`** に集約。図面ライブラリのようなドキュメント用ディレクトリツリーは持たない。

### Pixo Converter（内蔵）

変換の作業領域は Electron **`userData`** 配下。

```
<userData>/
└── portal-pixo-converter/
    └── temp/
        ├── uploadimages/     … 入力・作業用
        └── outputimages/     … 変換結果（ここからユーザー指定フォルダへコピーする保存もある）
```

PDF の結合・編集などでは `outputimages` 内に `merged_<timestamp>.pdf` や `edited_<timestamp>.pdf` などの名前で出力する経路がある。ユーザーが保存先を指定した場合は、そのパスに直接書き込む。**アプリ終了時（`will-quit`）には `uploadimages` と `outputimages` の中身を削除し、セッション間で容量が蓄積しないようにしている**（作業中は従来どおり残る）。

## 備考

- 本番 `Main` エントリは **package.json の `main`**: `./out/main/index.js`（ビルド後）。
- モジュールは **main の loader が `*.handler.ts` を自動登録**する。手で main に束ねない。

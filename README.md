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

## 備考

- 本番 `Main` エントリは **package.json の `main`**: `./out/main/index.js`（ビルド後）。
- モジュールは **main の loader が `*.handler.ts` を自動登録**する。手で main に束ねない。

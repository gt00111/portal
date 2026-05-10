# タスク進捗管理

本書は **ポータル開発の唯一のタスクリスト**。
完了したら `- [ ]` → `- [x]` に更新する。新しい要件が出たら末尾に追加。

凡例: `- [ ]` = 未着手／進行中、`- [x]` = 完了、`- [~]` = 保留・延期

---

## フェーズ 0: 要件・設計ドキュメント

### 要件定義
- [x] `requirements.md` 初版作成
- [x] 統合方針（ハイブリッド）決定
- [x] DB 方針（中央 + サテライト、flat + 共有 SKU）決定
- [x] 認証方針（admin/admin seed + 強制パスワード変更）決定
- [x] UI 方針（LP 風、navbar アンカー、メリーゴーラウンド）決定
- [x] drawing-libraly の Express 撤去方針を追記
- [x] アプリ起動時は別ウィンドウ（別タブ相当）方針を追記
- [x] master-database を後方互換なしで作り直す方針を追記

### 支援ドキュメント
- [x] `docs/index.md`（ドキュメント索引）
- [x] `docs/task-progress.md`（本書）
- [x] `docs/architecture.md`
- [x] `docs/db-schema.md`
- [x] `docs/ipc-channels.md`
- [x] `docs/ui-design.md`
- [x] `docs/launcher-design.md`
- [x] `docs/bootstrap-and-auth.md`
- [x] `docs/coding-conventions.md`
- [x] `docs/app-router-best-practices.md`

---

## フェーズ 1: ポータル本体（ログイン + LP 風ホーム）

### 1-A. プロジェクト雛形
- [x] リポジトリルート配下に electron-vite 雛形を作成
- [x] `package.json` に依存追加（electron 32 / electron-vite 2 / react 18 / react-router-dom 6 / better-sqlite3 11 / lucide-react / tailwindcss 3 / framer-motion 11 / 型定義 / typescript / vite）
- [x] `package.json` に `"type": "module"` を設定
- [x] `package.json` に `"main": "./out/main/index.js"` を設定
- [x] `package.json` の `scripts` に `"postinstall": "electron-builder install-app-deps"` を追加
- [x] `package.json` の `scripts` に `"dev" / "build" / "preview" / "typecheck" / "dist"` を追加
- [x] `tsconfig.json` / `tsconfig.node.json`（main+preload）/ `tsconfig.web.json`（renderer）に path alias を定義
- [x] `electron.vite.config.ts`（出力先 `out/main`, `out/preload`(cjs), `out/renderer` / alias / `externalizeDepsPlugin`）
- [x] `tailwind.config.ts` + `postcss.config.js` + 共通 CSS 変数
- [x] `.gitignore`、`README.md`
- [x] `npm install` で **`better-sqlite3` が Electron ABI で再ビルド** されることを確認（postinstall 成功ログ）
- [x] `npm run dev` で Electron アプリが起動することを確認

### 1-B. メインプロセス基盤
- [x] `src/main/index.ts`（`BrowserWindow` + `loadModules` + single-instance lock）
- [x] `src/main/window.ts`（`createPortalWindow` / `webPreferences` 規約準拠）
- [x] `src/main/session.ts`（ログインセッション保持）
- [x] `src/main/auth-guard.ts`（`assertLoggedIn` / `assertCanWrite` / `assertAdmin`）
- [x] `src/main/password.ts`（scrypt ハッシュ＋`timingSafeEqual`）
- [x] `src/main/db/connection.ts`（`better-sqlite3` 接続管理、WAL、パス切替）
- [x] `src/main/db/schema.ts`（全テーブル DDL）
- [x] `src/main/db/migrate.ts`（`schema_meta` 版管理）
- [x] `src/main/db/seed.ts`（初期セッティング + admin/admin シード）

### 1-C. Preload
- [x] `src/preload/index.ts`（`contextBridge.exposeInMainWorld("api", { invoke })` のみ、CJS 出力）
- [x] 型定義 `src/preload/index.d.ts` で `window.api.invoke<T>` を宣言
- [x] `src/shared/types.ts` / `src/shared/ipcResponse.ts` / `src/shared/auth.ts` / `src/shared/constants.ts`

### 1-D. モジュール（IPC ハンドラ）
- [x] `src/main/modules/loader.ts`（**`import.meta.glob` で自動ロード**）
- [x] `settings` モジュール
  - [x] `settings:get` / `settings:pickExistingDatabase` / `settings:createNewDatabase` / `settings:closeDatabase` / `settings:updateCompanyInfo`
  - [x] `userData/portal-config.json` に DB パスを永続化し、次回起動時に自動復帰
- [x] `auth` モジュール
  - [x] `auth:session` / `auth:login` / `auth:logout` / `auth:changePassword`
- [x] `operator` モジュール
  - [x] `operator:list` / `operator:create` / `operator:setActive` / `operator:updateRole`（全て admin 限定、最後の admin 保護あり）
- [x] `launcher` モジュール（スケルトン）
  - [x] `launcher:list`（APP_CATALOG 返却）
  - [x] `launcher:openApp`（`ready=false` なら "準備中" エラー）

### 1-E. DB 初期化
- [x] `app_operators` / `app_settings` / `schema_meta` テーブル作成
- [x] 操作者 0 件かつ `bootstrapped` 未設定のとき `admin/admin` を seed（`mustChangePassword=1`）
- [x] seed 後は `app_settings.bootstrapped = '1'` をセット
- [x] マスタ（`m_customers` 〜 `m_user_names`）と `m_skus` + 複合ユニーク index を DDL のみ作成
- [x] `app_operator_app_grants` テーブルも DDL のみ作成（将来のアプリ別権限用）

### 1-F. レンダラ（ルーティング + 画面）
- [x] `src/renderer/src/main.tsx`（ReactDOM, HashRouter）
- [x] `src/renderer/src/App.tsx`（ステート駆動でルート出し分け + 強制パスワード変更モーダル）
- [x] `src/renderer/src/hooks/useAuth.ts`（session / login / logout / changePassword）
- [x] `src/renderer/src/hooks/useSettings.ts`（DB/bootstrap/会社情報）
- [x] `src/renderer/src/lib/api.ts`（`IpcResponse` を unwrap した型付き invoke ラッパ）
- [x] `src/renderer/src/lib/cn.ts`
- [x] `src/renderer/src/routes/Bootstrap.tsx`（DB 新規作成 / 既存選択 / 前回パス表示）
- [x] `src/renderer/src/routes/Login.tsx`（ログイン + DB 切替リンク）
- [x] `src/renderer/src/routes/Home.tsx`（LP 風 Hero + **4 セクションのアプリ一覧** + フッタ）
- [x] `src/renderer/src/routes/NotFound.tsx`
- [x] `src/renderer/src/components/Navbar.tsx`（会社名 + アンカー scrollIntoView + ログアウト）
- [x] `src/renderer/src/components/HeroCarousel.tsx`（3 モットーを framer-motion で rotateY 切替）
- [x] `src/renderer/src/components/AppSection.tsx`（whileInView で fade-up）
- [x] `src/renderer/src/components/ForcePasswordChangeModal.tsx`
- [x] `src/renderer/src/components/ui/Button.tsx` / `TextField.tsx` / `Card.tsx`

### 1-G. Tailwind / 共通 CSS
- [x] `index.css` で CSS 変数 12 種 + スクロールバー + `scroll-behavior: smooth`
- [x] `tailwind.config.ts` で `bg/fg/accent/state/border` セマンティックカラーを 変数 ↔ クラス に紐付け
- [x] framer-motion のアニメは `HeroCarousel` / `AppSection` / `Home` の Hero に直接適用（共通 hook は必要時に追加）

### 1-H. 受け入れ確認（フェーズ 1 完了条件）

#### 機能要件
- [x] `npm run dev` でポータルが起動し、初回はセットアップ画面が出る
- [x] 「新規 DB 作成」で `portal-master.db` が作られる
- [x] `admin/admin` で初回ログインでき、強制パスワード変更モーダルが表示
- [x] パスワード変更後、LP 風ホームに遷移
- [x] Hero のメリーゴーラウンドが 3 モットーを順送り
- [x] navbar のアプリ名リンクでスムーズスクロール
- [x] 「ログアウト」でログイン画面に戻る
- [x] DB ファイル削除 → 再起動でセットアップに戻る（鶏卵耐性）

#### 規約準拠（`.cursor/rules/*.mdc`）セルフチェック
- [x] **Electron-Rules**: `contextIsolation=true` / `nodeIntegration=false` / `sandbox=true`
- [x] **Electron-Rules**: `"main": "./out/main/index.js"` / 出力先 `out/{main,preload,renderer}`
- [x] **Electron-Rules**: `package.json` に `postinstall: electron-builder install-app-deps`
- [x] **Electron-Rules**: `better-sqlite3` などネイティブモジュールを renderer で使っていない
- [x] **Electron-Rules**: preload は `{ invoke }` のみ公開（業務関数を公開していない）
- [x] **Electron-Rules**: `ipcMain.handle` のみ使用（`ipcMain.on` なし）
- [x] **Modular-Architecture-Rules**: `src/main/index.ts` がモジュールを個別 import していない
- [x] **Modular-Architecture-Rules**: `loader.ts` が `import.meta.glob` で自動収集している
- [x] **Modular-Architecture-Rules**: 全モジュールが `register(ipcMain)` を export
- [x] **Modular-Architecture-Rules**: handler に生 SQL がなく、repo に IPC 記述がない
- [x] **Modular-Architecture-Rules**: renderer に `createProject()` のような具体関数がなく、`window.api.invoke("module:action", data)` に統一
- [x] **Modular-Architecture-Rules**: モジュール同士が直接 import していない
- [x] **Coding-Rules**: 全ファイル TypeScript / ESM（`require` なし）
- [x] **Coding-Rules**: 全 IPC handler が `try/catch` し `{success, data|error}` を返す
- [x] **Coding-Rules**: `.then()` を使っていない（async/await のみ）
- [x] **Coding-Rules**: React は関数コンポーネントのみ、class なし
- [x] **Coding-Rules**: import 順が 3 段（external / shared / local）
- [x] **Coding-Rules**: 跨ぎ import は `@shared/*` / `@main/*` / `@renderer/*` エイリアス使用
- [x] **Coding-Rules**: 本番ビルドに `console.log` が残っていない

---

## フェーズ 2: マスタ管理・設定・ランチャー本実装

### 2-A. マスタ管理画面（内蔵）
- [x] マスタ一覧コンポーネント（汎用、6 マスタ共通）— `MasterCrud.tsx`
- [x] `m_customers` CRUD
- [x] `m_models` CRUD
- [x] `m_part_numbers` CRUD
- [x] `m_component_names` CRUD
- [x] `m_group_names` CRUD
- [x] `m_user_names` CRUD

### 2-B. SKU（関係）管理
- [x] `m_skus` CRUD 画面（客先 × 機種 × **図面番号(品番)** × 部品名称 × **図面番号（台帳）** × Rev）
- [x] 図面番号(品番)選択時に **図面番号（台帳）** が空ならマスタ名称（なければコード）を自動入力。台帳が「直前マスタの既定と同じ」場合のみ品番変更に追従し、手修正した値は上書きしない（`SkuCrud.tsx`）
- [ ] CSV / Excel インポート・エクスポート

### 2-C. 操作者管理
- [x] 操作者一覧画面（admin のみ）
- [x] 操作者追加・権限変更・有効化/無効化
- [x] 最後の admin 保護

### 2-D. 設定画面
- [x] DB パス変更（設定画面から既存選択 / 新規作成）
- [x] 会社名・モットー複数件の編集（`app_settings`）
- [x] **ヒーロー背景画像**（ローカルファイルを選択しパスを DB 保存・ホームで `file:` URL 反映）。**カルーセル用背景は実装しない**（後から削除済み）
- [ ] ロゴ画像（任意）

### 2-E. ランチャー本実装
- [x] `launcher` モジュールで別 `BrowserWindow` を生成
- [x] `Map<appId, BrowserWindow>` で二重起動防止（既に開いていれば focus）
- [x] ウィンドウを閉じると Map から削除
- [x] ポータル本体を閉じると全子ウィンドウも閉じる

---

## フェーズ 3: 各アプリの取り込み

### 3-A. seisan-board（内蔵）
- [x] 画面の移植（案件・ガント・ダッシュボード）
- [x] 中央 DB（`m_*` + `m_skus`）に合わせて repository 書き換え
- [x] サテライト DB（案件・タスク等）のスキーマ確定
- [x] マイグレーション（旧 `customers/models/…` 参照からの置換）

#### 3-A 関連の実装メモ（2026-05 時点）
- 用語: マスタの「品番」を **図面番号(品番)** に統一（`shared/master.ts` の表示ラベル、中央マスタ画面説明、SKU 一覧・モーダル、生産ボードの表・フォーム・検索プレースホルダー・CSV エクスポートヘッダー等）。
- CSV インポート: ヘッダー 3 列目は **図面番号(品番)** を推奨しつつ、従来の **品番** ヘッダーも解決可能（`CsvImportDialog.tsx`）。
- `projects.repo.ts` の重複エラーメッセージも上記用語に合わせて更新。
- CSV インポート（`CsvImportDialog`）: **フォーマット説明・列定義表**、**UTF-8 BOM 付き CSV テンプレ**のダウンロード（`seisan-import:downloadCsvTemplate`、`shared/seisan/csvImportFormat.ts` でヘッダー・説明・テンプレ生成を共用）。
- CSV 列に **リビジョン**（号機の次・納期の前）を追加。**ヘッダー省略またはセル空欄は可**（旧 9 列 CSV 互換）。`projects.create` に `revision` を渡す。案件一覧 **CSV エクスポート**にもリビジョン列。
- **設定 → DB 設定（一般）**: 案件 CSV 用 Excel テンプレを `downloadFormat` で保存可能。**`resources/format.xlsx`** をリポジトリに同梱。既定ファイル名 `案件CSVインポート形式.xlsx`。記入上の注意はリビジョン・マスタ完全一致（客先・機種・図面番号・名称・グループ・入力者）に追随。

### 3-B. drawing-libraly（内蔵・再設計）**（一旦完成: 2026-05-06）**
- 以降の改善は別途。現状の到達点を「内蔵・再設計フェーズ完了」とみなす。
- [x] **顧客図面**: 生産ボードの「提供ファイル」と**同一扱い**。`drawing-library:listSeisanCustomerDrawings` のみを UI で表示（別タブ「顧客図面（DB）」は廃止）。開く＝`seisan-file:open`。
- [x] Express 撤去相当: 旧 `localhost:3001` API を **IPC** に置換（`drawing:*` / `drawing-dxf:*` / `drawing-edrawings:*` / `drawing-comment:*` / `drawing-library:*`）。専用 SQLite は中央 DB と**隣接**して `drawing-library.db` として自動オープン（`drawingLibraryConnection.ts`）。
- [x] **自社発行のみ** `drawing-library.db` へ登録: `drawing:list` … `drawing:readFile` ほか DXF / eDrawings / コメント（`drawingType` は UI 上 `work` のみ）
- [x] `drawing-dxf:list` / `drawing-dxf:upload` / `drawing-dxf:delete`
- [x] `drawing-edrawings:list` / `drawing-edrawings:upload` / `drawing-edrawings:delete`
- [x] `drawing-comment:list` / `drawing-comment:create` / `drawing-comment:update` / `drawing-comment:delete`
- [x] PDF 等: レンダラは **`drawing:readFile` → Blob URL** でプレビュー（Express の `/api/files` 廃止）
- [x] 図面比較（おまけ）: 外部 PDF 2 件を IPC で比較。**`compare_drawings.exe` 優先**（`resources/tools/` 開発配置、`electron-builder` の `extraResources` で `resources/tools` に同梱、`DRAWING_COMPARE_EXE` で上書き）。無い場合は Python スクリプト（`DRAWING_COMPARE_SCRIPT` 等）
- [x] 自社発行タブ: 詳細モーダルで **eDrawings** の一覧・追加・削除（DXF と同様）
- [x] **一覧の絞り込み・並び替え（旧アプリ相当）**
  - [x] **自社発行**（`DrawingDbTab.tsx`）: 客先→機種→図面番号(品番) の **カスケード**（`drawing:workCascadeOptions`）。**並び替え**は `drawing:list` の `sortBy` / `sortOrder`（`drawings.repo.ts` で列ホワイトリスト + 動的 `ORDER BY`）
  - [x] **顧客図面＝提供ファイル**（`SeisanProvidedFilesTab.tsx`）: `company_id`→`model_type`→`part_number` の **カスケード**と **並び替え**（取得済み行に対するクライアント側。追加 IPC なし）
- [x] `docs/ipc-channels.md`: `drawing:workCascadeOptions`・`DrawingListParams` のソート項目を追記
- [x] **UI（顧客図面・自社発行）**
  - 一覧は **カード**（顧客: PDF サムネ、`readAsDataUrl`）。詳細は **`Modal` の `width="full"`** で周囲に余白を取りワークエリアを広げる。
  - **顧客図面詳細**: 案件に紐づく全ファイルを **行リスト**（開く・保存・行ごとの旧図面チェック）。**詳細ヘッダの旧図面チェック**と **行オーバーレイ** の二重表示にならないよう、モーダル全体の `ObsoleteOverlay` は付けない（`SeisanProvidedFilesTab.tsx`）。
  - **自社発行詳細**: 左 **PDF 複数ページ表示**（`pdfjs-dist` / `PdfJsViewer`）、右 **eDrawings** の追加・一覧・保存・削除、下 **コメント**。**自社タブの DXF UI は削除**。
  - **旧図面**: `project_files.is_obsolete`（顧客）／`drawings.is_obsolete`（自社）。`seisan-file:setObsolete`・`drawing:setObsolete`。生産ボードの提供ファイル一覧は **`is_obsolete` を表示・分岐に使っていない**（DB 同一カラムだが図面ライブラリ主導の意味。`projectFile.ts` に注記）。
  - **カード 1 行目ラベル**: 客先・機種・図面番号(品番)・名称・リビジョンを **`_` 連結**（値が無い項目は省略）。顧客は空ならファイル名、自社は空なら名称へフォールバック。副行に **ファイル名**（顧客）／**登録 PDF ファイル名**（自社パスからベース名）。
- [x] メイン `out/main` が古いと `seisan-file:setObsolete` 等が **No handler registered** になる → **`npm run build` 後の起動** または **dev 再起動**で解消（ソースは `seisan-file.handler.ts` に登録済み）。
- [~] サテライトの `customers/models/products` を中央 `m_*` ID に**完全移行** — 現状は図面ライブラリ DB 内ローカルマスタを維持。`drawing-library:masterList|Create|Delete` で管理。将来ポータル中央マスタへの統合は別タスク。


### 3-C. Process management desktop（内蔵）
- [x] **サテライト DB**: 中央 DB と**隣接**で `process-management.db` を自動オープン（`processMgmtConnection.ts` / `connection.ts`）。スキーマは `projects` + `tasks`（**独自 `users` は作成しない**。旧スタンドアロン DB に残る `users` テーブルは未使用で可）
- [x] **認証**: IPC はポータル `assertLoggedIn` / 更新系は `assertCanWrite`。ボード・開始は **セッションの `username`**（`app_operators`）を担当者に使用
- [x] **工程表示（process_view）**: Flask 原型 `Process management` と同様、中央 `app_operators.processView`（`solidworks` / `cadmac` / `both`）でボード・案件タスク一覧をサーバ側でフィルタ。管理画面「操作者」で編集。`general` 種別は SW/CAD どちらの専用表示でも可。`auth:syncSession` で自分の変更を即時セッション反映
- [x] **初回 UI**: `#/apps/process-management`・ヘッダ固定 + ビューポート内スクロール（図面ライブラリに準拠）。**ボード**（全体俯瞰・開始/完了・履歴・マイタスク）／**案件**（一覧 + 選択案件のタスク）
- [x] **ボード一覧 UX**（`ProcessManagementApp.tsx`）: メイン余白（`mx-3` / `sm:mx-5`）。`process-mgmt:task:listBoard` は **`query` / `client` を空**で全件取得し、**レンダラ側**でカスケード（客先→案件→工程→担当）、テキスト検索、**列ヘッダクリックでソート**、**ページネーション**（表示件数 20 / 50 / 100）。テーブルに **更新**列（`updatedAt`）
- [x] **完了時の進捗％**: `status === '完了'` は **常に 100% 扱い**（`pm-tasks.repo.ts` の `mapDbToPmTask`）。DB 更新は `completeTask` に加え **`updateTask` / `updateTaskStatus` が `完了` になったときも** `progress_percent = 100`・`completed_at` 等を整合。マイタスクの「完了」直後は UI 上 `setPercent(100)` してから再取得

#### 3-C 関連の実装メモ（2026-05-06 時点）
- ボードの絞り込み・並び・ページングは **IPC 追加なし**（一覧は従来どおり `listBoard` の 1 回取得を前提）。
- カスケードの担当「（未割当）」は内部値 `__unassigned__`（未入力 `assignee` を一致判定）。
- `filterBoardTasks`（メイン）は空クエリで実質バイパス; 以降はクライアント処理が正。

### ~~3-D. PDF_scope_vault（子プロセス起動）~~ **撤去済み（2026-05-09）**
- PDF Scope Vault（OCR アプリ）は**ポータル統合から外し**、単体デスクトップアプリとして別管理。`launcher:openApp` / 同梱 `resources/tools/pdf-scope-vault` / 設定 IPC は削除。
- **PixoConverter** は当面コード上は子プロセス起動だが、**内蔵化が最終方針**（詳細は 3-E）。

### 3-E. PixoConverter

**方針変更（計画のみ・本書追記時点ではコード未変更）**: 当初は独自 exe の **`child_process` 起動**。安定性・保守のため **ポータル内蔵（別 `BrowserWindow` + 既存と同じ IPC 規約）へ移行する**。

#### 現状（外部 exe 起動・実装済み）

- [x] `launcher:openApp`（`appId: pixo-converter`）で `child_process.spawn`（`externalProcess.ts`）
- [x] パス解決: **`PIXO_CONVERTER_EXE`** / **`launcher.pixoConverter.exePath`** / **`resources/tools/pixo-converter/pixoconverter.exe`**（ローカル同梱） / 開発時 **`PixoConverter/dist/win-unpacked/pixoconverter.exe`**
- [x] IPC: `settings:pickPixoConverterExe` / `settings:clearPixoConverterExe`。`SettingsSnapshot.pixoConverterExePath`
- [x] `APP_CATALOG` で `kind: "external"`・`ready: true`
- 補足: electron-builder 出力の exe 名は **`pixoconverter.exe`**（小文字）。

#### PixoConverter 単体（リポジトリ `PixoConverter/`）UI 更新（2026-05-09）
- PDF **連結**・**ページ編集（差し替え／挿入／削除）**を Acrobat 風（左サムネ一覧・メインプレビュー・ツールバー）に刷新（`AcrobatPdfMerge.jsx`、`PdfReplacePage.jsx`、`pdfjs-dist`、`acrobat.css` 等）。
- **ページ編集**画面の不具合修正（ソース PDF 解除ボタン、プレビュー canvas クリア、`setSelectedPageIndices` など）。PNG/JPG・TIFF→PDF は従来画面のまま。

#### 将来（内蔵化・未実装）

- [ ] `APP_CATALOG` を **`kind: "internal"`** に変更し、`launcher:openApp` は **`openInternalAppWindow`** のみで起動（`externalProcess.ts`・exe パス解決の撤去または縮退）
- [ ] 管理画面から **Pixo 専用の exe 登録 IPC / UI**（`settings:pickPixoConverterExe` 等）を**不要なら削除**し、`SettingsSnapshot` から **`pixoConverterExePath` を除去**（後方互換・マイグレーション方針は別途決定）
- [ ] レンダラー: `PixoConverter` の UI（React）を **`portal` 配下に移植**（ルート例: `#/apps/pixo-converter`）。`AppShell` の `REGISTRY` に登録。ルーティング・スタイルは図面ライブラリ等の内蔵アプリに準拠
- [ ] メインプロセス: 現行 Pixo の **`ipcMain.handle`（PDF/TIFF/画像変換・pdf-lib・sharp・Poppler 呼び出し等）**を **`src/main/modules/`** に **repo + handler** へ分割移植し、チャネルを **`module:action`** に統一（preload は汎用 `invoke` のみ）
- [ ] ネイティブ/バイナリ依存（**sharp**、**Poppler**、既存 `resources/bin` 相当）を **ポータルの `extraResources` またはビルド手順**に合わせて一本化
- [ ] 開発時: 単体 `PixoConverter` リポジトリフォルダへの依存を**なくすか**、モノレポ内参照に**整理**（フェーズ 5 の「旧フォルダ削除」と整合）
- [ ] ドキュメント追随: `ipc-channels.md` / `launcher-design.md` / `requirements.md` / `resources/tools/README.md` の **外部起動・同梱 exe** 記述を内蔵前提に更新

---

## フェーズ 4: 運用強化

- [ ] アプリ別利用権限（`app_operator_app_grants`）
- [ ] 操作ログ・監査テーブル
- [ ] 更新通知（バージョンチェック）
- [ ] インストーラ作成（`electron-builder`、NSIS）
- [ ] 配布・運用ドキュメント

---

## フェーズ 5: リポジトリ整理（統合完了後）

- [ ] 旧スタンドアロンアプリのうち **未削除**のフォルダを整理（`PixoConverter` のみ残置。必要に応じて内蔵化後に削除）
  - [x] `drawing-libraly` / `master-database` / `Process management` / `Process management desktop` / `seisan-board`（2026-05-09 削除済み）
- [ ] Python 由来の処理は **exe のみ** `portal` 側（`resources` / `extraResources`）に集約し、ビルド手順を README に記載
- [ ] 参照パス・ドキュメント（`launcher-design.md` 等）から旧ディレクトリ前提の記述を除去

---

## 直近の改善・修正（UI / ホーム / 図面ライブラリ / Pixo）

チェックが付いた項目は実装済み。詳細はコミット・`README.md`・本書の変更履歴を参照。

### ポータルホーム・アプリカタログ
- [x] `APP_CATALOG` に `section` を追加し、ホームを **4 セクション**（ポータル内アプリ共有データベース／事務サポート／進捗確認／お助けアプリ）で表示（`Home.tsx`・`types.ts`・`constants.ts`）
- [x] 各アプリの説明文を長文化（`constants.ts` の `PORTAL_APP_SECTION_*`）
- [x] `README.md` に **保存ファイルのディレクトリ階層** を追記（中央 DB・隣接 DB・図面・精算添付・Pixo temp 等）

### 内蔵アプリのテーマ（事務向けライト）
- [x] 生産ボード・図面ライブラリ・工程管理を `.portal-app-calm-shell` で **ライトテーマ**（ポータルホームのダークは維持）
- [x] 前景トークンを **ほぼ黒** に調整（長時間閲覧・白カード上の可読性）
- [x] 共有 `Button` の primary を **`text-white`** に変更（青ボタン上の文字がライト背景変数と干渉しないよう）

### 図面ライブラリ（視認性・一覧ページネーション）
- [x] 顧客図面タブ：カード／モーダル／詳細で薄い文字を **`text-fg-primary` 等に修正**（`<button>` 内継承・Modal 見出し・`<dd>` 値）
- [x] 共有 `Modal` のパネル・`h2` に **`text-fg-primary`**（図面以外のモーダルもトークンに追随）
- [x] **顧客図面・自社発行**の一覧に **ページネーション**（表示件数 **20 / 50 / 100**、前へ／次へ）。共通定数 `renderer/.../drawingListPageSize.ts`。顧客はフィルタ後配列をクライアント分割、自社は既存 `drawing:list` の `limit`/`offset`

### PixoConverter（作業用 temp）
- [x] **`will-quit`** で `portal-pixo-converter/temp` の `uploadimages`・`outputimages` を空にする（`cleanupTempDirs`・`src/main/index.ts`）
- [x] `README.md` に終了時クリアの注記

### 図面ライブラリ（ヘルプ）
- [x] 顧客図面／自社発行／PDF 比較タブの**説明文を削除**し、**ヘルプボタン＋モーダル**で文言を表示（`drawingLibraryHelpCopy.ts`、`SeisanProvidedFilesTab.tsx`、`DrawingDbTab.tsx`、`PdfCompareBonusTab.tsx`、`DrawingLibraryApp.tsx`）

### 工程管理（ヘルプ・ボード UI）
- [x] ボード／マイタスクの長い説明・DB パスを撤去し、**ヘルプモーダル**に集約（`processManagementHelpCopy.ts`、`ProcessManagementApp.tsx`）。画面上は短いタグラインのみ
- [x] ボード「**案件内容**」を secondary＋`ExternalLink` で強調。**進捗（共有）**は先頭 **約15文字**表示し**クリックでモーダル全文**（一覧はアクティブ／履歴共通）
- [x] 案件内容モーダルは閲覧のみ（優先度は表示のみ・入力欄なし）

### ポータルホーム（LP・ヒーロー背景）
- [x] constants の **`HOME_LP_BACKGROUNDS.hero`** と、**設定で選んだヒーロー画像**を統合（未設定時は constants／グラデのみ）
- [x] メイン **`settings.handler`** で画像パスを保存・**存在時のみ `pathToFileURL`**（`normalize`）。**`settings:pickHomeLpImage`**。**レンダラー CSP** で **`img-src` に `file:`** を許可（`index.html`）。**`portalWebPreferences.ts`** に **`webSecurity: false`**（ローカル背景表示用）
- [x] **カルーセル背景画像**は要件から外し設定・型・保存キーを削除
- [x] **レイアウト**: ナビ下〜アプリ一覧ボタンまで **1 セクションで背景を全面表示**。会社名・モットーは **`w-fit` の半透明パネル**（backdrop-blur）。**HeroCarousel** は `inline-flex`・**縦 `min-h` 削除**・ドット上マージン縮小・パネル `py` 縮小で**縦方向のオーバーレイを文字に寄せる**

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-05-04 | 要件定義書 初版 |
| 2026-05-05 | drawing-libraly Express 撤去、別ウィンドウ起動、master-database 作り直し方針を追記。本書（task-progress.md）作成 |
| 2026-05-05 | フェーズ 0 支援ドキュメント全 9 本（index / task-progress / architecture / db-schema / ipc-channels / ui-design / launcher-design / bootstrap-and-auth / coding-conventions）作成完了 |
| 2026-05-05 | `app-router-best-practices.md` 追加（React Router v6 + HashRouter 指針、認証ガード、アンカー遷移、マルチウィンドウ連携） |
| 2026-05-05 | `.cursor/rules/*.mdc` 準拠セルフレビュー。loader を `import.meta.glob` 自動ロードに変更、`postinstall` 明示、import 順を 3 段に整理、絶対 import エイリアス（`@shared/*` `@main/*` `@renderer/*`）を規定、bootstrap-and-auth を Pattern B として明示 |
| 2026-05-05 | フェーズ 1 実装完了。portal 雛形 / 7 handler モジュール / React ルーティング / Bootstrap・Login・Home（LP 風）画面 / Tailwind テーマ。`npm run typecheck` 通過、`npm run build` 成功、`npm run dev` で Electron 起動確認。preload は sandbox 向け CJS 出力。 |
| 2026-05-05 | 統合完了後に旧 6 アプリフォルダを削除予定、Python は exe のみポータル側に集約する方針を `requirements.md` §3.4 と `task-progress.md` フェーズ 5 に記録 |
| 2026-05-05 | フェーズ 2 のうちマスタ 6 + SKU CRUD、設定、操作者、ランチャー（子ウィンドウ）を実装済みと記録。中央スキーマは当面 `schema.ts` を正とし `db-schema.md` に注記。CSV/Excel インポート・設定ロゴは未着手 |
| 2026-05-05 | **フェーズ 3-A 完了**（内蔵 seisan-board: 案件・ガント・ダッシュボード表示・中央 DB 連携・サテライト DB・マイグレーション相当まで動作確認済みと整理）。図面番号(品番) 用語統一・CSV 品番ヘッダー互換・SKU 台帳フィールドのマスタ追従（空／同期時のみ）を実装済みとして本書・2-B・3-A メモに反映 |
| 2026-05-05 | フェーズ 3 の項順：**3-B = drawing-libraly**、**3-C = Process management** に入替。LP の `APP_CATALOG` にも同順を反映 |
| 2026-05-06 | **図面ライブラリ本格 IPC 化**: `drawing-library.db`・スキーマ移行・`drawing*` / `drawing-dxf*` / `drawing-edrawings*` / `drawing-comment*` / `drawing-library:compare` 実装。LP 子ウィンドウでタブ UI（提供ファイル同期／顧客 DB／自社 DB）。比較 exe はリソースまたは環境変数 |
| 2026-05-06 | **図面ライブラリ**: 顧客図面を提供ファイルタブに統一（顧客 DB タブ削除）。PDF 比較は外部ファイル2件のみ（`drawing-library:pickPdfForCompare`）。`drawing-library:compare` はログイン可 |
| 2026-05-06 | 図面比較（おまけ）: `drawingCompare.ts` でスクリプト／exe パス解決・Windows Python 起動（`py -3`）・DB 未オープン時の一時出力先を実装。`drawing-library:compare` から `ensureDrawingLibrary` を外し UI 文言・`ipc-channels.md` を追随 |
| 2026-05-06 | 図面ライブラリ **UI 追記**: 詳細モーダル全幅化（`Modal` `width="full"`）、`PdfJsViewer`／`pdfjs-dist`。顧客詳細の旧図面バッジ二重表示を解消。一覧カード主行を **客先_機種_品番_名称_Rev** の `_` 連結に統一。`project_files.is_obsolete` の意味（図面ライブラリ表示・生産ボード UI 未参照）を注記。`out/main` 古い場合の IPC 未登載はビルド／dev 再起動で解消 |
| 2026-05-06 | **3-B 図面ライブラリ一旦完成**（以降は改善・将来タスクに切り出し）。**3-C 工程管理**: `process-management.db` 隣接オープン・`process-mgmt:*` IPC・`#/apps/process-management` 初回 UI（ボード + 案件/タスク一覧）。`APP_CATALOG` で工程管理を利用可に |
| 2026-05-06 | **工程表示**: `app_operators.processView`（Flask 原型 `Process management` の `process_view` 準拠）・スキーマ v2・工程管理の一覧フィルタ・`operator:updateProcessView`・`auth:syncSession`。`shared/processView.ts` / `docs/db-schema.md` / `ipc-channels.md` 更新 |
| 2026-05-06 | **工程管理ボード**: 左右マージン、カスケード絞り込み・全文検索・ソート・ページネーション（20/50/100）、`listBoard` は query/client 空でフル取得＋レンダラ処理、更新列を追加（上記 3-C チェックリスト・実装メモ） |
| 2026-05-06 | **工程タスク完了と進捗％**: 完了状態は表示・DB 更新とも 100% に整合（`mapDbToPmTask` / `updateTask` / `updateTaskStatus` / マイタスク完了 UI） |
| 2026-05-09 | **PixoConverter 子プロセス起動**: `externalProcess.ts`・`PIXO_CONVERTER_EXE`・管理画面 exe 登録・`resources/tools/pixo-converter` 手順。`ipc-channels.md` 追随。 |
| 2026-05-09 | **PDF Scope Vault 統合撤去**（旧 3-D）: 子プロセス連携・同梱・設定 IPC・`PDF_scope_vault` フォルダ削除。 |
| 2026-05-09 | **PixoConverter ポータル連携を再適用**（設定・ランチャー・ドキュメント）。 |
| 2026-05-09 | **PixoConverter 計画変更**: 最終形を**内蔵**に変更（外部起動からの移行タスクを §3-E「将来」に記載。実装は未着手）。 |
| 2026-05-09 | **生産ボード（内蔵）**: CSV インポートにフォーマット説明・**CSV テンプレ DL**・**リビジョン**列（任意・旧 CSV 互換）・エクスポートのリビジョン列。設定の **Excel テンプレ**は `resources/format.xlsx` を同梱して DL、記入注意を更新。**PixoConverter（単体）**: PDF 連結／ページ編集の Acrobat 風 UI と `PdfReplacePage` 不具合修正。 |
| 2026-05-09 | **スタンドアロンアプリ 5 フォルダをリポジトリから削除**: `drawing-libraly` / `master-database` / `seisan-board` / `Process management` / `Process management desktop`（機能は `portal` 内蔵に集約済み）。`drawingCompare`・CSV フォーマット DL のフォールバックパス・ドキュメント索引を追随。 |
| 2026-05-09 | **ホーム LP**: アプリ一覧を 4 セクション化・説明文拡充（`APP_CATALOG`・`AppDescriptor.section`）。**事務向けライトテーマ**（生産ボード・図面ライブラリ・工程管理の `.portal-app-calm-shell`）・文字色調整・共有 `Button` primary。**図面ライブラリ**の薄字修正・**顧客／自社の一覧ページネーション（20/50/100）**。**Pixo** temp 終了時クリア。**README** 保存階層・Pixo 注記。詳細は本書「直近の改善・修正」を参照。 |
| 2026-05-09 | **図面ライブラリ**: 説明文をヘルプモーダル化。**工程管理**: 説明をヘルプ化・ボードの案件内容／進捗メモ UI 改善。**ホーム**: ヒーロー背景を設定＋constants で指定可能（`file:`・CSP・`webSecurity`）、カルーセル背景は撤去、LP セクション全面背景＋`w-fit` パネル・カルーセル縦オーバーレイ縮小。詳細は本書「直近の改善・修正」。 |

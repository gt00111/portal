# ポータルアプリ ドキュメント索引

本ディレクトリはポータル開発のための設計・運用ドキュメント群を置く場所。
**AI エージェント（Cursor）が自分で参照・更新する** ことを前提に整理している。
新しいドキュメントを足したときは、このファイルにも必ずリンクを追加すること。

---

## 1. 最初に読む

| ファイル | 用途 |
|----------|------|
| [requirements.md](./requirements.md) | **要件定義書**。ポータルの目的・統合方針・スコープ・受け入れ基準の単一の真実。**部材管理（parts-tracker）** は §8.5（商社・標準 LT・**SolidWorks BOM CSV**・Rev・**非表示部品**・親番 BOM テンプレート・**製品中心 BOM（5-E）**・**Rev 差分表示（5-F）** 等）・**工程管理の並行作業・補助担当** は §8.6・生産ボード直下（3-A-2） |
| [task-progress.md](./task-progress.md) | **フェーズ別タスク管理**。チェックリスト。進捗はここで追う |

---

## 2. 設計ドキュメント

| ファイル | 用途 |
|----------|------|
| [architecture.md](./architecture.md) | プロジェクト構造、レイヤ分離、データフロー、ビルド構成 |
| [db-schema.md](./db-schema.md) | 中央 DB（`portal-master.db`）のテーブル定義・インデックス・マイグレーション |
| [ipc-channels.md](./ipc-channels.md) | IPC チャネル一覧（`module:action`）とリクエスト/レスポンスの型 |
| [launcher-design.md](./launcher-design.md) | 内蔵アプリ別ウィンドウ起動・外部 exe 起動・二重起動防止・セッション共有 |
| [bootstrap-and-auth.md](./bootstrap-and-auth.md) | 起動ステートマシン、admin 自動 seed、強制パスワード変更 |
| [user-permissions.md](./user-permissions.md) | **ユーザー権限メモ**（ポータル / アプリ / グループ別のできる・できない） |
| [app-router-best-practices.md](./app-router-best-practices.md) | React Router（HashRouter）の使い方、認証ガード、アンカー遷移、マルチウィンドウとの整合 |
| [ui-design.md](./ui-design.md) | カラー・タイポ・Hero カルーセル仕様・共通 UI コンポーネント・アニメーション |

---

## 3. 開発ガイド

| ファイル | 用途 |
|----------|------|
| [coding-conventions.md](./coding-conventions.md) | コーディング規約（TS / ESM / 命名 / エラー処理 / import 順） |

---

## 4. 参考（同梱・隣接アプリ）

| 参照先 | 内容 |
|--------|------|
| `../src/renderer/src/routes/MasterDatabase.tsx` ほか | マスタ管理・中央 DB CRUD |
| `../src/renderer/src/apps/seisan-board/` | 生産ボード UI・サテライト DB 連携 |
| `../src/renderer/src/routes/ProcessManagementApp.tsx` ほか | 工程管理はポータル内に実装 |
| `../src/main/modules/drawing-library/` | 図面ライブラリ（IPC・専用 DB）はポータル内に実装 |
| `../src/renderer/src/apps/pixo-converter/` ほか | 旧 PixoConverter をポータル内蔵（`#/apps/pixo-converter`）。スタンドアロン `PixoConverter/` は削除済み |

※ 旧スタンドアロン用フォルダ（`drawing-libraly` / `master-database` / `seisan-board` / `Process management*`）は **2026-05-09 にリポジトリから削除済み**（機能は上記 `portal` 配下へ集約）。

---

## 5. 更新ルール

- **要件変更** → まず `requirements.md` を更新し、関連設計ドキュメントに反映
- **タスク完了** → `task-progress.md` のチェックボックスを更新
- **新規設計** → 設計ドキュメントを新設し、本索引にリンクを足す
- Git コミット時は対象ドキュメントも含める

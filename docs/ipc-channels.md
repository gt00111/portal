# IPC チャネル一覧

すべての IPC は **`module:action`** 形式、レスポンスは **`{ success, data | error }`** で統一する。

```ts
type IpcSuccess<T> = { success: true;  data: T };
type IpcError     = { success: false; error: string };
type IpcResponse<T> = IpcSuccess<T> | IpcError;
```

レンダラは **常に `window.api.invoke(channel, payload)`** を使う。
個別の便宜関数は preload に置かない（Modular Architecture Rules）。

---

## 1. 権限表記

| 表記 | 意味 |
|------|------|
| 🟢 open | 未ログインでも呼べる |
| 🔒 login | ログイン必須 |
| ✏️ editor | `editor` 以上 |
| 👑 admin | `admin` のみ |

---

## 2. `settings:*`

DB パス・会社情報・bootstrap 状況などポータル全般の設定。

| チャネル | 権限 | Request | Response (`data`) | 備考 |
|---------|------|---------|--------------------|------|
| `settings:get` | 🟢 | `undefined` | `AppSettings` | DB パス、bootstrapped、会社名、モットー等を一括取得 |
| `settings:pickExistingDatabase` | 🟢 | `undefined` | `{ selected: boolean; settings: AppSettings \| null }` | ファイル選択ダイアログ |
| `settings:createNewDatabase` | 🟢 | `{ dirPath?: string }` | `{ selected: boolean; settings: AppSettings \| null }` | 新規 DB 作成 |
| `settings:updateCompanyInfo` | 👑 | `{ companyName?: string; portalName?: string; motto1?: string; motto2?: string; motto3?: string }` | `AppSettings` | 会社情報を更新 |

```ts
interface AppSettings {
  databasePath: string;           // 現在使用中の DB ファイルパス
  bootstrapped: boolean;          // admin の初期 seed 完了済みか
  companyName: string;
  portalName: string;
  motto1: string;
  motto2: string;
  motto3: string;
}
```

---

## 3. `auth:*`

認証・セッション・自分のパスワード変更。

| チャネル | 権限 | Request | Response (`data`) | 備考 |
|---------|------|---------|--------------------|------|
| `auth:bootstrapStatus` | 🟢 | `undefined` | `{ operatorCount: number; bootstrapped: boolean }` | ログイン画面の分岐に使う |
| `auth:login` | 🟢 | `{ username: string; password: string }` | `SessionUser` | 失敗時は `error` |
| `auth:logout` | 🔒 | `undefined` | `null` |  |
| `auth:session` | 🟢 | `undefined` | `SessionUser \| null` | 未ログインなら `null` |
| `auth:syncSession` | 🔒 | `undefined` | `SessionUser` | 中央 DB の `app_operators` を再読込しメインセッションを更新（工程表示変更の反映など） |
| `auth:changePassword` | 🔒 | `{ currentPassword: string; newPassword: string }` | `SessionUser` | 成功時 `mustChangePassword=0` に更新 |

```ts
type AppRole = "viewer" | "editor" | "admin";
type ProcessView = "solidworks" | "cadmac" | "both";

interface SessionUser {
  id: number;
  username: string;
  role: AppRole;
  processView: ProcessView;
  mustChangePassword: boolean;
}
```

---

## 4. `operator:*`

操作者（ログインアカウント）管理。`admin` 専用が大半。

| チャネル | 権限 | Request | Response (`data`) |
|---------|------|---------|--------------------|
| `operator:list` | 👑 | `undefined` | `OperatorRow[]` |
| `operator:create` | 👑 | `{ username; password; role; processView? }` | `OperatorRow` |
| `operator:setActive` | 👑 | `{ id: number; isActive: boolean }` | `null` |
| `operator:updateRole` | 👑 | `{ id: number; role: AppRole }` | `null` |
| ~~`operator:updateProcessView`~~ | — | — | — | **廃止（4-A）**。工程表示は `user-access:saveAppGrants` で `process-management` の grant に設定 |

## 4b. `user-access:*`（フェーズ 4-A）

マスタユーザーのグループ所属・アプリ別権限（ポータル admin のみ）。

| チャネル | 権限 | Request | Response (`data`) |
|---------|------|---------|-------------------|
| `user-access:list` | 👑 portal admin | `undefined` | `UserAccessDetail[]` |
| `user-access:setGroupMembership` | 👑 | `{ userNameId, groupNameId \| null, roleInGroup }` | `null` |
| `user-access:saveAppGrants` | 👑 | `{ userNameId, grants: UserAppGrantRow[] }` | `null` |

```ts
type ProcessView = "solidworks" | "cadmac" | "both";

interface OperatorRow {
  id: number;
  username: string;
  role: AppRole;
  processView: ProcessView;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## 5. `master:*`（フェーズ 2 で本実装）

6 つのマスタを **`masterType` で切り替える汎用 API**。

| チャネル | 権限 | Request | Response (`data`) |
|---------|------|---------|--------------------|
| `master:list` | 🔒 | `{ masterType: MasterType; includeInactive?: boolean; search?: string }` | `MasterRecord[]` |
| `master:create` | ✏️ | `{ masterType: MasterType; name: string }` | `MasterRecord` |
| `master:update` | ✏️ | `{ masterType: MasterType; id: number; name: string }` | `MasterRecord` |
| `master:setActive` | ✏️ | `{ masterType: MasterType; id: number; active: boolean }` | `MasterRecord` |

```ts
type MasterType =
  | "customer" | "model" | "partNumber" | "componentName"
  | "groupName" | "userName";

interface MasterRecord {
  id: number;
  name: string;
  isActive: boolean;
  inactiveSource: "user" | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## 6. `sku:*`（フェーズ 2 で本実装）

`m_skus` テーブル（客先×機種×品番×部品名称×図面番号×Rev）操作。

| チャネル | 権限 | Request | Response (`data`) |
|---------|------|---------|--------------------|
| `sku:list` | 🔒 | `{ customerId?: number; modelId?: number; partNumberId?: number; componentNameId?: number; search?: string }` | `Sku[]` |
| `sku:create` | ✏️ | `Omit<Sku, "id" \| "createdAt" \| "updatedAt">` | `Sku` |
| `sku:update` | ✏️ | `{ id: number; patch: Partial<Sku> }` | `Sku` |
| `sku:setActive` | ✏️ | `{ id: number; active: boolean }` | `Sku` |
| `sku:importCsv` | ✏️ | `{ rows: string[][] }` | `{ inserted: number; updated: number; skipped: number }` |
| `sku:exportCsv` | 🔒 | `undefined` | `{ csv: string }` |

```ts
interface Sku {
  id: number;
  customerId: number | null;
  modelId: number | null;
  partNumberId: number | null;
  componentNameId: number | null;
  drawingNumber: string | null;
  revision: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## 6a. `drawing-library:*`（生産ボード連携・専用 DB・比較）

| チャネル | 権限 | Request | Response (`data`) |
|---------|------|---------|--------------------|
| `drawing-library:listSeisanCustomerDrawings` | 🔒 | `undefined` または `{}` | `ProjectFileWithProject[]` |
| `drawing-library:status` | 🔒 | `undefined` | `{ connected: boolean; path: string \| null }` |
| `drawing-library:compare` | 🔒 | `CompareDrawingsInput`（`filePath1` / `filePath2` は**絶対パス推奨**。登録図面の相対パスは非推奨・顧客図面 UI からは利用しません） | `{ resultImage: string; message: string }`（PNG の data URL） |
| `drawing-library:pickPdfForCompare` | 🔒 | `undefined` または `{}` | `{ path: string }`（単一 PDF の絶対パス。比較用にダイアログで選択） |
| `drawing-library:getPdfPageCount` | 🔒 | `{ path: string }`（ローカル PDF の絶対パス） | `{ pageCount: number }`（PDF 比較タブでページ選択用） |
| `drawing-library:categoryList` | 🔒 | `{ drawingType?: 'customer' \| 'work' }` | `string[]` |
| `drawing-library:categoryAdd` | ✏️ | `{ drawingType?: 'customer' \| 'work'; name: string }` | `null` |
| `drawing-library:categoryDelete` | ✏️ | `{ drawingType?: 'customer' \| 'work'; name: string }` | `null` |
| `drawing-library:masterList` | 🔒 | `{ table?: 'customers' \| 'models' \| 'products' }` | `{ id; name }[]` |
| `drawing-library:masterCreate` | ✏️ | `{ table?, name }` | `{ id; name }` |
| `drawing-library:masterDelete` | ✏️ | `{ table?, id }` | `null` |

生産ボードの `project_files` 参照は従来どおり。**顧客図面**は提供ファイル一覧のみ（登録図面 DB の顧客タブは廃止）。`drawing-library:compare` はログイン済みユーザが利用可（**図面ライブラリ DB 未オープンでも可**）。結果 PNG の一時ファイルは、図面 DB が開いているときはそのディレクトリ直下の `_temp`、未オープン時は `userData` 配下の `drawing-compare-temp` に生成してから data URL で返却する。比較ツールは **`compare_drawings.exe` を優先**（`process.resourcesPath/tools/compare_drawings.exe`＝`electron-builder` の `extraResources`、`resources/tools/` へ開発時配置、`DRAWING_COMPARE_EXE` で上書き）。無い場合は Python スクリプト（`DRAWING_COMPARE_SCRIPT` で `.py` の絶対パスを指定。任意で `resources/tools/compare_drawings.py` を配置しても可）。

---

## 6b. `drawing:*`（登録図面 CRUD）

図面ライブラリ専用 DB の `drawings` テーブル。

| チャネル | 権限 | Request | Response |
|---------|------|---------|----------|
| `drawing:list` | 🔒 | `DrawingListParams`（`sortBy` / `sortOrder` 可） | `DrawingListResult` |
| `drawing:workCascadeOptions` | 🔒 | `{ customerName?; model? }` | `DrawingWorkCascadeResult`（自社図面の客先→機種→品番候補） |
| `drawing:get` | 🔒 | `{ id: number }` | `LibDrawingRow` |
| `drawing:create` | ✏️ | `{ input: DrawingUpsertInput }` | `LibDrawingRow` |
| `drawing:update` | ✏️ | `{ id; patch }` | `LibDrawingRow` |
| `drawing:delete` | ✏️ | `{ id }` | `null` |
| `drawing:setObsolete` | ✏️ | `{ id; isObsolete }` | `LibDrawingRow` |
| `drawing:checkDuplicate` | 🔒 | `{ product_name?, revision?, drawing_type?, exclude_id? }` | `{ is_duplicate; existing }` |
| `drawing:pickPdf` | ✏️ | `{ customerName; drawingType? }` | `{ file_path }` |
| `drawing:readFile` | 🔒 | `{ relativePath }` | `{ base64; mime }` |
| `drawing:exportFile` | 🔒 | `{ relativePath; defaultName? }` | `{ path }`（保存ダイアログで選択した絶対パス） |

---

## 6c. `drawing-edrawings:*` / `drawing-comment:*`

DXF の取り扱いは廃止済み（旧 `drawing-dxf:*` チャネル群は削除）。

| チャネル | 権限 | 備考 |
|---------|------|------|
| `drawing-edrawings:list` | 🔒 | `{ drawing_id }` |
| `drawing-edrawings:upload` | ✏️ | eDrawings 拡張子、eDrawings 保存先は自社フォルダ規約 |
| `drawing-edrawings:delete` | ✏️ | `{ id }` |
| `drawing-comment:list` | 🔒 | `{ drawing_id }` |
| `drawing-comment:create` | ✏️ | `{ drawing_id; comment_text }` |
| `drawing-comment:update` | ✏️ | `{ id; comment_text }` |
| `drawing-comment:delete` | ✏️ | `{ id }` |

---

## 6d. `process-mgmt:*`（工程管理サテライト DB）

中央マスタ DB と**同じディレクトリ**の `process-management.db`。`tasks` は生産ボード案件 ID（`seisan_project_id`）で紐づける。**案件の正は生産ボード**（工程 DB の `projects` は外部キー用の束ね 1 行が自動整備される。後方互換で `process-mgmt:project:*` も残置）。認証はポータル側（`app_operators`）。チャネル名は旧スタンドアロンの `project:*` / `task:*` と衝突しないよう **`process-mgmt:` プレフィックス**。

| チャネル | 権限 | Request | Response (`data`) |
|---------|------|---------|---------------------|
| `process-mgmt:status` | 🔒 | `undefined` | `{ connected: boolean; path: string \| null }` |
| `process-mgmt:project:list` | 🔒 | `undefined` | `PmProject[]` |
| `process-mgmt:project:create` | ✏️ | `{ name; description?; client?; drawingNumber?; revision?; note? }` | `PmProject` |
| `process-mgmt:project:getDetail` | 🔒 | `{ id }` | `PmProject` |
| `process-mgmt:project:update` | ✏️ | `{ id; name; description; client; drawingNumber; revision; note; status }` | `PmProject` |
| `process-mgmt:project:delete` | ✏️ | `{ id }` | `{ id; relatedTaskCount }` |
| `process-mgmt:task:listByProject` | 🔒 | `{ projectId }` | `PmTask[]` |
| `process-mgmt:task:create` | ✏️ | `{ projectId; title; description?; assignee?; processType? }` | `PmTask` |
| `process-mgmt:task:updateStatus` | ✏️ | `{ id; status }` | `PmTask` |
| `process-mgmt:task:getDetail` | 🔒 | `{ id }` | `PmTask` |
| `process-mgmt:task:update` | ✏️ | `{ id; title; description; assignee; status }` | `PmTask` |
| `process-mgmt:task:delete` | ✏️ | `{ id }` | `{ id }` |
| `process-mgmt:task:listBoard` | 🔒 | `{ mode: 'active' \| 'history'; query?; client?; boardProcessView? }` | `PmBoardTask[]`（**全体俯瞰**：`active`＝完了以外、`history`＝完了のみ。`boardProcessView` は **`history` 時のみ有効**（`solidworks` / `cadmac` / `both` で工程を切替。`active` 時は無視されセッションの `processView` を使用）。担当者でのサーバ側絞り込みなし。`query`・`client` は一覧取得後のメモリフィルタ。呼び出し時に生産ボードから SolidWorks/CADMAC の既定タスクを同期） |
| `process-mgmt:task:listMy` | 🔒 | `undefined` | `PmBoardTask[]`（ログイン名が担当かつ未完了。同期のうえ `PmBoardTask` 表示用に enrich） |
| `process-mgmt:task:updateProgressNote` | 🔒 | `{ id; progressNote; progressPercent }`（0〜100 の整数） | `PmTask`（`progress_note` と `progress_percent`。**担当者または管理者のみ**更新可） |
| `process-mgmt:task:start` | ✏️ | `{ id }` | `PmTask`（工程管理では**閲覧者含む**ログインユーザーが操作可。他アプリの ✏️ 定義とは別） |
| `process-mgmt:task:complete` | ✏️ | `{ id }` | `PmTask`（同上） |
| `process-mgmt:task:undoComplete` | 🔒 | `{ id; reason }` | `PmTask`（**管理者のみ**。完了→作業中。`reason` は取り消し報告として DB に保存。完了時は直前の取り消しメタをクリア） |
| `process-mgmt:notify:listPending` | 🔒 | `undefined` | `PmTaskCompletionNotification[]`（ログイン管理者向けの**未確認**タスク完了通知。`acknowledged_at` が付いた行は含まない） |
| `process-mgmt:notify:acknowledge` | 🔒 | `{ id }`（通知行の ID） | `{ acknowledged: true }`（自分宛の未確認通知のみ `acknowledged_at` をセット。他人宛・既に確認済みはエラー） |

型は `shared/processMgmt.ts` の `PmProject` / `PmTask`（`completionUndoReason` ほか） / `PmBoardTask` / `PmTaskCompletionNotification` を参照。

**工程表示**: `task:listBoard` の **アクティブ**、`task:listMy`、`task:listByProject`、各タスク操作はセッションの `processView` で絞り込む。**履歴**のボード一覧だけはリクエストの `boardProcessView` で SW / CADMAC / 両方を切り替え可能。Flask 原型の「SolidWorks 一覧／CADMAC 一覧」の出し分けに相当（デスクトップは単一テーブル＋ SQL 条件）。

---

## 7. `launcher:*`

アプリ起動。**内蔵アプリは新規 BrowserWindow**（`pixo-converter` を含む）。

| チャネル | 権限 | Request | Response (`data`) |
|---------|------|---------|--------------------|
| `launcher:openApp` | 🔒 | `{ appId: AppId }` | `AppDescriptor`（内蔵は別ウィンドウで `#/apps/<appId>` を表示） |
| `launcher:isOpen` | 🔒 | `{ appId: AppId }` | `{ open: boolean }` |
| `launcher:close` | 🔒 | `{ appId: AppId }` | `{ closed: boolean }` |

```ts
type AppId =
  | "master-database"
  | "seisan-board"
  | "process-management"
  | "drawing-library"
  | "pixo-converter";
```

- 内蔵アプリは `#/apps/<appId>` を別 `BrowserWindow` で表示。

---

## 8. フェーズ別導入タイミング

| フェーズ | 実装チャネル |
|---------|-------------|
| 1 | `settings:*`, `auth:*`, `operator:list/create/setActive/updateRole/resetPassword`, `launcher:openApp`（スケルトン） |
| 2 | `master:*`, `sku:*`, `operator:*` 完全版, `launcher:*` 本実装 |
| 3 | `seisan-*`, `drawing:*`, `drawing-edrawings:*`, `drawing-comment:*`, `drawing-library:*`, `process-mgmt:*`。サテライト / 隣接 DB |
| 4-A | `user-access:*`（アプリ権限・グループ管理者） |
| 4-B | `master:*` の `m_categories` 拡張（`scope`） |
| 4-C | `pixo-converter:progress`（push）。preload は `window.api.on('pixo-converter:progress', cb)` で許可チャネル限定購読 |
| 4-D | `audit:list` / `audit:listChannels` / `audit:listUsernames`（👑 ポータル admin） |

---

## 9. レスポンス実装テンプレ

Handler では **必ず `try/catch`**。失敗は `{ success: false, error: string }`。

```ts
// src/main/modules/<name>/<name>.handler.ts
import type { IpcMain } from "electron";

import { assertLoggedIn, assertAdmin } from "@main/auth-guard.js";

import * as repo from "./<name>.repo.js";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("<name>:list", async () => {
    try {
      assertLoggedIn();
      const data = repo.list();
      return { success: true as const, data };
    } catch (err) {
      return {
        success: false as const,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  });
}
```

> import は 3 段（external → shared/@ エイリアス → 相対）。詳細は [coding-conventions.md §9](./coding-conventions.md) を参照。

---

## 10. 命名ルール

- 動詞は **`get` / `list` / `create` / `update` / `delete` / `setActive` / `importCsv` / `exportCsv`** を推奨
- `delete` は **論理削除**（`setActive(false)`）を基本とし、物理削除が必要な場合のみ使う
- レスポンスは単数を返す作成系は **作った 1 件** を返すのが原則（画面が楽）

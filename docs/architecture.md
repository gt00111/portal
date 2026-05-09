# アーキテクチャ設計

ポータルアプリの全体構造を記述する。原則は以下。

- **Modular Architecture Rules** に準拠（`src/main/modules/<name>/` で完結）
- **Electron のセキュリティ規約**（contextIsolation, nodeIntegration=false, sandbox=true）を厳守
- **ビジネスロジックはメインプロセス** に集約。レンダラは `window.api.invoke` のみ

---

## 1. プロジェクト構造

```
.                                 ← リポジトリルート（package.json 所在）
├── .cursor/                       ← エディタ規約（任意）
├── docs/                          ← 設計・運用ドキュメント
├── resources/                     ← 配布アセット（Poppler、tools 等）
├── src/
│   ├── main/                      ← メインプロセス（Node.js）
│   │   ├── index.ts               ← エントリ。whenReady → loadModules → createPortalWindow
│   │   ├── window.ts              ← BrowserWindow 生成（ポータル本体 + 別ウィンドウ）
│   │   ├── session.ts             ← ログインセッションのメモリ保持
│   │   ├── auth-guard.ts          ← assertLoggedIn / assertCanWrite / assertAdmin
│   │   ├── password.ts            ← scrypt ハッシュ
│   │   ├── db/
│   │   │   ├── connection.ts      ← better-sqlite3 の接続を管理（DB パス切替）
│   │   │   ├── schema.ts          ← 全テーブル DDL
│   │   │   ├── migrate.ts         ← schema_meta による版管理
│   │   │   └── seed.ts            ← admin/admin 自動 seed、会社情報初期値
│   │   └── modules/
│   │       ├── loader.ts          ← import.meta.glob で *.handler.ts を自動登録（手動 import なし）
│   │       ├── auth/
│   │       │   ├── auth.repo.ts
│   │       │   └── auth.handler.ts
│   │       ├── operator/
│   │       │   ├── operator.repo.ts
│   │       │   └── operator.handler.ts
│   │       ├── settings/
│   │       │   ├── settings.repo.ts
│   │       │   └── settings.handler.ts
│   │       ├── master/
│   │       │   ├── master.repo.ts
│   │       │   └── master.handler.ts
│   │       ├── sku/
│   │       │   ├── sku.repo.ts
│   │       │   └── sku.handler.ts
│   │       └── launcher/
│   │           └── launcher.handler.ts
│   ├── preload/
│   │   └── index.ts               ← contextBridge で api.invoke のみ公開
│   ├── renderer/                  ← レンダラ（React）
│   │   ├── main.tsx
│   │   ├── App.tsx                ← HashRouter + ルート定義
│   │   ├── routes/
│   │   │   ├── Bootstrap.tsx      ← 初期セットアップ
│   │   │   ├── Login.tsx          ← ログイン
│   │   │   ├── Home.tsx           ← LP 風ホーム
│   │   │   ├── RequireAuth.tsx    ← 認証ガード（Outlet）
│   │   │   └── apps/              ← フェーズ 2 以降で追加
│   │   ├── components/
│   │   │   ├── Navbar.tsx
│   │   │   ├── HeroCarousel.tsx
│   │   │   ├── AppSection.tsx
│   │   │   ├── ForcePasswordChangeModal.tsx
│   │   │   └── ui/                ← Button, Card, Input, Field, Toast 等
│   │   ├── hooks/
│   │   │   ├── useAuth.ts         ← セッション取得・更新
│   │   │   ├── useInvoke.ts       ← 共通の IPC ラッパ（型安全）
│   │   │   └── useToast.ts
│   │   ├── lib/
│   │   │   └── cn.ts              ← className 合成
│   │   └── styles/
│   │       └── globals.css
│   └── shared/                    ← メインとレンダラ両方で import する型・定数
│       ├── ipcResponse.ts         ← IpcSuccess / IpcError / IpcResponse
│       ├── types.ts               ← AppOperator, MasterRecord 等
│       ├── auth.ts                ← AppRole, APP_ROLES
│       └── constants.ts           ← TABLE_NAMES, APP_IDS など
├── electron.vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── tsconfig.node.json
├── package.json
└── README.md
```

---

## 2. レイヤ分離

```
┌─────────────────────────┐
│       Renderer          │   React UI だけ。window.api.invoke しか触らない
├─────────────────────────┤   ← contextBridge（api.invoke のみ）
│       Preload           │   1 ファイルだけ。ロジック禁止
├─────────────────────────┤   ← ipcMain.handle
│       Handler           │   IPC 受信 → Repo 呼び出し → {success,data|error} で返す
├─────────────────────────┤
│       Repository        │   SQL を持つ唯一の層（better-sqlite3 直接使用）
├─────────────────────────┤
│   Infra (db / session)  │   DB 接続、セッション、password ハッシュ
└─────────────────────────┘
```

| レイヤ | 置き場所 | 責務 | 禁止 |
|--------|----------|------|------|
| Renderer | `src/renderer/` | UI、`window.api.invoke` の呼び出し | Node API、DB 直接アクセス |
| Preload | `src/preload/` | `contextBridge` で `api.invoke` を公開 | 業務ロジック |
| Handler | `src/main/modules/*/*.handler.ts` | IPC 受信、入力検証、`try/catch`、Repo 呼び出し、`{success,data|error}` | 生 SQL |
| Repository | `src/main/modules/*/*.repo.ts` | SQL 実行、型付けされたドメインオブジェクトを返す | IPC、UI |
| Infra | `src/main/db/`, `src/main/session.ts` 等 | DB 接続・マイグレーション・セッション保持 | 業務ロジック |

---

## 3. データフロー

### 3.1 ログインの例

```
[User clicks Login]
    │
    ▼
Login.tsx  — window.api.invoke("auth:login", { loginName, password })
    │
    ▼  (preload の contextBridge)
    │
    ▼  (ipcMain.handle "auth:login")
auth.handler.ts
    │ assertCanWrite 不要。try/catch
    │ operatorRepo.authenticateOperator()
    ▼
operator.repo.ts
    │ SELECT ... FROM app_operators WHERE loginName = ?
    │ scrypt 検証
    ▼  成功 → { ok: true, operator }
auth.handler.ts
    │ session.setSession(operator)
    │ return { success: true, data: { operatorId, role, ... } }
    ▼
Login.tsx
    │ navigate("/home", { replace: true })
```

### 3.2 IPC の共通形

```ts
// 成功
{ success: true, data: T }
// 失敗
{ success: false, error: string }
```

- **必ず `try/catch`** で Handler を囲む
- 失敗メッセージは **ユーザーに見せてよい日本語** にする（SQL 生エラーを素のまま出さない）

---

## 4. ビルド構成（electron-vite）

`electron.vite.config.ts` で 3 つのエントリ（`main` / `preload` / `renderer`）を持つ。

| エントリ | 入力 | 出力 | target |
|----------|------|------|--------|
| main | `src/main/index.ts` | `out/main/index.js` | Node (Electron main) |
| preload | `src/preload/index.ts` | `out/preload/index.js` | Node (preload) |
| renderer | `src/renderer/main.tsx` | `out/renderer/index.html` | Browser (renderer) |

- パッケージ配布は `electron-builder`。`asarUnpack` に `better-sqlite3` を追加（既存 master-database と同じ）。

---

## 5. セキュリティ規約

```ts
// src/main/window.ts
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, "../preload/index.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
});
```

- `sandbox: true` が有効でも `ipcRenderer.invoke` は preload 経由で使える（`contextBridge` により）。
- `preload/index.ts` は **以下 1 つ** だけを公開する:

```ts
contextBridge.exposeInMainWorld("api", {
  invoke: (channel: string, data?: unknown) => ipcRenderer.invoke(channel, data),
});
```

- **`ipcMain.on` は使わない**。必ず `ipcMain.handle`。

---

## 6. セッション

- メインプロセスのメモリに保持（`src/main/session.ts` の `session` 変数）。
- アプリ終了で消える（PC ログアウト同等）。
- **複数 BrowserWindow（ポータル本体＋子ウィンドウ）でも同じセッションが共有される**（同じメインプロセスだから）。
- 子プロセス起動（外部 exe）には当面渡さない。

---

## 7. マルチウィンドウ

詳細は [launcher-design.md](./launcher-design.md) と [app-router-best-practices.md](./app-router-best-practices.md) §6 に分離。
要点だけ述べる。

- ポータル本体の `BrowserWindow` は `src/main/window.ts` の `createPortalWindow` で生成。
- 内蔵アプリを開くとき、`launcher.handler.ts` が **新しい `BrowserWindow` を生成**し、`loadURL` で同じ `renderer/index.html#/apps/<appId>` に遷移させる。
- 起動済みは `Map<appId, BrowserWindow>` で管理し、二重起動を防ぐ。

---

## 8. ディレクトリ命名・モジュール追加の手順

新しい機能モジュールを足すとき:

1. `src/main/modules/<name>/` を作る
2. `<name>.repo.ts` と `<name>.handler.ts` を置く
3. `<name>.handler.ts` に `export function register(ipcMain: IpcMain): void {}` を定義
4. **loader.ts への追記は不要**（後述の自動ロードで拾われる）
5. IPC チャネル名は `<name>:<action>`（例: `sku:list`）
6. 新チャネルを [ipc-channels.md](./ipc-channels.md) に追記

### 8.1 loader.ts は auto-discovery（`.cursor/rules/Modular-Architecture-Rules.mdc` 準拠）

Modular Architecture Rules は「**Modules MUST be auto-loaded by a module loader**」を要求している。
手動 import と register を loader に書くと規約違反になるため、
electron-vite が提供する **`import.meta.glob`** で `modules/*/*.handler.ts` を自動収集する。

```ts
// src/main/modules/loader.ts
import type { IpcMain } from "electron";

// eager: true ですべての handler を同期 import する
const handlers = import.meta.glob<{
  register?: (ipcMain: IpcMain) => void;
}>("./*/*.handler.ts", { eager: true });

export function loadModules(ipcMain: IpcMain): void {
  for (const [path, mod] of Object.entries(handlers)) {
    if (typeof mod.register === "function") {
      mod.register(ipcMain);
    } else {
      // 規約違反を起動時に気付けるよう警告
      console.warn(`[loader] ${path} does not export register()`);
    }
  }
}
```

```ts
// src/main/index.ts
import { app, ipcMain } from "electron";
import { loadModules } from "./modules/loader.js";   // ← 唯一の import
import { createPortalWindow } from "./window.js";

app.whenReady().then(() => {
  loadModules(ipcMain);                              // ← 個別モジュールは知らない
  createPortalWindow();
});
```

これにより:

- **main/index.ts からは個別モジュールを一切 import しない**（規約）
- **loader.ts もハードコードしない**（規約）
- **新規モジュールはファイルを置くだけ** で登録される
- `register()` を export し忘れると起動時に警告が出る

> electron-vite は main プロセスのバンドルでも `import.meta.glob`（Vite の機能）を解決できる（v2.0+）。

---

## 9. アプリ ID（内蔵・外部）

`src/shared/constants.ts` で定数化する:

```ts
export const APP_IDS = {
  masterDatabase: "master-database",
  seisanBoard:    "seisan-board",
  processMgmt:    "process-management",
  drawingLibrary: "drawing-library",
  pixoConverter:  "pixo-converter",
} as const;

export type AppId = (typeof APP_IDS)[keyof typeof APP_IDS];
```

- **内蔵**: `launcher:openApp` が別ウィンドウを生成
- **外部**: **`pixo-converter`** はポータルに**内蔵**（子プロセスの外部 exe 起動は廃止）。PDF Scope Vault 連携は撤去。

**同じ API 形** で呼べるようにしておくと、将来内蔵化しても呼び出し側の変更が不要。

---

## 10. エラーハンドリング方針

- Handler で `try/catch`、エラーは `{ success: false, error: string }` で返す
- Repository で **業務例外** を `throw new Error("メッセージ")` する（DB 層の例外はそのまま上げる）
- レンダラ側の共通ラッパ `useInvoke` が `success=false` を throw して、ページ側で `try/catch` or ErrorBoundary

```ts
// src/renderer/hooks/useInvoke.ts
export async function invoke<T>(channel: string, data?: unknown): Promise<T> {
  const res = await window.api.invoke(channel, data) as IpcResponse<T>;
  if (!res.success) throw new Error(res.error);
  return res.data;
}
```

---

## 11. ログ方針

フェーズ 1 では最低限:

- メイン側: `console.log` を使ってよいが、**本番（`app.isPackaged`）では抑制**
- DB 構築失敗・ハンドラ例外は常に `console.error` する
- ファイルログはフェーズ 4（監査要件）で検討

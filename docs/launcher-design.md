# ランチャー設計（アプリ別ウィンドウ起動）

ポータルから各アプリを起動するときの **ウィンドウ管理・プロセス管理・セッション共有** を定義する。

---

## 1. 前提

- **内蔵アプリ**: ポータルと **同じメインプロセス**。別 `BrowserWindow` で開く。
- **子プロセス起動アプリ**: ポータルとは **別プロセス**。`child_process.spawn` で既存 exe を起動。
- どちらも「**別タブ（＝別ウィンドウ）で開く**」という要件を満たす。
- 呼び出し側は **同じ API**（`launcher:openApp { appId }`）で起動できる。

---

## 2. 対応アプリ一覧

| appId | 種別 | ファイル／パス | 備考 |
|-------|------|---------------|------|
| `master-database` | 内蔵 | `#/apps/master-database` | マスタ管理画面（フェーズ 2 で実装） |
| `seisan-board` | 内蔵 | `#/apps/seisan-board` | フェーズ 3 |
| `process-management` | 内蔵 | `#/apps/process-management` | フェーズ 3 |
| `drawing-library` | 内蔵（再設計） | `#/apps/drawing-library` | Express 撤去後、フェーズ 3 |
| `pixo-converter` | 内蔵 | `#/apps/pixo-converter` | PDF／画像変換。Poppler（`pdftoppm`）は `resources/tools/poppler-*` または `resources/pixo-converter/bin` |

---

## 3. 内蔵アプリの別ウィンドウ起動

### 3.1 状態管理

```ts
// src/main/modules/launcher/launcher.handler.ts
import type { BrowserWindow as BW } from "electron";

const windows = new Map<AppId, BW>();
```

- **キー**: `appId`
- **値**: 開いている `BrowserWindow` インスタンス
- ウィンドウが閉じられたら `windows.delete(appId)`

### 3.2 起動ロジック

```
launcher:openApp({ appId }) が来る
   │
   ▼
windows.has(appId) ?
   ├─ YES → 既存ウィンドウを focus() → "focused" を返す
   │
   └─ NO  → 新規 BrowserWindow 生成 → loadURL(<base># /apps/<appId>) → "opened" を返す
```

### 3.3 新規ウィンドウの webPreferences

**ポータル本体と完全に同じ** を使う。preload も共有する。

```ts
new BrowserWindow({
  width: 1200,
  height: 800,
  title: APP_LABELS[appId],     // "マスターデータベース" など
  webPreferences: {
    preload: path.join(__dirname, "../preload/index.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
});
```

### 3.4 URL とルーティング

- 開発: `process.env.VITE_DEV_SERVER_URL + "#/apps/" + appId`
- 配布: `file://.../out/renderer/index.html#/apps/<appId>`
- `HashRouter` を使っているので `#` 以降でルート判定できる

React 側の App.tsx で **`/apps/:appId` にルート** を足す:

```tsx
<Route element={<RequireAuth />}>
  <Route path="/apps/:appId" element={<AppShell />} />
</Route>
```

`AppShell.tsx` は `useParams()` で `appId` を取り、該当アプリ画面を描画する。

### 3.5 セッション共有

- **セッションはメインプロセスのメモリにある**（`src/main/session.ts`）。
- 別ウィンドウからでも `auth:session` を invoke すれば **同じセッションが返る** ので、自動的に共有される。
- ただし、別ウィンドウの React は **自分で `useAuth()` してセッションを取得**する必要がある（状態は React コンポーネント内ローカル）。

### 3.6 ライフサイクル

| イベント | 挙動 |
|----------|------|
| ウィンドウを閉じる | `windows.delete(appId)`。そのアプリだけ終了 |
| ポータル本体を閉じる | `window-all-closed` で全ウィンドウを閉じる → アプリ終了 |
| 「ログアウト」 | 全ウィンドウを閉じるのではなく、**各ウィンドウに `auth:sessionChanged` を通知** して `/login` に戻す（※要: フェーズ 2 で IPC push の仕組み追加）|

> フェーズ 1 では子ウィンドウなし（起動は「準備中」トーストのみ）なので、ログアウト通知の仕組みは不要。フェーズ 2 で追加する。

---

## 4. 子プロセス起動アプリ

### 4.1 パス解決

- 設定 `app_settings.apps.<appId>.exePath` に **絶対パス** を保持
- 初期値は空。**管理者が設定画面で登録する**
- 未設定なら `launcher:openApp` は `{ status: "notImplemented" }` + トースト「起動パスが未設定です」

### 4.2 spawn 実装

```ts
import { spawn } from "node:child_process";

function launchExternal(appId: AppId, exePath: string): void {
  const child = spawn(exePath, [], {
    detached: true,   // ポータルを閉じても子は残る／親は待たない
    stdio: "ignore",
  });
  child.unref();      // 親の event loop をブロックしない
  child.on("error", (err) => {
    // メイン側で console.error + 呼び出し元へ error 返却
  });
}
```

### 4.3 子プロセスとの通信（フェーズ 4 で検討）

- 現状は「起動するだけ」。
- 将来的に「ポータルから子にセッショントークンを渡す」なら、
  - A案: 環境変数 `PORTAL_SESSION_TOKEN=xxx` で渡す
  - B案: カスタム URL スキーム（`portal://...`）で引数を渡す
- フェーズ 1〜3 では **子への引き継ぎなし**。子は独自認証のままでよい。

### 4.4 多重起動制御

- 子プロセス PID を `Map<AppId, number>` に保持
- `process.kill(pid, 0)` で生存確認（Windows 向け代替 API が必要な場合 `tasklist` の呼び出し）
- 生きていれば新規 spawn せず、トースト「既に起動しています」を返す
- フェーズ 4 で実装。フェーズ 1〜2 は単純 spawn でよい。

---

## 5. IPC チャネル仕様

[ipc-channels.md](./ipc-channels.md) の `launcher:*` セクション参照。
要点だけ抜粋:

| チャネル | 挙動 |
|---------|------|
| `launcher:openApp` | `appId` を起動。戻り値は `{ status }` |
| `launcher:isOpen`  | 起動中か問い合わせ |
| `launcher:close`   | 起動中のウィンドウを閉じる（内蔵アプリのみ） |

---

## 6. 実装フェーズ

| フェーズ | 内容 |
|---------|------|
| 1 | スケルトン。`launcher:openApp` は **常に `{ status: "notImplemented" }` を返す**。ホームの「開く/起動」ボタンはトースト表示のみ |
| 2 | 内蔵アプリ用の `BrowserWindow` 管理を本実装。マスタ管理画面を 1 つ開けるようにする |
| 3 | 各アプリの内蔵移植に合わせて順次 URL 配線。外部 exe（PixoConverter）の spawn 実装 |
| 4 | 多重起動抑止・子プロセス監視・ログアウト通知 |

---

## 7. 参考コード（スケルトン版、フェーズ 1）

```ts
// src/main/modules/launcher/launcher.handler.ts
import type { IpcMain } from "electron";
import { assertLoggedIn } from "../../auth-guard.js";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("launcher:openApp", async (_, data?: { appId?: string }) => {
    try {
      assertLoggedIn();
      if (!data?.appId) {
        return { success: false as const, error: "appId が必要です" };
      }
      // フェーズ 1: 未実装
      return { success: true as const, data: { status: "notImplemented" as const } };
    } catch (err) {
      return {
        success: false as const,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  });
}
```

---

## 8. 留意点

- **別ウィンドウで開くアプリのサイズ** は画面サイズに対して 80% くらいが使いやすい。フェーズ 2 で決定
- **前面化**（`focus`）で OS によっては無視されることがある。`show()` → `focus()` の順で呼ぶ
- **タイトルバー** は OS デフォルトで十分。将来的に frameless + カスタムタイトルバーは検討可
- **別ウィンドウでも preload からの `invoke` で同じ IPC を使える**（ipcMain 一意なので）

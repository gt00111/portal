# コーディング規約

ユーザー規約（`.cursor/rules` の Coding / Electron / Modular Architecture）を満たすための具体ルール集。

---

## 1. 言語・モジュール

- **TypeScript 必須**（`.ts` / `.tsx`）。プレーンな `.js` は書かない
- **ESM 必須**: `import` / `export` のみ。`require` / `module.exports` 禁止
- `package.json` に `"type": "module"` を設定
- 内部 import は `.js` 拡張子つきで書く（electron-vite が推奨）

```ts
// OK
import { getDb } from "../../db/connection.js";

// NG
import { getDb } from "../../db/connection";         // 拡張子なし
const sqlite3 = require("better-sqlite3");           // require 禁止
```

---

## 2. 非同期

- **async/await を使う**
- **`.then()` は書かない**（既存コードに残っていたら置き換える）

```ts
// OK
const res = await window.api.invoke("auth:login", payload);

// NG
window.api.invoke("auth:login", payload).then(...);
```

---

## 3. 命名

| 対象 | ルール | 例 |
|------|--------|----|
| 変数・関数 | camelCase | `loginName`, `getOperator()` |
| React コンポーネント | PascalCase | `HeroCarousel`, `RequireAuth` |
| 型・インターフェース | PascalCase | `AppOperator`, `IpcResponse<T>` |
| 定数 | UPPER_SNAKE_CASE | `TABLE_NAMES`, `APP_IDS` |
| ファイル | kebab-case or camelCase、React は PascalCase | `auth.handler.ts`, `HeroCarousel.tsx` |
| IPC チャネル | `module:action` の小文字 | `auth:login`, `sku:list` |

---

## 4. 責務・レイヤ（再掲）

| 層 | 置き場 | やってよい | やってはいけない |
|----|--------|-----------|------------------|
| Renderer | `src/renderer/` | UI, `window.api.invoke`, ローカル state | Node API, SQL, fs |
| Preload | `src/preload/` | `contextBridge.exposeInMainWorld("api", { invoke })` のみ | 業務ロジック、便宜関数 |
| Handler | `src/main/modules/*/*.handler.ts` | IPC 受信、入力検証、`try/catch`、`repo` 呼び出し | 生 SQL、UI |
| Repository | `src/main/modules/*/*.repo.ts` | 生 SQL、型付け済みドメインオブジェクトの返却 | IPC、UI、別モジュールの import |
| Shared | `src/shared/` | 型・定数・純粋関数 | 副作用、Node 依存 |

### 4.1 モジュール間 import の禁止

```ts
// NG: 他モジュールの repo を直接使わない
import * as customerRepo from "../customer/customer.repo.js";

// OK: 共通処理は src/shared/ に切り出して import
import { formatIsoDate } from "../../../shared/datetime.js";
```

---

## 5. IPC ハンドラの必須形

```ts
// src/main/modules/foo/foo.handler.ts
import type { IpcMain } from "electron";
import * as fooRepo from "./foo.repo.js";
import { assertLoggedIn, assertCanWrite } from "../../auth-guard.js";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("foo:list", async () => {
    try {
      assertLoggedIn();
      const data = fooRepo.list();
      return { success: true as const, data };
    } catch (err) {
      return {
        success: false as const,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("foo:create", async (_, data?: { name?: string }) => {
    try {
      assertCanWrite();
      const name = data?.name?.trim();
      if (!name) {
        return { success: false as const, error: "name が必要です" };
      }
      const record = fooRepo.create(name);
      return { success: true as const, data: record };
    } catch (err) {
      return {
        success: false as const,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  });
}
```

- **必ず `try/catch`**
- **`success` は `as const`** で型を絞る（`IpcResponse<T>` と合う）
- **UNIQUE 制約エラー** はユーザーフレンドリーに言い換える
  ```ts
  if (msg.includes("UNIQUE")) {
    return { success: false as const, error: "この名前は既に登録されています" };
  }
  ```

---

## 6. Repository のルール

- SQL は **プリペアドステートメント + バインド引数** を使う
- 1 関数 1 クエリを原則。トランザクションは `db.transaction(...)` で囲む
- 戻り値は **ドメイン型（AppOperator, Sku 等）**。`unknown` や `any` を外に出さない

```ts
// OK
const row = db
  .prepare(`SELECT id, name FROM m_customers WHERE id = ?`)
  .get(id) as { id: number; name: string } | undefined;
return row ? { id: row.id, name: row.name } : undefined;

// NG
const row = db.prepare(`SELECT * FROM m_customers WHERE id=${id}`).get(); // 文字列結合
```

---

## 7. エラー処理方針

### 7.1 メイン側

- 想定内のエラー（入力不正、権限不足）→ `throw new Error("日本語メッセージ")`
- 想定外のエラー（DB 死亡など）→ そのまま throw し、Handler の catch で受ける
- `console.error` でログを残す（**本番ビルドでは抑制 or ファイル出力**、詳細は後回し）

### 7.2 レンダラ側

- **`useInvoke` ラッパ** で `success=false` を throw に変換
- ページ側は `try/catch` してトーストで通知

```ts
try {
  const data = await invoke<AppOperator[]>("operator:list");
  setOperators(data);
} catch (err) {
  toast.error(err instanceof Error ? err.message : "読み込みに失敗しました");
}
```

---

## 8. React の書き方

- **関数コンポーネントのみ**（クラスコンポーネント禁止）
- **Hooks は最上位で呼ぶ**（ESLint rules-of-hooks）
- 状態は **最小単位**。親に持ち上げすぎない・子に降ろしすぎない
- **副作用** は `useEffect` のみ。`useLayoutEffect` は必要なときだけ

```tsx
// OK
export function Login() {
  const [loginName, setLoginName] = useState("");
  // ...
}

// NG
class Login extends React.Component { ... }
```

---

## 9. import 順（`.cursor/rules/Coding-Rules.mdc` 準拠）

規約（Coding-Rules）は **3 段** を要求している。空行で 3 ブロックに分ける。

```ts
// 1) external libs（外部パッケージ）
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

// 2) shared（@shared/* エイリアス経由）
import type { IpcResponse } from "@shared/ipcResponse.js";
import { APP_ROLES } from "@shared/auth.js";

// 3) local files（同一レイヤ内。絶対 → 相対 → スタイルの順でも可）
import { useAuth } from "@renderer/hooks/useAuth.js";
import { Button } from "./ui/Button.js";
import styles from "./Login.module.css";
```

### 9.1 絶対 import を使う（規約：Use absolute imports if possible）

- **跨ぎ（shared / main / renderer を跨ぐ）** は必ずエイリアスを使う
- **同一ディレクトリ／兄弟** は `./` 相対でも OK（読みやすさのため）

**path alias 一覧**（`tsconfig.json` と `electron.vite.config.ts` 双方に定義）:

| alias | 対応ディレクトリ | 使える場所 |
|-------|------------------|-----------|
| `@shared/*` | `src/shared/*` | main / preload / renderer すべて |
| `@main/*` | `src/main/*` | main のみ |
| `@renderer/*` | `src/renderer/*` | renderer のみ |

```json
// tsconfig.json（compilerOptions.paths）
{
  "baseUrl": ".",
  "paths": {
    "@shared/*":   ["src/shared/*"],
    "@main/*":     ["src/main/*"],
    "@renderer/*": ["src/renderer/*"]
  }
}
```

```ts
// electron.vite.config.ts（抜粋）
import { resolve } from "node:path";
const alias = {
  "@shared":   resolve(__dirname, "src/shared"),
  "@main":     resolve(__dirname, "src/main"),
  "@renderer": resolve(__dirname, "src/renderer"),
};
export default defineConfig({
  main:     { resolve: { alias } },
  preload:  { resolve: { alias } },
  renderer: { resolve: { alias } },
});
```

### 9.2 やってはいけない例

```ts
// NG: 深い相対 import（shared を超えるのに ../../../）
import { APP_ROLES } from "../../../shared/auth.js";

// NG: main と renderer を相対で繋ぐ（クロスレイヤは禁止）
import { getDb } from "../../main/db/connection.js";
```

---

## 10. コメント

- **何をしているか**（= コードで読めること）は **書かない**
- **なぜそうしたか**（= コードから読めない意図・制約・トレードオフ）だけ書く
- TODO は `// TODO(phase-2): ...` の形で **フェーズ番号を添える**

```ts
// NG
// 客先一覧を取得
const list = repo.list();

// OK
// SQLite のビュー定義に NOCASE が効かない罠があるため、呼び出し側でソートする
list.sort((a, b) => a.name.localeCompare(b.name, "ja"));
```

---

## 11. Tailwind の書き方

- クラスは **意味単位で改行**（長さ 100 目安）
- `className` を動的に合成するときは `cn()` ユーティリティ（`clsx` ベース）を使う

```tsx
import { cn } from "@/lib/cn";

<button
  className={cn(
    "inline-flex items-center justify-center rounded-md px-4 py-2",
    "text-sm font-medium transition-colors",
    variant === "primary" && "bg-accent text-black hover:bg-accentStrong",
    variant === "ghost"   && "border border-border hover:bg-elevated",
    disabled && "opacity-50 cursor-not-allowed"
  )}
>
```

---

## 12. 禁止事項まとめ

| 禁止 | 代替 |
|------|------|
| `require` | `import ... from "..."` |
| `.then(...)` | `await ...` |
| クラスコンポーネント | 関数コンポーネント |
| `document.getElementById` など直接 DOM 操作 | React の ref / state |
| レンダラで `fs` / `path` / `child_process` | メイン側で実行し IPC 経由 |
| preload にビジネスロジック | ハンドラに移す |
| `ipcMain.on` | `ipcMain.handle` |
| 他モジュールの repo 直接 import | shared に切り出す |
| 本番で `console.log` | 必要なら `electron-log` 等に置換（フェーズ 4） |
| 文字列連結で SQL 作成 | プリペアドステートメント + バインド |

---

## 13. Git コミットメッセージ

- 日本語 OK
- 先頭に種別プレフィックス: `feat:` `fix:` `refactor:` `docs:` `chore:`
- 1 コミット 1 トピック（大きくなったら分割）

```
feat: ポータルホームに Hero カルーセルを追加
fix: Bootstrap 画面で DB 選択キャンセル時に遷移しないバグを修正
docs: ipc-channels.md に sku:* を追記
```

---

## 14. プロジェクト独自のコメントアノテーション

| アノテ | 意味 |
|--------|------|
| `// TODO(phase-2): ...` | 将来のフェーズで実装予定 |
| `// FIXME: ...` | バグの可能性あり、要見直し |
| `// NOTE: ...` | 非自明な設計意図・制約 |
| `// HACK: ...` | 暫定対応。後で直す |

---

## 15. ファイル粒度

- 1 ファイル **300 行** を超えたら分割を検討
- React コンポーネントは **1 ファイル 1 コンポーネント** が基本
- 小さな型は同じファイル内でよいが、複数モジュールで使う型は `src/shared/types.ts` に移す

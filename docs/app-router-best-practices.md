# App Router（ルーティング）ベストプラクティス

本書は Electron + React で **react-router-dom v6** を使うときの指針。
開発着手前に必ず読み、実装中も迷ったら立ち返ること。

> 関連: [architecture.md](./architecture.md), [launcher-design.md](./launcher-design.md), [ui-design.md](./ui-design.md), [bootstrap-and-auth.md](./bootstrap-and-auth.md)

---

## 1. ルーターは HashRouter を使う

Electron ではファイルプロトコル（`file://`）で `index.html` を読むため、
**BrowserRouter（`history` API 方式）は動作しない**。

| ルーター | 用途 | Electron 動作 |
|----------|------|---------------|
| **HashRouter** | 配布・開発どちらも OK | ✅ **採用** |
| BrowserRouter | HTTP サーバ前提 | ❌ `file://` で壊れる |
| MemoryRouter | テスト用 | △ 履歴・戻るなし |

```tsx
// src/renderer/main.tsx
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <App />
  </HashRouter>
);
```

> 開発（`http://localhost:5173`）・本番（`file://.../index.html`）どちらでも **`#/path` 形式** で動く。
> `electron-vite` の dev server と配布パッケージ双方でそのまま動作する。

---

## 2. ルート構造（ポータル本体）

### 2.1 全体像

```
/                              → Bootstrap.tsx       (DB 未設定時)
/login                         → Login.tsx
/home                          → Home.tsx            (LP 風ホーム)
/apps/:appId                   → AppShell.tsx        (別ウィンドウで開くアプリ)
/settings                      → Settings.tsx        (フェーズ 2)
*                              → NotFound.tsx
```

### 2.2 App.tsx

```tsx
// src/renderer/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { Bootstrap } from "./routes/Bootstrap.js";
import { Login } from "./routes/Login.js";
import { Home } from "./routes/Home.js";
import { AppShell } from "./routes/AppShell.js";
import { NotFound } from "./routes/NotFound.js";
import { RequireAuth } from "./routes/RequireAuth.js";
import { RequireDb } from "./routes/RequireDb.js";

export function App() {
  return (
    <Routes>
      {/* 1) DB 未設定のとき最初に出る */}
      <Route path="/" element={<Bootstrap />} />

      {/* 2) DB がある前提のルート群 */}
      <Route element={<RequireDb />}>
        <Route path="/login" element={<Login />} />

        <Route element={<RequireAuth />}>
          <Route path="/home" element={<Home />} />
          <Route path="/apps/:appId" element={<AppShell />} />
          {/* フェーズ 2 以降: <Route path="/settings" element={<Settings />} /> */}
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
```

### 2.3 なぜこの形か

- `Bootstrap` は **認証より前** にある（DB がないとログインできないため）
- `RequireDb` は DB 設定の有無をチェックする親ルート（`Outlet` を返す）
- `RequireAuth` はログイン状態をチェックする親ルート（`Outlet` を返す）
- **`/apps/:appId`** はポータルから開く **別ウィンドウ専用** のルート（後述 §6）

---

## 3. 認証ガード（RequireAuth / RequireDb）

### 3.1 パターン: 親ルート + Outlet

```tsx
// src/renderer/routes/RequireAuth.tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { ForcePasswordChangeModal } from "../components/ForcePasswordChangeModal.js";

export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;                 // ローディング（または <Splash />）
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return (
    <>
      <Outlet />
      {session.mustChangePassword && <ForcePasswordChangeModal />}
    </>
  );
}
```

### 3.2 パターン: DB ガード

```tsx
// src/renderer/routes/RequireDb.tsx
import { Navigate, Outlet } from "react-router-dom";
import { useSettings } from "../hooks/useSettings.js";

export function RequireDb() {
  const { settings, loading } = useSettings();
  if (loading) return null;
  if (!settings?.databasePath) return <Navigate to="/" replace />;
  return <Outlet />;
}
```

### 3.3 なぜ親ルートに置くのか

- 個々のページで毎回認証チェックを書かなくてよい
- **Outlet で子ルートを描画** するので、共通レイアウトも同じ場所で適用可能
- `Navigate replace` を使うと **ブラウザ履歴に残らない**（戻るボタンで再ループしない）

---

## 4. ナビゲーション

### 4.1 宣言的遷移（`Link`）

```tsx
import { Link } from "react-router-dom";
<Link to="/home" className="text-accent hover:underline">ホームへ</Link>
```

### 4.2 プログラム的遷移（`useNavigate`）

```tsx
import { useNavigate } from "react-router-dom";
const navigate = useNavigate();
await invoke("auth:login", { loginName, password });
navigate("/home", { replace: true });
```

- **ログイン成功・ログアウト** など「戻るで戻ってほしくない」遷移は **`replace: true`**

### 4.3 「ログイン前に見ていた画面」に戻す

```tsx
// Login.tsx
const location = useLocation();
const from = (location.state as { from?: Location })?.from?.pathname ?? "/home";
navigate(from, { replace: true });
```

---

## 5. アンカーリンクと HashRouter の共存

### 5.1 ポータルのホームは `#/home` 上で **セクション間スクロール** する

HashRouter が `#/home` を使うため、**ブラウザ標準の `<a href="#section-id">` は動かない**（ルーティングと衝突）。

**対策**: `scrollIntoView` を使ったスムーズスクロールに統一する。

```tsx
// src/renderer/components/Navbar.tsx（概念）
function onScrollTo(sectionId: string) {
  const el = document.getElementById(sectionId);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}
```

```tsx
// セクション側
<section id="app-seisan-board" className="scroll-mt-[72px]">...</section>
```

- `scroll-mt-[72px]`（または `scroll-margin-top: 72px`）で **navbar 分のオフセット** を確保
- URL のハッシュは触らない（`window.location.hash` は HashRouter の管轄）

### 5.2 許可される ID 命名

`app-<appId>`（例: `app-seisan-board`）を採用。理由:
- React Router の `/apps/:appId` ルートと混同しない
- CSS セレクタで書きやすい

---

## 6. マルチウィンドウとルーティング

### 6.1 別ウィンドウは同じ `index.html` を別パスで読む

[launcher-design.md](./launcher-design.md) に従い、内蔵アプリは **新規 `BrowserWindow`** で
`#/apps/<appId>` を `loadURL` する。

```
ポータル本体の window  → #/home
子ウィンドウ            → #/apps/seisan-board
子ウィンドウ            → #/apps/master-database
```

**全ウィンドウは同じ React バンドルを共有** し、`AppShell` コンポーネントが `appId` で描画を振り分ける。

```tsx
// src/renderer/routes/AppShell.tsx
import { useParams } from "react-router-dom";
import { NotFound } from "./NotFound.js";

// フェーズ 2 以降で中身が増える
const REGISTRY: Record<string, React.ComponentType> = {
  // "master-database": MasterDatabasePage,
  // "seisan-board":    SeisanBoardPage,
};

export function AppShell() {
  const { appId } = useParams();
  const Page = appId && REGISTRY[appId];
  if (!Page) return <NotFound />;
  return <Page />;
}
```

### 6.2 ウィンドウ間で Route 状態は共有しない

- 各ウィンドウは独立した React ツリー → **`useNavigate` は自ウィンドウ内にしか効かない**
- ウィンドウ間連携は **必ずメインプロセス経由**（IPC）

### 6.3 起動 URL の組み立て（メイン側）

```ts
// src/main/modules/launcher/launcher.handler.ts
const base = process.env.VITE_DEV_SERVER_URL
  ?? `file://${path.join(__dirname, "../renderer/index.html")}`;
const url = `${base}#/apps/${appId}`;
win.loadURL(url);
```

- 開発: `http://localhost:5173#/apps/seisan-board`
- 配布: `file://.../index.html#/apps/seisan-board`

---

## 6.5 ルート = サイドエフェクトの起点

「そのページを表示するためのデータ取得」はページコンポーネントの `useEffect` で行う。
**グローバル状態やルーター外での fetch は避ける**。

```tsx
// routes/Home.tsx
export function Home() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    invoke<AppSettings>("settings:get").then(setSettings);
  }, []);
  // ...
}
```

将来的に重くなったら **react-router の `loader` / `useLoaderData`** への移行を検討（ただし `createHashRouter` 版が必要）。

---

## 7. URL パラメータ・クエリ

### 7.1 パスパラメータ

```tsx
<Route path="/apps/:appId" element={<AppShell />} />
```

```tsx
const { appId } = useParams<{ appId: string }>();
```

### 7.2 クエリパラメータ

```tsx
import { useSearchParams } from "react-router-dom";
const [sp, setSp] = useSearchParams();
const page = Number(sp.get("page") ?? "1");

// 更新
setSp((prev) => {
  prev.set("page", "2");
  return prev;
});
```

- **ページング・検索語・ソート順** は URL に入れると戻る・リロードで復元できる
- ただし Electron は基本的にリロードしないので、**デスクトップ体験としては React state で十分** なことが多い。必要なときだけ採用

### 7.3 `navigate(..., { state })`

- シリアライズ可能な値だけ渡す
- 戻ったときに `useLocation().state` で拾う
- **リロード耐性はない**（state はメモリ）ので「一時的なヒント」用途に限定

---

## 8. コード分割（Lazy / Suspense）

内蔵アプリが増えてきたら、**アプリ単位でバンドル分割** する。

```tsx
import { lazy, Suspense } from "react";

const SeisanBoardPage = lazy(() => import("./apps/SeisanBoardPage.js"));

<Route path="/apps/seisan-board" element={
  <Suspense fallback={<Splash />}>
    <SeisanBoardPage />
  </Suspense>
} />
```

- フェーズ 1 はやらなくてよい（画面が少ない）
- フェーズ 3 以降で各アプリが重くなってきたら導入

---

## 9. NotFound（404 相当）

```tsx
<Route path="*" element={<NotFound />} />
```

- 必ず **ルート定義の末尾** に置く
- 「ホームに戻る」ボタンを用意

---

## 10. アンチパターン

| 🚫 やってはいけない | 理由 |
|---|---|
| `BrowserRouter` を使う | `file://` で動かない |
| `<a href="...">` で内部遷移 | ページ全体リロードが起き、ログイン状態などが飛ぶ |
| `<a href="#section">` でアンカー遷移 | HashRouter と競合する。`scrollIntoView` を使う |
| 認証チェックを各ページで `useEffect` で書く | 冗長。**親ルート + RequireAuth** に集約 |
| `navigate` を `useEffect` 内で無条件に呼ぶ | 無限ループの温床。条件 + `replace: true` を徹底 |
| Route 定義で `Navigate` を無条件 fall-through | ログイン画面に戻れなくなる。**ガードは親ルート** |
| 複数ウィンドウで React の状態を直接共有しようとする | 各ウィンドウは独立。**IPC 経由でメインを介す** |
| `location.href = "#/home"` のように手書き | React Router の履歴と競合。`useNavigate` を使う |
| Route の `path` に大文字を入れる | URL は小文字統一（`/apps/seisan-board`） |

---

## 11. 命名ルール

| 対象 | ルール | 例 |
|------|--------|----|
| path | **kebab-case** | `/apps/seisan-board` |
| コンポーネント | PascalCase | `AppShell`, `RequireAuth` |
| セクション id | `app-<kebab>` | `app-master-database` |
| Route ファイル | `routes/<Name>.tsx` | `routes/Home.tsx` |
| アプリ別 Route | `routes/apps/<Name>.tsx` | `routes/apps/SeisanBoardPage.tsx` |

---

## 12. フェーズ別の実装目安

| フェーズ | Route で実装するもの |
|---------|---------------------|
| 1 | `/`, `/login`, `/home`, `/apps/:appId`（stub）, `*` / `RequireDb` + `RequireAuth` |
| 2 | `/settings`, `/settings/*`, `/apps/master-database` 本実装 |
| 3 | `/apps/seisan-board`, `/apps/process-management`, `/apps/drawing-library` |
| 4 | lazy import 導入、`loader` ベースへの移行検討 |

---

## 13. チェックリスト（フェーズ 1 で満たす）

- [ ] `HashRouter` で包んでいる
- [ ] `Routes`/`Route` がネストされ、`RequireDb` / `RequireAuth` が親ルートにある
- [ ] `Navigate` は必ず `replace` で呼ぶ（未ログイン時のリダイレクト含む）
- [ ] navbar の「アンカー」は `scrollIntoView` を使う（`<a href="#...">` は使わない）
- [ ] `useNavigate` を使って `/login ↔ /home` を往復できる
- [ ] `/apps/:appId` で `AppShell` が `useParams` を読み取り、未知の ID は NotFound
- [ ] リロード後もルートが維持される（HashRouter なので OK）
- [ ] ウィンドウを閉じて再起動後、Bootstrap → Login → Home の順に **自動再入場** できる（DB パスと session の挙動）

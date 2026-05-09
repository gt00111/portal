# UI デザイン仕様

ポータル本体（フェーズ 1）の UI を決める。**落ち着いた業務向け + LP 風の軽いアニメーション** が狙い。

技術: Tailwind CSS + framer-motion + lucide-react。

---

## 1. 画面構成

```
/                 → Bootstrap.tsx   (初回 / DB 未設定時)
/login            → Login.tsx       (ログイン)
/home             → Home.tsx        (ログイン後の LP 風ホーム) ★「顔」
/apps/<appId>     → 各アプリ        (フェーズ 2 以降。別ウィンドウで開く)
```

ルーティング: **HashRouter**（Electron で `file://` パス問題を避けるため）。

---

## 2. カラーテーマ

CSS 変数 + Tailwind の `theme.extend.colors` で管理。

### 2.1 ベース（ダーク基調 + アクセント）

```css
/* src/renderer/styles/globals.css */
:root {
  /* 背景 */
  --bg-base:     #0b1120;   /* slate-950 相当 */
  --bg-surface:  #121a2e;   /* slate-900 */
  --bg-elevated: #1a2440;   /* slate-800 */

  /* 前景 */
  --fg-primary:   #e5edff;  /* slate-100 近似 */
  --fg-secondary: #a5b4cf;  /* slate-300 */
  --fg-muted:     #64748b;  /* slate-500 */

  /* アクセント */
  --accent:        #38bdf8; /* sky-400 */
  --accent-strong: #0284c7; /* sky-600 */

  /* 状態 */
  --success: #10b981; /* emerald-500 */
  --warning: #f59e0b; /* amber-500 */
  --danger:  #ef4444; /* red-500 */

  /* 枠線 */
  --border: #26334d;

  /* カード影 */
  --shadow-card: 0 6px 20px rgba(0,0,0,0.35);
}
```

### 2.2 Tailwind 拡張

```ts
// tailwind.config.ts（抜粋）
export default {
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        base:     "var(--bg-base)",
        surface:  "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        fg:       "var(--fg-primary)",
        fgDim:    "var(--fg-secondary)",
        muted:    "var(--fg-muted)",
        accent:   "var(--accent)",
        accentStrong: "var(--accent-strong)",
        border: "var(--border)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
      fontFamily: {
        sans: ['"Inter"', '"Noto Sans JP"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
```

### 2.3 タイポ

| 用途 | Tailwind |
|------|----------|
| 見出し H1 | `text-4xl md:text-5xl font-bold tracking-tight` |
| 見出し H2 | `text-2xl md:text-3xl font-semibold` |
| 見出し H3 | `text-xl font-semibold` |
| 本文 | `text-base leading-relaxed` |
| 補助 | `text-sm text-fgDim` |

日本語は `Noto Sans JP`、英数は `Inter` を優先。

---

## 3. レイアウト（共通）

```
┌──────────────────────────────┐ ← position: sticky; top:0; 高さ 64px
│ Navbar                       │
├──────────────────────────────┤
│                              │
│   Page Content (scroll)      │
│                              │
├──────────────────────────────┤ ← Footer（必要なら）
└──────────────────────────────┘
```

- ポータル本体は **単一の縦スクロール**
- `overflow-y-auto` は main 要素に付ける（navbar は固定）

---

## 4. Navbar

### 4.1 仕様

- 左端: **会社ロゴ（未確定）** + 会社名（`app_settings.company.name`、既定 `__COMPANY__`）
- 中央: 空き（将来検索・通知などに使う）
- 右側:
  - アプリ名アンカーリンク（`#master-database`, `#seisan-board`, ... ）
  - 表示名（自分）＋ロール（ドロップダウンで「パスワード変更」「ログアウト」）

### 4.2 アンカーリンク挙動

- クリックで該当セクションまで **スムーズスクロール**
- `scroll-margin-top` を Navbar 高さぶん確保

```css
section[id] {
  scroll-margin-top: 72px; /* navbar 64px + 余白 8px */
}
```

- URL ハッシュが変わる（`#seisan-board`）。HashRouter と併存するので、**アンカー部分は window.location.hash を直接書き換える** のではなく **React の scrollIntoView を使う** 方が安全。

### 4.3 実装案

```tsx
// src/renderer/components/Navbar.tsx
import { motion } from "framer-motion";
const apps = [
  { id: "master-database", label: "マスタ" },
  { id: "seisan-board",    label: "生産ボード" },
  { id: "process-management", label: "工程管理" },
  { id: "drawing-library", label: "図面庫" },
  { id: "pixo-converter",  label: "変換ツール" },
];

export function Navbar({ companyName, userName, role, onLogout, onScrollTo }: Props) {
  return (
    <header className="sticky top-0 z-40 h-16 bg-surface/80 backdrop-blur border-b border-border">
      <div className="h-full mx-auto max-w-7xl px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-md bg-accent/20 border border-accent/40" />
          <span className="font-semibold">{companyName}</span>
        </div>
        <nav className="hidden md:flex items-center gap-4">
          {apps.map((a) => (
            <button
              key={a.id}
              onClick={() => onScrollTo(a.id)}
              className="text-sm text-fgDim hover:text-fg transition-colors"
            >
              {a.label}
            </button>
          ))}
        </nav>
        <UserMenu userName={userName} role={role} onLogout={onLogout} />
      </div>
    </header>
  );
}
```

---

## 5. Hero セクション（メリーゴーラウンド）

### 5.1 要件（ユーザー指示）

- 会社のモットー 3 件を **メリーゴーラウンド（回転）風** に順送り表示
- モットーは `app_settings.motto_1/2/3`。**差し替え可能**
- 会社名・ポータル名を中央に配置

### 5.2 見え方

3 枚のカード（モットー）が **円周上を回転** する。中央には常に大きく 1 枚がハイライト表示、両脇に小さく 2 枚が見える。一定間隔（例 3.5 秒）で回転。

```
       ┌────────┐
       │ 品質第二│   （中央 = active）
       └────────┘
   ┌──┐      ┌──┐
   │安│      │生│   （左右 = サイド）
   │全│      │産│
   │第│      │第│
   │一│      │三│
   └──┘      └──┘
```

### 5.3 実装案（簡易版）

framer-motion の `AnimatePresence` と `rotate` プロパティで 360° を 3 等分（`0° / 120° / 240°`）して active index を進める。
ラベルは `text-5xl md:text-6xl font-bold` で大きく。

```tsx
// 概念だけ
const mottos = [motto1, motto2, motto3];
const [idx, setIdx] = useState(0);
useEffect(() => {
  const t = setInterval(() => setIdx((i) => (i + 1) % 3), 3500);
  return () => clearInterval(t);
}, []);

// カード i の表示位置（active=0 のとき index i の角度）
function angleOf(i: number, idx: number) {
  const diff = (i - idx + 3) % 3; // 0 / 1 / 2
  return [0, -120, 120][diff];    // 中央 / 左 / 右
}
```

**アニメーション**: framer-motion の `motion.div` に `animate={{ rotate, x, scale, opacity }}`、`transition={{ duration: 0.8, ease: "easeInOut" }}` を設定。

### 5.4 中央テキスト

```
    [会社名]              ← text-sm text-fgDim
  [ポータル名]            ← text-3xl md:text-4xl font-bold
  ─────────────
   [中央モットー]          ← カルーセルで差し替わる
```

Hero の高さは `h-[60vh]` 程度を目安に。背景は `bg-gradient-to-b from-base via-surface to-base`。

---

## 6. アプリセクション

各アプリ 1 セクション（id は `app-<appId>`）。

```
┌──────────────────────────────────────────────┐
│  [icon]  アプリ名                             │
│          1 行説明                             │
│                                              │
│  ┌──────────────┐   機能サマリ（箇条書き）    │
│  │ preview img  │   ・機能 1                  │
│  │              │   ・機能 2                  │
│  └──────────────┘   ・機能 3                  │
│                                              │
│                         [開く] or [起動]       │
└──────────────────────────────────────────────┘
```

- 画像は `public/app-preview/<appId>.png`（暫定プレースホルダ）
- **whileInView** でフェードイン

```tsx
<motion.section
  id={`app-${appId}`}
  initial={{ opacity: 0, y: 24 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-100px" }}
  transition={{ duration: 0.6 }}
  className="py-16 border-b border-border"
>
  {/* ... */}
</motion.section>
```

### 6.1 ボタンのラベル

| 種別 | ラベル | 挙動 |
|------|-------|------|
| 内蔵 | **開く** | `launcher:openApp` → 別ウィンドウ |
| 子プロセス | **起動** | `launcher:openApp` → `spawn` |
| 未実装 | **準備中** | disabled、トースト「まだ準備中です」 |

---

## 7. ログイン画面

- 中央 1 枚のカード。幅 `max-w-md`、背景 `bg-elevated`、角丸 `rounded-xl`、シャドウ
- 入力: ログイン名 / パスワード
- **初回は admin / admin でログインできます** を下に小さく表示（`bootstrapped === false` のときのみ）
- **DB を選択 / 新規作成** リンクをさらに下に小さく
- エラーは入力欄の下に `text-danger`

---

## 8. 初期セットアップ画面（`/`）

- タイトル: 「ポータルをセットアップ」
- カード 2 枚（水平または縦並び）:
  - **新規 DB を作成** → `settings:createNewDatabase`
  - **既存の DB を開く** → `settings:pickExistingDatabase`
- 選択後は内部で必要テーブルが作成され、`admin` が seed されて `/login` に遷移

---

## 9. 強制パスワード変更モーダル

- `mustChangePassword === true` のときログイン成功後に **モーダルを前面** に出す
- キャンセル不可（バツなし、背景クリック無効）
- フォーム: 現在のパスワード / 新しいパスワード / 新パスワード再入力
- 成功時にモーダル閉じて `/home`

---

## 10. 共通 UI コンポーネント（最小セット）

`src/renderer/components/ui/` に置く。

| コンポーネント | 役割 | props（抜粋） |
|----------------|------|--------------|
| `Button` | ボタン | `variant: "primary" \| "ghost" \| "danger"`, `size: "sm" \| "md"`, `disabled`, `loading` |
| `Card` | カード | `padding`, `className` |
| `Input` | 単行入力 | `label`, `error`, `type` |
| `Field` | ラベル＋入力＋エラーのセット | children 使用 |
| `Modal` | モーダルダイアログ | `open`, `onClose`, `title`, `closeOnBackdrop` |
| `Toast` / `ToastContainer` | 通知 | `useToast()` フック経由 |
| `Spinner` | ローディング | `size` |

### ボタンの基本スタイル

```
primary  bg-accent text-black hover:bg-accentStrong
ghost    bg-transparent border border-border hover:bg-elevated
danger   bg-danger text-white hover:opacity-90
```

---

## 11. アニメーション基準

| シーン | 実装 |
|--------|------|
| ページ/セクションのフェードイン | `initial={{opacity:0,y:16}}`, `animate/whileInView={{opacity:1,y:0}}`, `duration:0.5` |
| Hero カルーセル回転 | `rotate` + `scale` + `opacity`, `duration:0.8 easeInOut` |
| モーダルのイン/アウト | `scale:[0.96→1]`, `opacity:[0→1]`, `duration:0.2` |
| トースト | `y:[20→0]`, `opacity:[0→1]`, `duration:0.25` |

勢いを出しすぎない（業務アプリなので 0.2〜0.8 秒）。

---

## 12. アクセシビリティ最低線

- 文字コントラスト比は 4.5:1 以上
- ボタンは `aria-label` と `title`
- Navbar のアンカーはキーボード操作可
- モーダルはフォーカストラップ＋`Esc` 閉じ（強制パスワード変更は `Esc` 無効）

---

## 13. 画像・アイコン

- ロゴ画像: `public/portal-icon.ico` + `public/portal-logo.svg`（暫定）
- アプリプレビュー: `public/app-preview/<appId>.png`（後回し可。最初は **CSS のグラデーションカード**で代替）
- アイコンは `lucide-react`

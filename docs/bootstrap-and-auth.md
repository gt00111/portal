# 認証・初期化フロー（鶏と卵対策）

ポータル起動から **ログイン確立** までの挙動を、状態遷移として定義する。

---

## 0. 採用パターンの宣言

本ポータルは **Pattern B: Default Admin Account** を採用する（初回起動で admin を seed し、強制パスワード変更で運用開始）。

| 要件 | 実装 |
|------|------|
| デフォルト管理者の存在 | `app_operators` 件数 0 かつ `app_settings.portal.bootstrapped` 未設定のとき `admin/admin` を自動 seed |
| 初回ログイン時のパスワード強制変更 | `mustChangePassword = 1` で seed → 初回ログイン後にモーダルで変更要求、完了までアクセス遮断 |
| DB が未設定の初期状態 | ログイン前に Bootstrap 画面で DB 新規作成 or 既存選択（「Configure data source BEFORE login」要件） |
| 最後の admin 保護 | `countActiveAdmins() <= 1` のとき無効化・降格を拒否 |
| 権限の backend 強制 | `auth-guard.ts` の `assertLoggedIn / assertCanWrite / assertAdmin` を各 handler の先頭で呼ぶ |
| clean install 後に必ず到達可能 | Bootstrap → Login → ForceChange → Home の一本道が DB 削除後でも再現する |

---

## 1. ステートマシン

```
       [起動]
          │
          ▼
   ┌──────────────────┐
   │ 1. DbPathUnknown │  (config JSON に DB パスが無い / ファイルが存在しない)
   └──────────────────┘
          │   settings:createNewDatabase / settings:pickExistingDatabase
          ▼
   ┌──────────────────┐
   │ 2. DbConnected    │  (better-sqlite3 でオープン済み。テーブルは自動作成)
   └──────────────────┘
          │   migrate() → 全テーブル作成・schema_meta 更新
          ▼
   ┌────────────────────────┐
   │ 3. MigrationComplete   │
   └────────────────────────┘
          │   auth:bootstrapStatus
          │
   ┌──────┴────────────────────────────────────────────┐
   │                                                   │
   │  app_operators 件数 = 0                            │ app_operators 件数 >= 1
   │  かつ app_settings.portal.bootstrapped が未設定      │
   │                                                   │
   ▼                                                   ▼
   ┌──────────────────────┐              ┌──────────────────────┐
   │ 4a. SeedAdmin         │              │ 4b. ReadyForLogin     │
   │     admin/admin を    │              │                        │
   │     INSERT, must=1    │              └──────────────────────┘
   │     bootstrapped='1'  │                        │
   └──────────────────────┘                        │
          │                                          │
          ▼                                          │
   ┌──────────────────────┐                        │
   │ 4c. ReadyForLogin     │ ◄──────────────────────┘
   │  （初回案内を表示）    │
   └──────────────────────┘
          │   auth:login (loginName, password)
          ▼
   ┌──────────────────────┐
   │ 5. LoggedIn           │
   └──────────────────────┘
          │
   ┌──────┴──────────────────────┐
   │ session.mustChangePassword   │
   │   true  → 強制パスワード変更  │
   │   false → ホーム              │
   └───────────────────────────────┘
          │
          ▼  auth:changePassword (成功)
   ┌──────────────────────┐
   │ 6. SessionReady       │
   └──────────────────────┘
          │
          ▼  /home
```

---

## 2. 各ステートの UI

| ステート | 画面 | ユーザー操作 |
|----------|------|-------------|
| 1. DbPathUnknown | `/`（`Bootstrap.tsx`） | 「新規 DB 作成」「既存 DB を開く」 |
| 4a / 4b. ReadyForLogin | `/login` | ログイン名・パスワード入力 |
| 5. LoggedIn & must=true | モーダル（`ForcePasswordChangeModal.tsx`） | 現パス + 新パス + 再入力 |
| 6. SessionReady | `/home` | ポータルホーム |

---

## 3. 起動時の具体フロー（メイン側）

```ts
// src/main/index.ts の擬似コード
app.whenReady().then(() => {
  loadModules();
  const win = createPortalWindow();

  // window は先に表示する。中で React が settings:get → auth:session → ...
  // を呼び出し、状態に応じて遷移する。

  // メイン側では何もしない（レンダラ駆動）
});
```

- **DB 接続は遅延**: `getDb()` 初回呼び出し時に開く（`settings:get` 等が呼ばれたとき）
- DB パスが未設定でも **レンダラは Bootstrap 画面を出せる**（`settings:get` は DB を開かず config JSON だけ見る）

---

## 4. レンダラ側の初期化

```tsx
// src/renderer/App.tsx（概念）
function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const { session, loading } = useAuth();

  useEffect(() => {
    invoke<AppSettings>("settings:get").then(setSettings);
  }, []);

  if (!settings || loading) return <Splash />;

  if (!settings.databasePath) return <Bootstrap onDone={(s) => setSettings(s)} />;
  if (!session)              return <Login settings={settings} />;
  if (session.mustChangePassword) return <ForcePasswordChangeModal onDone={refresh} />;
  return <Home settings={settings} session={session} />;
}
```

---

## 5. admin/admin の seed 条件

**【必須】** 以下 **両方** を満たすときのみ seed する:

1. `SELECT COUNT(*) FROM app_operators` === 0
2. `SELECT value FROM app_settings WHERE key = 'portal.bootstrapped'` が未設定 or NULL

seed 後:

1. `INSERT INTO app_operators (loginName, passwordHash, displayName, role, isActive, mustChangePassword)
     VALUES ('admin', <hash('admin')>, '管理者（初期）', 'admin', 1, 1)`
2. `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('portal.bootstrapped', '1')`

これにより、**ユーザーが admin を削除しても再 seed は起きない**（`bootstrapped='1'` が残るため）。
もし「すべてのアカウントを失って詰んだ」場合は、**管理者が SQL で直接 `bootstrapped` を削除** するか、
**別途リカバリスクリプト**（既存 master-database の `repair-admin` 相当）を用意する。

---

## 6. 強制パスワード変更

### 6.1 トリガ

- `auth:login` 成功時、レスポンスに `mustChangePassword: boolean` を含める
- `true` のときはレンダラ側で **モーダルを表示**
- モーダルを閉じる手段は **パスワード変更に成功すること** だけ（キャンセル不可）

### 6.2 `auth:changePassword`

Request:
```ts
{ currentPassword: string; newPassword: string }
```

Response（成功）:
```ts
{ success: true, data: AuthSession /* must=false に更新済み */ }
```

ロジック:
1. セッションから `operatorId` を取得
2. `app_operators` を SELECT し `verifyPassword(currentPassword, stored)` で照合
3. **新パスワードのバリデーション**
   - 8 文字以上
   - 現パスワードと異なる
   - `'admin'` と完全一致でない（デフォルトに戻せない）
4. `UPDATE app_operators SET passwordHash = ?, mustChangePassword = 0, updatedAt = datetime('now') WHERE id = ?`
5. セッションを更新（`mustChangePassword = false`）

---

## 7. パスワードハッシュ

既存 master-database と同じ方式:

```ts
// scrypt: "<saltHex>:<hashHex>"
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const hash = scryptSync(password, salt, expected.length);
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
```

---

## 8. 権限ガード

`src/main/auth-guard.ts`:

```ts
export function assertLoggedIn(): void {
  if (!getSession()) throw new Error("ログインが必要です");
}
export function assertCanWrite(): void {
  assertLoggedIn();
  const s = getSession()!;
  if (s.role !== "editor" && s.role !== "admin") {
    throw new Error("この操作を行う権限がありません（閲覧のみ）");
  }
}
export function assertAdmin(): void {
  assertLoggedIn();
  if (getSession()!.role !== "admin") throw new Error("管理者のみ実行できます");
}
```

各 Handler の先頭で該当するものを呼ぶ。

---

## 9. セッション破棄イベント

| 契機 | 挙動 |
|------|------|
| `auth:logout` | `session = null`。レンダラは `/login` へ |
| `settings:createNewDatabase` / `settings:pickExistingDatabase` | DB を閉じる → 再初期化 → `session = null` → レンダラに「再ログインしてください」通知 |
| アプリ終了 | メモリごと消える |

---

## 10. 最後の管理者保護

| 状況 | 挙動 |
|------|------|
| `operator:setActive(admin, false)` で **最後の有効管理者** を無効化しようとした | `throw new Error("有効な管理者は少なくとも1人必要です...")` |
| `operator:updateRole(admin, editor/viewer)` で **最後の管理者を降格** | 同上でエラー |

既存 master-database の `countActiveAdmins()` ロジックをそのまま流用する。

---

## 11. フェーズ別に実装すること

| フェーズ | 実装 |
|---------|------|
| 1 | 1〜6 の全フロー（`auth:login/logout/session/changePassword/bootstrapStatus`, `settings:get/pickExistingDatabase/createNewDatabase`） |
| 2 | `operator:*` 本実装・「リセットパスワード」 |
| 3 | 各アプリ画面への **`RequireAuth`** 適用 |
| 4 | セッションタイムアウト、監査ログ、リカバリスクリプト |

---

## 12. テスト観点

手動でよいのでフェーズ 1 完了時に確認:

- [ ] DB を削除 → 起動 → Bootstrap 画面が出る
- [ ] 新規 DB 作成 → `/login` に遷移
- [ ] `admin/admin` でログインできる
- [ ] 強制パスワード変更モーダルが出る
- [ ] `admin` を新パスワードに変更できる
- [ ] 再起動してもパスワード変更後のもので入れる
- [ ] DB を削除して再起動 → 再び admin/admin で入れる（bootstrapped は新 DB にはない）
- [ ] 既存 DB を選択しなおしてログインできる
- [ ] ログアウト → `/login` に戻る
- [ ] 未ログインで `auth:session` 以外の IPC を呼ぶとエラーで弾かれる

# データベーススキーマ（中央 DB）

- **ファイル名**: `portal-master.db`
- **既定保存先**: `%APPDATA%\portal\portal-master.db`（Windows）
- **エンジン**: SQLite（`better-sqlite3`）
- **PRAGMA**: `foreign_keys = ON`
- **文字列比較**: 可能な限り `COLLATE NOCASE`

> サテライト DB（各アプリ固有）は各アプリフェーズで別途設計する。本書は **中央 DB に限定**。

### 実装との関係（当面の進め方）

- **実行時の正** は `src/main/db/schema.ts` の DDL と `migrate.ts`（`schema_meta.version`）である。
- 本書は設計メモとして残す。**本書とコードが食い違う場合はコードを優先**し、確定したら本書を追随してよい。
- 列・インデックスの見直しが必要になったら、`version` を上げるマイグレーションで追加・変更する（後方互換を気にしすぎず、開発フェーズでは **「いったんこの形で進める」→ 必要に応じて改訂** でよい）。

---

## 1. テーブル一覧

| カテゴリ | テーブル | 主な役割 |
|----------|----------|---------|
| システム | `schema_meta` | スキーマバージョン管理 |
| システム | `app_settings` | DB パス以外の設定（会社名、モットー等） |
| 認証 | `app_operators` | ログインアカウント |
| 認証（将来） | `app_operator_app_grants` | アプリ別利用権限（フェーズ 4） |
| マスタ | `m_customers` | 客先 |
| マスタ | `m_models` | 機種 |
| マスタ | `m_part_numbers` | 品番 |
| マスタ | `m_component_names` | 部品名称 |
| マスタ | `m_group_names` | グループ名 |
| マスタ | `m_user_names` | 業務上のユーザー名（ログインアカウントとは別） |
| 関係 | `m_skus` | 客先 × 機種 × 品番 × 部品名称 × 図面番号 × Rev の組み合わせ |

---

## 2. 共通列（マスタテーブル）

すべてのマスタテーブル（`m_customers` 〜 `m_user_names`）で以下の列を持つ:

| 列 | 型 | 制約 | 説明 |
|----|----|------|------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 主キー |
| `name` | TEXT | NOT NULL | 名称 |
| `isActive` | INTEGER | NOT NULL DEFAULT 1 | 1=有効／0=使用不可 |
| `inactiveSource` | TEXT | NULL | `NULL` / `'user'`（手動無効）。**親子連鎖はない**（flat のため） |
| `createdAt` | TEXT | DEFAULT (datetime('now')) | 作成日時 |
| `updatedAt` | TEXT | DEFAULT (datetime('now')) | 更新日時 |

各マスタには以下のインデックスを張る:

```sql
-- 1) 名前で検索するための通常インデックス
CREATE INDEX IF NOT EXISTS idx_<table>_name ON <table>(name);

-- 2) 有効行同士で名前の重複を禁止する部分 UNIQUE（NOCASE）
CREATE UNIQUE INDEX IF NOT EXISTS uq_<table>_name_active
  ON <table>(name COLLATE NOCASE) WHERE isActive = 1;
```

> 旧 master-database にあった `inactiveSource = 'parent'` は **階層 FK を廃止したため不要**。
> ただし将来の「アプリ別に親子関係を持ちたい」要求のために列自体は残し、`NULL` / `'user'` の 2 値で運用する。

---

## 3. システムテーブル

### 3.1 `schema_meta`

スキーマのバージョンを持つ。マイグレーション実行時に `version` を上げる。

```sql
CREATE TABLE IF NOT EXISTS schema_meta (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  version   INTEGER NOT NULL,
  updatedAt TEXT    DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_meta (id, version) VALUES (1, 1);
```

### 3.2 `app_settings`

key/value ストア。DB パス以外の「運用で変わる値」を集約。
フェーズ 1 で使う key を最小限で書いておく。

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key       TEXT PRIMARY KEY,
  value     TEXT,
  updatedAt TEXT DEFAULT (datetime('now'))
);
```

**初期値（seed）**:

| key | 初期値 | 説明 |
|-----|--------|------|
| `portal.bootstrapped` | （未設定） | 初期 admin を seed したら `'1'` |
| `company.name` | `__COMPANY__` | Hero の会社名 |
| `portal.name` | `社内ポータル` | ポータル名 |
| `company.motto_1` | `安全第一` | Hero カルーセル #1 |
| `company.motto_2` | `品質第二` | Hero カルーセル #2 |
| `company.motto_3` | `生産第三` | Hero カルーセル #3 |

> **DB ファイルパス自体はここではなく `userData` 配下の JSON で保持**（既存 master-database と同じ）。
> これは「DB を開かなくても DB パスを知っていないといけない」ため。

---

## 4. 認証テーブル

### 4.1 `app_operators`

実装の単一の正は `src/main/db/schema.ts`（`SCHEMA_VERSION`）。概略:

```sql
CREATE TABLE IF NOT EXISTS app_operators (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  username             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  passwordHash         TEXT    NOT NULL,
  role                 TEXT    NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  processView          TEXT    NOT NULL DEFAULT 'both' CHECK (processView IN ('solidworks', 'cadmac', 'both')),
  isActive             INTEGER NOT NULL DEFAULT 1,
  mustChangePassword   INTEGER NOT NULL DEFAULT 0,
  createdAt            TEXT    NOT NULL DEFAULT (datetime('now')),
  updatedAt            TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

- **`processView`**（v2 追加、既存 DB はマイグレーションで `ALTER TABLE`）: Flask 原型 `User.process_view` に相当。工程管理のボード／案件タスクの表示を **SolidWorks のみ / CADMAC のみ / 両方** に切り替える。`general` 種別のタスクは SW 担当・CAD 担当のどちらの表示でも見える。

**ロール**:

| `role` | できること |
|--------|-----------|
| `viewer` | 閲覧のみ |
| `editor` | 業務データの CRUD |
| `admin` | 操作者管理・マスタ削除・設定変更・DB パス変更 |

**seed 条件**:

- 起動時、`SELECT COUNT(*) FROM app_operators` が 0 かつ `app_settings.portal.bootstrapped` が **未設定** のとき、
  `admin / admin / displayName='管理者（初期）'/ role='admin' / mustChangePassword=1` を INSERT する。
- seed 後は `app_settings.portal.bootstrapped = '1'` を UPSERT。

### 4.2 `app_operator_app_grants`（フェーズ 4）

```sql
CREATE TABLE IF NOT EXISTS app_operator_app_grants (
  operatorId INTEGER NOT NULL REFERENCES app_operators(id) ON DELETE CASCADE,
  appId      TEXT    NOT NULL,
  createdAt  TEXT    DEFAULT (datetime('now')),
  PRIMARY KEY (operatorId, appId)
);
```

- 0 行しか無い場合は「全員全アプリ可」として扱う（フェーズ 1〜3 の間は登録しない）。

---

## 5. マスタ（flat）

### 5.1 `m_customers` / `m_models` / `m_part_numbers` / `m_component_names` / `m_group_names` / `m_user_names`

いずれも **同じ DDL**（共通列のみ）:

```sql
CREATE TABLE IF NOT EXISTS m_customers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  isActive       INTEGER NOT NULL DEFAULT 1,
  inactiveSource TEXT,
  createdAt      TEXT    DEFAULT (datetime('now')),
  updatedAt      TEXT    DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_m_customers_name ON m_customers(name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_m_customers_name_active
  ON m_customers(name COLLATE NOCASE) WHERE isActive = 1;
```

> `m_models` / `m_part_numbers` / `m_component_names` / `m_group_names` / `m_user_names` も **同じ形**。テーブル名とインデックス名だけ差し替える。

---

## 6. 関係テーブル

### 6.1 `m_skus` — 全社共通の「図面／SKU 台帳」

複数アプリが扱う「客先 × 機種 × 品番 × 部品名称 × 図面番号 × Rev」を 1 つのテーブルに集約する。
**どの ID も NULL 可** で、アプリごとに必要な深さだけ埋める。

```sql
CREATE TABLE IF NOT EXISTS m_skus (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id       INTEGER          REFERENCES m_customers(id)       ON DELETE RESTRICT,
  model_id          INTEGER          REFERENCES m_models(id)          ON DELETE RESTRICT,
  part_number_id    INTEGER          REFERENCES m_part_numbers(id)    ON DELETE RESTRICT,
  component_name_id INTEGER          REFERENCES m_component_names(id) ON DELETE RESTRICT,
  drawing_number    TEXT,
  revision          TEXT,
  isActive          INTEGER NOT NULL DEFAULT 1,
  inactiveSource    TEXT,
  createdAt         TEXT    DEFAULT (datetime('now')),
  updatedAt         TEXT    DEFAULT (datetime('now'))
);

-- 検索インデックス
CREATE INDEX IF NOT EXISTS idx_m_skus_customer  ON m_skus(customer_id);
CREATE INDEX IF NOT EXISTS idx_m_skus_model     ON m_skus(model_id);
CREATE INDEX IF NOT EXISTS idx_m_skus_partnum   ON m_skus(part_number_id);
CREATE INDEX IF NOT EXISTS idx_m_skus_component ON m_skus(component_name_id);
CREATE INDEX IF NOT EXISTS idx_m_skus_drawing   ON m_skus(drawing_number);

-- 重複禁止（有効行のみ）
-- NULL は常に一意扱いされるので、同じ (customer, model, part, component, drawing, rev) の組が
-- 全部 NOT NULL の場合だけ重複禁止したい → 代表 key を計算して入れる or
-- アプリ側のバリデーションで担保。フェーズ 2 で検討。
```

**使い分け例**:

| アプリ | 埋める列 |
|--------|---------|
| seisan-board | customer_id, model_id, part_number_id, component_name_id |
| drawing-libraly | customer_id, model_id, part_number_id, drawing_number, revision |
| Process management | customer_id, drawing_number, revision |

### 6.2 サテライト DB が m_skus を参照するとき

- サテライト DB には **`sku_id` を整数で保持** する（`FK` は張らない。ファイル別 DB のため）。
- 名称変更に強い（JOIN で最新名を取れる）。
- 名称変更の履歴を追いたい場合のみ、サテライト側に `customer_name_snapshot` 等を併せて保持する。

---

## 7. マイグレーション戦略

### 7.1 基本方針

- `src/main/db/migrate.ts` に **バージョン別のステップ関数配列** を持たせる。
- 起動時に `schema_meta.version` を読み、`n` 以下のステップを順に実行。
- 失敗したら **トランザクションでロールバック** し、起動を止める（壊れた DB で進まない）。

### 7.2 バージョン一覧

| ver | 内容 |
|-----|------|
| 1 | 初期全テーブル作成（本書の DDL 全部） |
| 2〜 | 変更が入ったらここに追記（例: `ALTER TABLE app_operators ADD COLUMN foo ...`） |

### 7.3 実装スケッチ

```ts
// src/main/db/migrate.ts
type Step = (db: Database.Database) => void;

const STEPS: Step[] = [
  // version 1
  (db) => {
    db.exec(DDL_SCHEMA_META);
    db.exec(DDL_APP_SETTINGS);
    db.exec(DDL_APP_OPERATORS);
    db.exec(DDL_MASTERS);  // 6 テーブル
    db.exec(DDL_M_SKUS);
    db.exec(DDL_APP_GRANTS); // フェーズ 4 で使うが先に作っておく
  },
  // version 2 以降はここに追記
];

export function migrate(db: Database.Database): void {
  const row = db.prepare(`SELECT version FROM schema_meta WHERE id = 1`).get() as { version: number } | undefined;
  const current = row?.version ?? 0;
  const target = STEPS.length;
  if (current >= target) return;

  const tx = db.transaction(() => {
    for (let i = current; i < target; i++) STEPS[i](db);
    db.prepare(
      `INSERT OR REPLACE INTO schema_meta (id, version, updatedAt) VALUES (1, ?, datetime('now'))`
    ).run(target);
  });
  tx();
}
```

### 7.4 既存マスタからの移行は **しない**（要件定義どおり）

- 旧 `customers / models / part_numbers / component_names` テーブルは **互換レイヤを作らない**
- 既存 `seisan-board` 側の repository は内蔵移植時に `m_customers` + `m_skus` JOIN に **書き直す**

---

## 8. クエリ例

### 8.1 ログイン

```sql
SELECT id, loginName, passwordHash, displayName, role, isActive, mustChangePassword
FROM app_operators
WHERE loginName = ?;
```

### 8.2 客先の一覧（有効のみ）

```sql
SELECT id, name FROM m_customers
WHERE isActive = 1
ORDER BY name COLLATE NOCASE;
```

### 8.3 ある客先の機種一覧（`m_skus` 経由）

```sql
SELECT DISTINCT mm.id, mm.name
FROM m_skus s
JOIN m_models mm ON mm.id = s.model_id
WHERE s.customer_id = ?
  AND mm.isActive = 1
  AND s.isActive = 1
ORDER BY mm.name COLLATE NOCASE;
```

### 8.4 カスケード（客先→機種→品番）で品番一覧

```sql
SELECT DISTINCT p.id, p.name
FROM m_skus s
JOIN m_part_numbers p ON p.id = s.part_number_id
WHERE s.customer_id = ?
  AND s.model_id = ?
  AND p.isActive = 1
  AND s.isActive = 1
ORDER BY p.name COLLATE NOCASE;
```

---

## 9. 将来の拡張ポリシー

1. **列追加** は既存アプリを壊さない前提で `ALTER TABLE ADD COLUMN`（NULL 許容）→ マイグレーション ver を上げる
2. **列リネーム・削除** は「仮名で追加 → 書き写し → 旧削除」の 3 ステップで行う（破壊的変更は最小限）
3. **新マスタ追加** は同じ共通列セットで `m_<name>` を作る → `TABLE_NAMES` 定数に追加 → 必要なら `m_skus` に FK 列追加
4. **type/key/value 式の汎用テーブル禁止**（型・整合性が崩れる）

---

## 10. 部材管理マスタ（5-A-0 実装済み / 5-A-1 / 5-E / 5-B / 5-F 計画）

部材管理（`parts-tracker`）向けに中央 DB へ追加予定。詳細は [requirements.md §8.5.6](./requirements.md#856-データモデル案) を参照。

| テーブル | 役割 |
|----------|------|
| `m_suppliers` | **商社**（購入・外注先）。既存 flat マスタと同形（`code` / `name` / `note` / `isActive`）。**実装済み** |
| `m_procurement_lead_times` | **標準リードタイム（日）**。`source_type` + 任意 `supplier_id` + 任意 `sku_id` / `part_number` で「何日前までに発注・着手すべきか」を保持。**実装済み** |
| `m_products` | **製品マスタ（親番）**【schema v6・実装済み】。`part_number`（UNIQUE） / `name` / 任意 `sku_id` / 任意 `default_supplier_id` |
| `m_product_boms` | **製品 BOM ヘッダ（Rev 単位）**【schema v6・実装済み】。`product_id` + `revision`（UNIQUE）、`status`（`draft` / `released` / `obsolete`） |
| `m_product_bom_lines` | **製品 BOM 構成行**【schema v6・実装済み】。`line_kind`（`part` / `sub_assembly`）、`ref_product_bom_id` で **多階層参照** |

> **2026-05-25 確定**: 5-A-1 で計画していた `m_bom_templates` / `m_bom_template_lines` は **実装しない**。`m_product_boms` / `m_product_bom_lines` を「親番 BOM テンプレート」と兼用する。

部品行（サテライト `parts-tracker.db` の `project_part_lines`）は `supplier_id` で商社を参照し、作成時に標準 LT マスタから `lead_time_days` を自動提案する。

### 10.1 計画: 案件部品行の追加列（5-A-1 / 5-E）

`project_part_lines` への追加（マイグレーション未実施）:

| 列 | 役割 |
|----|------|
| `is_arranged` | 手配済チェック（0/1） |
| `arranged_at` | 手配済にした日時 |
| `arranged_by_user_name_id` | 操作者（`m_user_names.id`） |
| `arranged_by_username` | 表示用ユーザー名スナップショット |
| `bom_level` | ルート BOM からの深さ（サブ展開由来） |
| `assembly_path` | 組立経路（例: `TOP/SUB-01/PART-A`） |
| `parent_assembly_part_number` | 直上サブ組立品番 |
| `root_product_bom_id` | 展開元ルート `m_product_boms.id`（= 案件 `projects.product_bom_id` と一致） |
| `source_product_bom_line_id` | 展開元 `m_product_bom_lines.id` |

> 旧案 `root_template_id` / `source_template_line_id` は **採用しない**（テーブル統合のため）。

任意: `project_part_line_arrangement_log`（手配 ON/OFF の履歴、`line_id` / `action` / `user` / `at`）。

### 10.2 案件部品行の追加列（5-B）【一部実装済み】

`project_part_lines` への追加:

| 列 | 役割 |
|----|------|
| `revision` | 部品リビジョン（BOM CSV・手入力） |
| `is_hidden` | 一覧非表示（商社 3D 等で手配対象外のサブ構成） |
| `hidden_at` / `hidden_by_username` / `hidden_reason` | 非表示操作の監査 |
| `import_batch_id` | CSV 取込バッチ参照 |

サテライト: `project_part_import_batches`（取込履歴。`source` = `solidworks_bom_csv` 等）。

| `required_date_user_override` | INTEGER NOT NULL DEFAULT 0 | `1` = ユーザーが必要着日を明示保存（§8.5.22 溶接日自動追随の対象外） |

サテライト: `parts_tracker_meta`（工程マッピング等）、`parts_tracker_welding_date_cache`（溶接 `start_date` の確認済みキャッシュ §8.5.22）。

**SolidWorks BOM CSV（標準8列・2026-05-25 要件・未実装）**

| 取込元列 | 保存先 |
|----------|--------|
| `符号` | `sort_order` 補助。空→表示 `-` |
| `品　　番` | `part_number` |
| `名　称` | `part_name` |
| `Rev` | `revision`（`未検出` 可。空→`-`） |
| `個数` | `quantity` |
| `材質` | `note` 等。空→`-` |
| **`親品番`** | `parent_assembly_part_number` |
| **`レベル`** | `bom_level` → `assembly_path` 生成 |

調達区分・商社コードは **CSV に含めず** UI 手入力。取込時グローバル品番ソートは **禁止**。一覧は **兄弟単位ソート＋ツリー表示**（§8.5.13.5.3）。詳細は [requirements.md §8.5.13](./requirements.md#8513-bom-csv-取込部品-rev非表示部品計画5-b)。

### 10.3 計画: 製品中心 BOM（5-E）— 5-A-1 統合

**位置づけ**: 案件は無限に増えるが、**製品（親番）は有限**。製品 Rev ごとに BOM を持ち、案件はその **スナップショット** を使う。**5-A-1 の親番 BOM テンプレートは本テーブルに統合**（兼用）。詳細は [requirements.md §8.5.14](./requirements.md#8514-製品中心の-bom-管理計画5-e未実装) を参照。

**中央 DB へ追加（マイグレーション未実施）**

| テーブル | 主要列 |
|----------|--------|
| `m_products` | `id` / `part_number`（UNIQUE） / `name` / `sku_id` / `default_supplier_id` / `note` / `isActive` / `createdAt` / `updatedAt` |
| `m_product_boms` | `id` / `product_id` / `revision` / `status`（`draft` / `released` / `obsolete`） / `released_at` / `released_by_username` / `note` / `createdAt` / `updatedAt`。UNIQUE `(product_id, revision)` |
| `m_product_bom_lines` | `id` / `product_bom_id` / `line_kind`（`part` / `sub_assembly`） / `part_number` / `part_name` / `quantity` / `source_type` / `supplier_id` / `sku_id` / `ref_product_bom_id` / `ref_part_number` / `sort_order` / `note` |

> **2026-05-25 確定**: 5-A-1 の `m_bom_templates` は **実装しない**。製品 Rev = 親番テンプレートとして本テーブル群を兼用する。

**案件側の追加列（配置先確定: `seisan-board.db / projects`）**

**2026-05-25 確定**: `seisan-board.db` の `projects` テーブルに追加（生産ボード側に持たせる方が「案件＝製品の発注」として自然なため）。

| 追加列 | 役割 |
|--------|------|
| `product_id` | 中央 `m_products.id`（任意・既存案件は NULL 可） |
| `product_bom_id` | 起票時にスナップショットした `m_product_boms.id` |
| `quantity_units` | 製造台数（製品 1 台 × `quantity_units` で部品行の数量を算出） |

> 中央 DB の `m_products` / `m_product_boms` は同一 SQLite ファイル内で JOIN 可能（central DB 統合済み）。`parts-tracker.db` 側にも `root_product_bom_id`（§10.1）を冗長保持し、案件詳細を引かずに行レベルで参照できるようにする【推奨】。

**更新時の追従ポリシー（決定）**:

- 既存案件には **自動追従しない**（`projects.product_bom_id` は起票時点で固定）。
- 新 Rev に当て直す場合は **手動操作 + 5-F 差分プレビュー** を介す。詳細は [requirements.md §8.5.14.4.1](./requirements.md#851441-製品-bom-更新時の追従ポリシー決定2026-05-25) を参照。

### 10.4 計画: BOM Rev 差分（5-F）

新規テーブルは追加しない。`m_product_bom_lines`（Rev A / Rev B）または `project_part_lines`（案件 A / 案件 B）を **読み取り** で比較し、IPC レベルで差分を返す。

詳細は [requirements.md §8.5.15](./requirements.md#8515-bom-rev-差分表示設計変更の見える化計画5-f未実装) を参照。

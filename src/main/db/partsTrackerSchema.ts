import type Database from "better-sqlite3";

export function initPartsTrackerSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_part_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seisan_project_id TEXT NOT NULL,
      part_number TEXT NOT NULL,
      part_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      source_type TEXT NOT NULL CHECK (source_type IN ('inhouse', 'purchase', 'supplied')),
      supplier_id INTEGER,
      lead_time_days INTEGER NOT NULL DEFAULT 0,
      required_date TEXT NOT NULL,
      order_by_date TEXT,
      ordered_at TEXT,
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'ordered', 'in_progress', 'received', 'delayed')),
      sku_id INTEGER,
      procurement_lead_time_id INTEGER,
      note TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_part_lines_project ON project_part_lines(seisan_project_id);
    CREATE INDEX IF NOT EXISTS idx_part_lines_status ON project_part_lines(status);
  `);

  // 5-A-1 / 5-B / 5-E に対応する列追加（既存 DB 互換のため ALTER 単発で）
  const additionalColumns: Array<{ name: string; sql: string }> = [
    // 5-B: Rev・非表示・取込バッチ
    {
      name: "revision",
      sql: "ALTER TABLE project_part_lines ADD COLUMN revision TEXT",
    },
    {
      name: "is_hidden",
      sql: "ALTER TABLE project_part_lines ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "hidden_at",
      sql: "ALTER TABLE project_part_lines ADD COLUMN hidden_at TEXT",
    },
    {
      name: "hidden_by_username",
      sql: "ALTER TABLE project_part_lines ADD COLUMN hidden_by_username TEXT",
    },
    {
      name: "hidden_reason",
      sql: "ALTER TABLE project_part_lines ADD COLUMN hidden_reason TEXT",
    },
    {
      name: "import_batch_id",
      sql: "ALTER TABLE project_part_lines ADD COLUMN import_batch_id INTEGER",
    },
    // 5-A-1: 手配済
    {
      name: "is_arranged",
      sql: "ALTER TABLE project_part_lines ADD COLUMN is_arranged INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "arranged_at",
      sql: "ALTER TABLE project_part_lines ADD COLUMN arranged_at TEXT",
    },
    {
      name: "arranged_by_user_name_id",
      sql: "ALTER TABLE project_part_lines ADD COLUMN arranged_by_user_name_id INTEGER",
    },
    {
      name: "arranged_by_username",
      sql: "ALTER TABLE project_part_lines ADD COLUMN arranged_by_username TEXT",
    },
    // 5-A-1 / 5-E: 階層メタ
    {
      name: "bom_level",
      sql: "ALTER TABLE project_part_lines ADD COLUMN bom_level INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "assembly_path",
      sql: "ALTER TABLE project_part_lines ADD COLUMN assembly_path TEXT",
    },
    {
      name: "parent_assembly_part_number",
      sql: "ALTER TABLE project_part_lines ADD COLUMN parent_assembly_part_number TEXT",
    },
    {
      name: "root_product_bom_id",
      sql: "ALTER TABLE project_part_lines ADD COLUMN root_product_bom_id INTEGER",
    },
    {
      name: "source_product_bom_line_id",
      sql: "ALTER TABLE project_part_lines ADD COLUMN source_product_bom_line_id INTEGER",
    },
  ];
  const existing = (
    db.prepare("PRAGMA table_info(project_part_lines)").all() as { name: string }[]
  ).map((c) => c.name);
  for (const col of additionalColumns) {
    if (!existing.includes(col.name)) {
      try {
        db.prepare(col.sql).run();
      } catch {
        /* ignore */
      }
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_part_lines_arranged ON project_part_lines(is_arranged);
    CREATE INDEX IF NOT EXISTS idx_part_lines_hidden ON project_part_lines(is_hidden);
    CREATE INDEX IF NOT EXISTS idx_part_lines_root_bom ON project_part_lines(root_product_bom_id);

    CREATE TABLE IF NOT EXISTS project_part_import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seisan_project_id TEXT NOT NULL,
      source TEXT NOT NULL,
      file_name TEXT,
      row_count INTEGER NOT NULL DEFAULT 0,
      imported_by_username TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_part_import_batches_project
      ON project_part_import_batches(seisan_project_id);

    CREATE TABLE IF NOT EXISTS project_part_line_arrangement_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('set', 'unset')),
      user_name_id INTEGER,
      username TEXT,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_part_arrangement_log_line
      ON project_part_line_arrangement_log(line_id);
  `);

  migrateSourceTypeUnset(db);
}

/** source_type に unset（未設定）を許可 */
function migrateSourceTypeUnset(db: Database.Database): void {
  const master = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'project_part_lines'`)
    .get() as { sql: string } | undefined;
  if (!master?.sql || master.sql.includes("'unset'")) return;

  db.exec(`
    CREATE TABLE project_part_lines_mig (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seisan_project_id TEXT NOT NULL,
      part_number TEXT NOT NULL,
      part_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      source_type TEXT NOT NULL DEFAULT 'unset'
        CHECK (source_type IN ('inhouse', 'purchase', 'supplied', 'unset')),
      supplier_id INTEGER,
      lead_time_days INTEGER NOT NULL DEFAULT 0,
      required_date TEXT NOT NULL,
      order_by_date TEXT,
      ordered_at TEXT,
      status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'ordered', 'in_progress', 'received', 'delayed')),
      sku_id INTEGER,
      procurement_lead_time_id INTEGER,
      note TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      revision TEXT,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      hidden_at TEXT,
      hidden_by_username TEXT,
      hidden_reason TEXT,
      import_batch_id INTEGER,
      is_arranged INTEGER NOT NULL DEFAULT 0,
      arranged_at TEXT,
      arranged_by_user_name_id INTEGER,
      arranged_by_username TEXT,
      bom_level INTEGER NOT NULL DEFAULT 0,
      assembly_path TEXT,
      parent_assembly_part_number TEXT,
      root_product_bom_id INTEGER,
      source_product_bom_line_id INTEGER
    );
    INSERT INTO project_part_lines_mig SELECT * FROM project_part_lines;
    DROP TABLE project_part_lines;
    ALTER TABLE project_part_lines_mig RENAME TO project_part_lines;
    CREATE INDEX IF NOT EXISTS idx_part_lines_project ON project_part_lines(seisan_project_id);
    CREATE INDEX IF NOT EXISTS idx_part_lines_status ON project_part_lines(status);
    CREATE INDEX IF NOT EXISTS idx_part_lines_arranged ON project_part_lines(is_arranged);
    CREATE INDEX IF NOT EXISTS idx_part_lines_hidden ON project_part_lines(is_hidden);
    CREATE INDEX IF NOT EXISTS idx_part_lines_root_bom ON project_part_lines(root_product_bom_id);
  `);
}

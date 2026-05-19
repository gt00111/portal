import type Database from "better-sqlite3";

function ensureColumn(db: Database.Database, tableName: string, columnName: string, definition: string): void {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  const hasColumn = rows.some((row) => row.name === columnName);
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export function ensureProcessMgmtMetaTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS process_mgmt_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

/** 外部キー制約を満たすためのダミー行。実際の案件は生産ボードが正 */
export function getOrCreateBundleProjectId(db: Database.Database): number {
  ensureProcessMgmtMetaTable(db);
  const row = db.prepare("SELECT value FROM process_mgmt_meta WHERE key = 'bundle_project_id'").get() as
    | { value: string }
    | undefined;
  if (row) {
    return Number(row.value);
  }
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `
        INSERT INTO projects (name, description, client, drawing_number, revision, note, status, created_at, updated_at)
        VALUES ('（生産ボード連携）', '', '', '', '', '', 'active', ?, ?)
      `
    )
    .run(now, now);
  const id = Number(info.lastInsertRowid);
  db.prepare("INSERT INTO process_mgmt_meta (key, value) VALUES ('bundle_project_id', ?)").run(String(id));
  return id;
}

/** 工程管理サテライト DB（users はポータル app_operators に統一。ここには作成しない） */
export function initProcessMgmtSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      client TEXT NOT NULL DEFAULT '',
      drawing_number TEXT NOT NULL DEFAULT '',
      revision TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      process_type TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'todo',
      assignee TEXT NOT NULL DEFAULT '',
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  ensureColumn(db, "projects", "client", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "projects", "drawing_number", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "projects", "revision", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "projects", "note", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "tasks", "process_type", "TEXT NOT NULL DEFAULT 'general'");
  ensureColumn(db, "tasks", "started_at", "TEXT");
  ensureColumn(db, "tasks", "completed_at", "TEXT");
  ensureColumn(db, "tasks", "seisan_project_id", "TEXT");
  ensureColumn(db, "tasks", "progress_note", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "tasks", "progress_percent", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "tasks", "completion_undo_reason", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "tasks", "completion_undo_at", "TEXT");
  ensureColumn(db, "tasks", "completion_undo_by", "TEXT NOT NULL DEFAULT ''");
  ensureProcessMgmtMetaTable(db);
  ensurePmTaskCompletionNotificationsTable(db);
}

/** 工程タスク完了のインナー通知（メールなし。確認まで一覧に残す） */
function ensurePmTaskCompletionNotificationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pm_task_completion_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_username TEXT NOT NULL,
      task_id INTEGER NOT NULL,
      summary_json TEXT NOT NULL,
      completed_by TEXT NOT NULL,
      task_completed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acknowledged_at TEXT
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pm_notify_recipient_pending
    ON pm_task_completion_notifications (recipient_username, id)
    WHERE acknowledged_at IS NULL;
  `);
}

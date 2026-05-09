import type Database from "better-sqlite3";

export function initSeisanSchema(db: Database.Database): void {
  const hasCompaniesTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='companies'")
    .get();

  if (hasCompaniesTable) {
    db.pragma("foreign_keys = OFF");
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects_v2 (
        id TEXT PRIMARY KEY,
        project_no TEXT UNIQUE,
        received_at TEXT,
        input_by_user_id TEXT NOT NULL,
        company_id TEXT NOT NULL,
        project_name TEXT,
        request_content TEXT,
        deadline TEXT NOT NULL,
        group_id TEXT,
        status TEXT DEFAULT 'draft',
        priority INTEGER DEFAULT 0,
        model_type TEXT,
        part_number TEXT,
        unit_number TEXT,
        notes TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT OR IGNORE INTO projects_v2
      SELECT
        p.id, p.project_no, p.received_at,
        COALESCE(COALESCE(u.display_name, u.username), p.input_by_user_id),
        COALESCE(c.name, p.company_id),
        p.project_name, p.request_content, p.deadline,
        COALESCE(g.name, p.group_id),
        p.status, p.priority, p.model_type, p.part_number, p.unit_number,
        p.notes, p.completed_at, p.created_at, p.updated_at
      FROM projects p
      LEFT JOIN companies c ON p.company_id = c.id
      LEFT JOIN groups g ON p.group_id = g.id
      LEFT JOIN users u ON p.input_by_user_id = u.id;

      DROP TABLE IF EXISTS projects;
      ALTER TABLE projects_v2 RENAME TO projects;

      DROP TABLE IF EXISTS companies;
      DROP TABLE IF EXISTS groups;
      DROP TABLE IF EXISTS users;
    `);
    db.pragma("foreign_keys = ON");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      project_no TEXT UNIQUE,
      received_at TEXT,
      input_by_user_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      project_name TEXT,
      request_content TEXT,
      deadline TEXT NOT NULL,
      group_id TEXT,
      status TEXT DEFAULT 'draft',
      priority INTEGER DEFAULT 0,
      model_type TEXT,
      part_number TEXT,
      unit_number TEXT,
      revision TEXT,
      notes TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_task_id TEXT,
      task_type TEXT DEFAULT 'task',
      text TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      progress REAL DEFAULT 0,
      status TEXT DEFAULT 'planned',
      sort_order INTEGER DEFAULT 0,
      depends_on_task_id TEXT,
      actual_start_date TEXT,
      actual_end_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(parent_task_id) REFERENCES tasks(id),
      FOREIGN KEY(depends_on_task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS project_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_ext TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS process_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL,
      default_days REAL NOT NULL DEFAULT 1,
      color TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE TABLE IF NOT EXISTS user_permissions (
      user_name TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);
    CREATE INDEX IF NOT EXISTS idx_process_templates_sort ON process_templates(sort_order);
  `);

  for (const sql of [
    "ALTER TABLE project_files ADD COLUMN is_obsolete INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN project_name TEXT",
    "ALTER TABLE projects ADD COLUMN model_type TEXT",
    "ALTER TABLE projects ADD COLUMN part_number TEXT",
    "ALTER TABLE projects ADD COLUMN unit_number TEXT",
    "ALTER TABLE projects ADD COLUMN revision TEXT",
    "ALTER TABLE tasks ADD COLUMN process_template_id TEXT",
  ]) {
    try {
      db.prepare(sql).run();
    } catch {
      /* already exists */
    }
  }

  const count = db.prepare("SELECT COUNT(*) as n FROM process_templates").get() as { n: number };
  if (count.n === 0) {
    db.exec(`
      INSERT INTO process_templates (id, name, sort_order, default_days, color, is_active, created_at, updated_at)
      VALUES
        ('pt01', '設計', 1, 2, '#60a5fa', 1, datetime('now'), datetime('now')),
        ('pt02', 'レーザー切断プログラム作成', 2, 1, '#34d399', 1, datetime('now'), datetime('now')),
        ('pt03', 'レーザー加工', 3, 2, '#22c55e', 1, datetime('now'), datetime('now')),
        ('pt04', '曲げ', 4, 1, '#f59e0b', 1, datetime('now'), datetime('now')),
        ('pt05', '溶接', 5, 3, '#ef4444', 1, datetime('now'), datetime('now')),
        ('pt06', '検査', 6, 1, '#a78bfa', 1, datetime('now'), datetime('now')),
        ('pt07', '塗装', 7, 2, '#ec4899', 1, datetime('now'), datetime('now')),
        ('pt08', '出荷', 8, 1, '#94a3b8', 1, datetime('now'), datetime('now'))
    `);
  }
}

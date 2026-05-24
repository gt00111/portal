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
}

import type Database from "better-sqlite3";

/** 図面ライブラリ専用 DB（Express 撤去後の `drawing-library.db`）のスキーマ */
export function initDrawingLibrarySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS work_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS drawings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      file_path TEXT,
      category TEXT,
      tags TEXT,
      customer_name TEXT,
      model TEXT,
      product_name TEXT,
      drawing_number TEXT,
      revision TEXT,
      drawing_type TEXT DEFAULT 'customer',
      is_obsolete INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS drawing_edrawings_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drawing_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (drawing_id) REFERENCES drawings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS drawing_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drawing_id INTEGER NOT NULL,
      comment_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (drawing_id) REFERENCES drawings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_edrawings_drawing_id ON drawing_edrawings_files(drawing_id);
    CREATE INDEX IF NOT EXISTS idx_comments_drawing_id ON drawing_comments(drawing_id);
  `);

  const alterColumns: { sql: string; name: string }[] = [
    { sql: `ALTER TABLE drawings ADD COLUMN drawing_type TEXT DEFAULT 'customer'`, name: "drawing_type" },
    { sql: `ALTER TABLE drawings ADD COLUMN customer_name TEXT`, name: "customer_name" },
    { sql: `ALTER TABLE drawings ADD COLUMN model TEXT`, name: "model" },
    { sql: `ALTER TABLE drawings ADD COLUMN product_name TEXT`, name: "product_name" },
    { sql: `ALTER TABLE drawings ADD COLUMN drawing_number TEXT`, name: "drawing_number" },
    { sql: `ALTER TABLE drawings ADD COLUMN revision TEXT`, name: "revision" },
    { sql: `ALTER TABLE drawings ADD COLUMN is_obsolete INTEGER DEFAULT 0`, name: "is_obsolete" },
  ];
  for (const { sql } of alterColumns) {
    try {
      db.exec(sql);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("duplicate column")) {
        /* ignore */
      }
    }
  }
}

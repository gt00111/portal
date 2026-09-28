import type Database from "better-sqlite3";

export function initMBendSchema(db: Database.Database): void {
  db.transaction(() => {
  const hasMeta = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'").get();
  const meta = hasMeta ? db.prepare("SELECT version FROM schema_meta WHERE id=1").get() as { version: number } | undefined : undefined;
  if (meta && meta.version > 2) throw new Error("M-BEND DBが新しいバージョンです。アプリを更新してください。");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, updatedAt TEXT NOT NULL
    );
    INSERT INTO schema_meta (id, version, updatedAt) VALUES (1, 1, datetime('now'))
      ON CONFLICT(id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS m_machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, note TEXT, pressCapacity REAL, tableLength REAL,
      openHeight REAL, strokeLength REAL, isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')), updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS m_upper_tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, note TEXT, punchType TEXT, tipRadius REAL, tipAngle REAL,
      bodyOffset REAL, reliefHeight REAL, reliefDepth REAL, toolHeight REAL, maxLoad REAL,
      mountStandard TEXT, isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')), updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS m_lower_tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, note TEXT, vWidth REAL, dieAngle REAL, shoulderRadius REAL,
      toolHeight REAL, maxLoad REAL, mountStandard TEXT, isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')), updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS m_tool_holders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, note TEXT, holderType TEXT, toolHeight REAL, maxLoad REAL,
      topOffset REAL, maxStack REAL, mountStandard TEXT, isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')), updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS m_upper_tool_machines (
      upperToolId INTEGER NOT NULL REFERENCES m_upper_tools(id) ON DELETE CASCADE,
      machineId INTEGER NOT NULL REFERENCES m_machines(id) ON DELETE CASCADE,
      PRIMARY KEY (upperToolId, machineId)
    );
    CREATE TABLE IF NOT EXISTS m_lower_tool_machines (
      lowerToolId INTEGER NOT NULL REFERENCES m_lower_tools(id) ON DELETE CASCADE,
      machineId INTEGER NOT NULL REFERENCES m_machines(id) ON DELETE CASCADE,
      PRIMARY KEY (lowerToolId, machineId)
    );
    CREATE TABLE IF NOT EXISTS m_tool_holder_machines (
      holderId INTEGER NOT NULL REFERENCES m_tool_holders(id) ON DELETE CASCADE,
      machineId INTEGER NOT NULL REFERENCES m_machines(id) ON DELETE CASCADE,
      PRIMARY KEY (holderId, machineId)
    );
    CREATE TABLE IF NOT EXISTS migration_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, importedAt TEXT NOT NULL,
      detail TEXT
    );
    CREATE TABLE IF NOT EXISTS tool_geometry (
      id INTEGER PRIMARY KEY,
      upper_tool_id INTEGER UNIQUE REFERENCES m_upper_tools(id) ON DELETE CASCADE,
      lower_tool_id INTEGER UNIQUE REFERENCES m_lower_tools(id) ON DELETE CASCADE,
      holder_id INTEGER UNIQUE REFERENCES m_tool_holders(id) ON DELETE CASCADE,
      file_name TEXT, relative_path TEXT, sha256 TEXT,
      placement_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK ((upper_tool_id IS NOT NULL) + (lower_tool_id IS NOT NULL) + (holder_id IS NOT NULL) = 1)
    );
    UPDATE schema_meta SET version = 2, updatedAt = datetime('now') WHERE id = 1 AND version < 2;
  `);
  })();
}

import type Database from "better-sqlite3";

import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";

function ensureAppOperatorsProcessView(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(app_operators)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "processView")) {
    db.exec(`ALTER TABLE app_operators ADD COLUMN processView TEXT NOT NULL DEFAULT 'both'`);
  }
}

export function migrate(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
  ensureAppOperatorsProcessView(db);
  const row = db.prepare("SELECT version FROM schema_meta WHERE id = 1").get() as
    | { version: number }
    | undefined;
  if (!row) {
    db.prepare(
      "INSERT INTO schema_meta (id, version, updatedAt) VALUES (1, ?, datetime('now'))"
    ).run(SCHEMA_VERSION);
    return;
  }
  if (row.version !== SCHEMA_VERSION) {
    db.prepare(
      "UPDATE schema_meta SET version = ?, updatedAt = datetime('now') WHERE id = 1"
    ).run(SCHEMA_VERSION);
  }
}

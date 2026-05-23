import type Database from "better-sqlite3";

import { GRANTABLE_APP_IDS } from "@shared/appIds.js";
import type { AppRole } from "@shared/auth.js";

import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";

function ensureAppOperatorsProcessView(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(app_operators)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "processView")) {
    db.exec(`ALTER TABLE app_operators ADD COLUMN processView TEXT NOT NULL DEFAULT 'both'`);
  }
}

function ensureAppOperatorsUserNameId(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(app_operators)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "userNameId")) {
    db.exec(`ALTER TABLE app_operators ADD COLUMN userNameId INTEGER REFERENCES m_user_names(id)`);
  }
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row != null;
}

function migrateOperatorsToMasterUsers(db: Database.Database): void {
  const operators = db
    .prepare(
      `SELECT id, username, role, processView, userNameId FROM app_operators ORDER BY id ASC`
    )
    .all() as {
    id: number;
    username: string;
    role: AppRole;
    processView: string;
    userNameId: number | null;
  }[];

  const findUserId = db.prepare(
    `SELECT id FROM m_user_names WHERE name = ? COLLATE NOCASE LIMIT 1`
  );
  const insertUser = db.prepare(
    `INSERT INTO m_user_names (code, name, note, isActive) VALUES (?, ?, NULL, 1)`
  );
  const linkOperator = db.prepare(
    `UPDATE app_operators SET userNameId = ?, updatedAt = datetime('now') WHERE id = ?`
  );
  const upsertGrant = db.prepare(
    `INSERT INTO m_user_app_grants (userNameId, appId, appRole, processView, updatedAt)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(userNameId, appId) DO UPDATE SET
       appRole = excluded.appRole,
       processView = excluded.processView,
       updatedAt = datetime('now')`
  );

  for (const op of operators) {
    const username = (op.username ?? "").trim();
    if (!username) continue;

    let userNameId = op.userNameId;
    if (userNameId == null) {
      const existing = findUserId.get(username) as { id: number } | undefined;
      if (existing) {
        userNameId = existing.id;
      } else {
        const info = insertUser.run(username, username);
        userNameId = Number(info.lastInsertRowid);
      }
      linkOperator.run(userNameId, op.id);
    }

    const appRole = op.role;
    for (const appId of GRANTABLE_APP_IDS) {
      const processView = appId === "process-management" ? op.processView ?? "both" : null;
      upsertGrant.run(userNameId, appId, appRole, processView);
    }
  }
}

function migrateToV4(db: Database.Database): void {
  if (!tableExists(db, "m_categories")) {
    db.exec(`
      CREATE TABLE m_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        code TEXT NOT NULL COLLATE NOCASE,
        name TEXT NOT NULL,
        note TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (scope, code)
      );
      CREATE INDEX idx_m_categories_scope ON m_categories(scope);
    `);
  }
}

function migrateToV3(db: Database.Database): void {
  ensureAppOperatorsUserNameId(db);
  if (!tableExists(db, "m_user_group_memberships")) {
    db.exec(`
      CREATE TABLE m_user_group_memberships (
        userNameId INTEGER NOT NULL UNIQUE REFERENCES m_user_names(id) ON DELETE CASCADE,
        groupNameId INTEGER NOT NULL REFERENCES m_group_names(id) ON DELETE RESTRICT,
        roleInGroup TEXT NOT NULL CHECK (roleInGroup IN ('member', 'group_admin')),
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_user_group_memberships_group ON m_user_group_memberships(groupNameId);
    `);
  }
  if (!tableExists(db, "m_user_app_grants")) {
    db.exec(`
      CREATE TABLE m_user_app_grants (
        userNameId INTEGER NOT NULL REFERENCES m_user_names(id) ON DELETE CASCADE,
        appId TEXT NOT NULL,
        appRole TEXT NOT NULL CHECK (appRole IN ('admin', 'editor', 'viewer')),
        processView TEXT CHECK (processView IS NULL OR processView IN ('solidworks', 'cadmac', 'both')),
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (userNameId, appId)
      );
    `);
  }
  migrateOperatorsToMasterUsers(db);
}

export function migrate(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
  ensureAppOperatorsProcessView(db);

  const row = db.prepare("SELECT version FROM schema_meta WHERE id = 1").get() as
    | { version: number }
    | undefined;

  const currentVersion = row?.version ?? 0;

  if (currentVersion < 3) {
    migrateToV3(db);
  }
  if (currentVersion < 4) {
    migrateToV4(db);
  }

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

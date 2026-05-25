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

function migrateToV6(db: Database.Database): void {
  if (!tableExists(db, "m_products")) {
    db.exec(`
      CREATE TABLE m_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        sku_id INTEGER REFERENCES m_skus(id) ON DELETE SET NULL,
        default_supplier_id INTEGER REFERENCES m_suppliers(id) ON DELETE SET NULL,
        note TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
  if (!tableExists(db, "m_product_boms")) {
    db.exec(`
      CREATE TABLE m_product_boms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES m_products(id) ON DELETE CASCADE,
        revision TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'released', 'obsolete')),
        released_at TEXT,
        released_by_username TEXT,
        note TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (product_id, revision)
      );
      CREATE INDEX idx_m_product_boms_product ON m_product_boms(product_id);
    `);
  }
  if (!tableExists(db, "m_product_bom_lines")) {
    db.exec(`
      CREATE TABLE m_product_bom_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_bom_id INTEGER NOT NULL REFERENCES m_product_boms(id) ON DELETE CASCADE,
        line_kind TEXT NOT NULL CHECK (line_kind IN ('part', 'sub_assembly')),
        part_number TEXT NOT NULL,
        part_name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        source_type TEXT NOT NULL CHECK (source_type IN ('inhouse', 'purchase', 'supplied')),
        supplier_id INTEGER REFERENCES m_suppliers(id) ON DELETE SET NULL,
        sku_id INTEGER REFERENCES m_skus(id) ON DELETE SET NULL,
        ref_product_bom_id INTEGER REFERENCES m_product_boms(id) ON DELETE SET NULL,
        ref_part_number TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_m_product_bom_lines_bom ON m_product_bom_lines(product_bom_id);
      CREATE INDEX idx_m_product_bom_lines_kind ON m_product_bom_lines(line_kind);
    `);
  }
}

function migrateToV5(db: Database.Database): void {
  if (!tableExists(db, "m_suppliers")) {
    db.exec(`
      CREATE TABLE m_suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        note TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
  if (!tableExists(db, "m_procurement_lead_times")) {
    db.exec(`
      CREATE TABLE m_procurement_lead_times (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL CHECK (source_type IN ('inhouse', 'purchase', 'supplied')),
        supplier_id INTEGER REFERENCES m_suppliers(id) ON DELETE SET NULL,
        sku_id INTEGER REFERENCES m_skus(id) ON DELETE SET NULL,
        part_number TEXT,
        lead_time_days INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_procurement_lt_source ON m_procurement_lead_times(source_type);
      CREATE INDEX idx_procurement_lt_supplier ON m_procurement_lead_times(supplier_id);
    `);
  }

  const grantUsers = db
    .prepare(`SELECT DISTINCT userNameId FROM m_user_app_grants`)
    .all() as { userNameId: number }[];
  const hasGrant = db.prepare(
    `SELECT 1 FROM m_user_app_grants WHERE userNameId = ? AND appId = 'parts-tracker' LIMIT 1`
  );
  const seisanGrant = db.prepare(
    `SELECT appRole FROM m_user_app_grants WHERE userNameId = ? AND appId = 'seisan-board' LIMIT 1`
  );
  const insertGrant = db.prepare(
    `INSERT INTO m_user_app_grants (userNameId, appId, appRole, processView, updatedAt)
     VALUES (?, 'parts-tracker', ?, NULL, datetime('now'))`
  );
  for (const { userNameId } of grantUsers) {
    if (hasGrant.get(userNameId)) continue;
    const sg = seisanGrant.get(userNameId) as { appRole: AppRole } | undefined;
    insertGrant.run(userNameId, sg?.appRole ?? "viewer");
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
  if (currentVersion < 5) {
    migrateToV5(db);
  }
  if (currentVersion < 6) {
    migrateToV6(db);
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

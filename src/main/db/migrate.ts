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

function migrateToV7(db: Database.Database): void {
  if (!tableExists(db, "m_machines")) {
    db.exec(`
      CREATE TABLE m_machines (
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
}

function migrateToV8(db: Database.Database): void {
  for (const table of ["m_upper_tools", "m_lower_tools"]) {
    if (!tableExists(db, table)) {
      db.exec(`
        CREATE TABLE ${table} (
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
  }
}

/** 既存テーブルに不足しているカラムのみ追加する */
function addColumns(
  db: Database.Database,
  table: string,
  columns: Record<string, "REAL" | "TEXT" | "INTEGER">
): void {
  if (!tableExists(db, table)) return;
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
  );
  for (const [column, type] of Object.entries(columns)) {
    if (existing.has(column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** 機械・金型マスタに寸法／能力カラムを追加する（板金製造支援の金型選定・荷重判定で参照） */
function migrateToV9(db: Database.Database): void {
  const extraColumns: Record<string, readonly string[]> = {
    m_machines: ["pressCapacity", "tableLength", "openHeight", "strokeLength"],
    m_upper_tools: ["tipRadius", "tipAngle", "toolHeight", "maxLoad"],
    m_lower_tools: ["vWidth", "dieAngle", "shoulderRadius", "toolHeight", "maxLoad"],
  };
  for (const [table, columns] of Object.entries(extraColumns)) {
    addColumns(
      db,
      table,
      Object.fromEntries(columns.map((c) => [c, "REAL" as const]))
    );
  }
}

/** 上型マスタに型式と逃げ寸法を追加する（干渉判定をパンチ断面ベースで行うため） */
function migrateToV11(db: Database.Database): void {
  addColumns(db, "m_upper_tools", {
    punchType: "TEXT",
    bodyOffset: "REAL",
    reliefHeight: "REAL",
    reliefDepth: "REAL",
  });
}

/**
 * パンチ本体の寸法を「全幅」から「片側の張り出し」に改める。
 * 非対称なパンチ（グースネック等）では全幅の半分が当たり判定の距離にならないため。
 * 既存の入力値は意味が変わらないよう半分にして引き継ぐ。
 */
function migrateToV12(db: Database.Database): void {
  if (!tableExists(db, "m_upper_tools")) return;
  const columns = new Set(
    (db.prepare("PRAGMA table_info(m_upper_tools)").all() as { name: string }[]).map((c) => c.name)
  );
  if (columns.has("bodyOffset") || !columns.has("bodyWidth")) {
    addColumns(db, "m_upper_tools", { bodyOffset: "REAL" });
    return;
  }
  db.exec("ALTER TABLE m_upper_tools RENAME COLUMN bodyWidth TO bodyOffset");
  db.exec("UPDATE m_upper_tools SET bodyOffset = bodyOffset / 2.0 WHERE bodyOffset IS NOT NULL");
}

/**
 * ダイホルダー・中間板のマスタを追加する。
 * 金型は単体ではなく機械側から積み上げたスタックとして扱うため、
 * 各段の型高さ・耐圧・上面の張り出しを保持する。
 */
function migrateToV13(db: Database.Database): void {
  if (!tableExists(db, "m_tool_holders")) {
    db.exec(`
      CREATE TABLE m_tool_holders (
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
  if (!tableExists(db, "m_tool_holder_machines")) {
    db.exec(`
      CREATE TABLE m_tool_holder_machines (
        holderId INTEGER NOT NULL REFERENCES m_tool_holders(id) ON DELETE CASCADE,
        machineId INTEGER NOT NULL REFERENCES m_machines(id) ON DELETE CASCADE,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (holderId, machineId)
      );
      CREATE INDEX idx_m_tool_holder_machines_machine ON m_tool_holder_machines(machineId);
    `);
  }
  addColumns(db, "m_tool_holders", {
    holderType: "TEXT",
    toolHeight: "REAL",
    maxLoad: "REAL",
    topOffset: "REAL",
    maxStack: "REAL",
    mountStandard: "TEXT",
  });
  // 金型とホルダーの規格が食い違う組み合わせを検出できるようにする
  addColumns(db, "m_upper_tools", { mountStandard: "TEXT" });
  addColumns(db, "m_lower_tools", { mountStandard: "TEXT" });
}

/** 機械に付く金型の対応表を追加する（行が無い金型は全機械で共用） */
function migrateToV10(db: Database.Database): void {
  if (!tableExists(db, "m_upper_tool_machines")) {
    db.exec(`
      CREATE TABLE m_upper_tool_machines (
        upperToolId INTEGER NOT NULL REFERENCES m_upper_tools(id) ON DELETE CASCADE,
        machineId INTEGER NOT NULL REFERENCES m_machines(id) ON DELETE CASCADE,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (upperToolId, machineId)
      );
      CREATE INDEX idx_m_upper_tool_machines_machine ON m_upper_tool_machines(machineId);
    `);
  }
  if (!tableExists(db, "m_lower_tool_machines")) {
    db.exec(`
      CREATE TABLE m_lower_tool_machines (
        lowerToolId INTEGER NOT NULL REFERENCES m_lower_tools(id) ON DELETE CASCADE,
        machineId INTEGER NOT NULL REFERENCES m_machines(id) ON DELETE CASCADE,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (lowerToolId, machineId)
      );
      CREATE INDEX idx_m_lower_tool_machines_machine ON m_lower_tool_machines(machineId);
    `);
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
  if (currentVersion < 7) {
    migrateToV7(db);
  }
  if (currentVersion < 8) {
    migrateToV8(db);
  }
  if (currentVersion < 9) {
    migrateToV9(db);
  }
  if (currentVersion < 10) {
    migrateToV10(db);
  }
  if (currentVersion < 11) {
    migrateToV11(db);
  }
  if (currentVersion < 12) {
    migrateToV12(db);
  }
  if (currentVersion < 13) {
    migrateToV13(db);
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

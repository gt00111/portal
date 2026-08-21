import {
  isChoiceField,
  isMachineLinkedMasterTable,
  isMasterTable,
  isNumberField,
  isScopedMasterTable,
  MACHINE_LINK_TABLES,
  masterExtraFields,
  type MasterExtraValues,
  type MasterRow,
  type MasterTable,
  type MasterUpsertInput,
} from "@shared/master.js";

import { getDb } from "@main/db/connection.js";

interface RawRow {
  id: number;
  code: string;
  name: string;
  note: string | null;
  isActive: number;
  scope?: string | null;
  createdAt: string;
  updatedAt: string;
  [extraKey: string]: unknown;
}

function toRow(raw: RawRow, table: MasterTable, machineIds?: number[]): MasterRow {
  const base: MasterRow = {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    note: raw.note,
    isActive: raw.isActive === 1,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
  if (isScopedMasterTable(table)) {
    base.scope = raw.scope ?? null;
  }
  const fields = masterExtraFields(table);
  if (fields.length > 0) {
    const extra: MasterExtraValues = {};
    for (const field of fields) {
      const value = raw[field.key];
      if (isNumberField(field)) {
        extra[field.key] = typeof value === "number" ? value : null;
      } else {
        extra[field.key] = typeof value === "string" && value.length > 0 ? value : null;
      }
    }
    base.extra = extra;
  }
  if (isMachineLinkedMasterTable(table)) {
    base.machineIds = machineIds ?? [];
  }
  return base;
}

function ensureTable(table: string): MasterTable {
  if (!isMasterTable(table)) {
    throw new Error(`不正なマスタテーブルです: ${table}`);
  }
  return table;
}

function extraKeys(table: MasterTable): string[] {
  return masterExtraFields(table).map((f) => f.key);
}

/* -------------------- 機械との対応（対応表） -------------------- */

/** レコード ID → 対応機械 ID の一覧 */
function loadMachineLinks(table: MasterTable): Map<number, number[]> {
  const map = new Map<number, number[]>();
  if (!isMachineLinkedMasterTable(table)) return map;
  const link = MACHINE_LINK_TABLES[table];
  const rows = getDb()
    .prepare(`SELECT ${link.column} AS ownerId, machineId FROM ${link.table}`)
    .all() as { ownerId: number; machineId: number }[];
  for (const row of rows) {
    const list = map.get(row.ownerId) ?? [];
    list.push(row.machineId);
    map.set(row.ownerId, list);
  }
  return map;
}

function loadMachineLinksFor(table: MasterTable, id: number): number[] {
  if (!isMachineLinkedMasterTable(table)) return [];
  const link = MACHINE_LINK_TABLES[table];
  const rows = getDb()
    .prepare(`SELECT machineId FROM ${link.table} WHERE ${link.column} = ?`)
    .all(id) as { machineId: number }[];
  return rows.map((r) => r.machineId);
}

/** 対応機械を入れ替える（未指定なら変更しない） */
function replaceMachineLinks(
  table: MasterTable,
  id: number,
  machineIds: readonly number[] | undefined
): void {
  if (!isMachineLinkedMasterTable(table) || machineIds == null) return;
  const link = MACHINE_LINK_TABLES[table];
  const db = getDb();
  const unique = [...new Set(machineIds)].filter((m) => Number.isInteger(m) && m > 0);
  const remove = db.prepare(`DELETE FROM ${link.table} WHERE ${link.column} = ?`);
  const insertLink = db.prepare(
    `INSERT INTO ${link.table} (${link.column}, machineId) VALUES (?, ?)`
  );
  db.transaction(() => {
    remove.run(id);
    for (const machineId of unique) insertLink.run(id, machineId);
  })();
}

/** 追加項目を DB に渡せる値（数値・文字列・null）へ正規化する */
function extraValues(table: MasterTable, input: MasterUpsertInput): (number | string | null)[] {
  return masterExtraFields(table).map((field) => {
    const raw = input.extra?.[field.key];
    if (raw == null || raw === "") return null;
    if (isChoiceField(field)) {
      const text = String(raw).trim();
      return field.options.some((o) => o.value === text) ? text : null;
    }
    if (!isNumberField(field)) {
      return String(raw).trim() || null;
    }
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  });
}

function selectColumns(table: MasterTable): string {
  const cols = ["id"];
  if (isScopedMasterTable(table)) cols.push("scope");
  cols.push("code", "name", "note", ...extraKeys(table), "isActive", "createdAt", "updatedAt");
  return cols.join(", ");
}

export function listAll(table: string, scope?: string | null): MasterRow[] {
  const t = ensureTable(table);
  const scoped = isScopedMasterTable(t);
  const cols = selectColumns(t);
  if (scoped) {
    if (scope && scope.trim()) {
      const rows = getDb()
        .prepare(
          `SELECT ${cols} FROM ${t} WHERE scope = ? ORDER BY code COLLATE NOCASE ASC`
        )
        .all(scope.trim()) as RawRow[];
      return rows.map((r) => toRow(r, t));
    }
    const rows = getDb()
      .prepare(
        `SELECT ${cols} FROM ${t} ORDER BY scope ASC, code COLLATE NOCASE ASC`
      )
      .all() as RawRow[];
    return rows.map((r) => toRow(r, t));
  }
  const rows = getDb()
    .prepare(`SELECT ${cols} FROM ${t} ORDER BY code COLLATE NOCASE ASC`)
    .all() as RawRow[];
  const links = loadMachineLinks(t);
  return rows.map((r) => toRow(r, t, links.get(r.id)));
}

export function findById(table: string, id: number): MasterRow | null {
  const t = ensureTable(table);
  const cols = selectColumns(t);
  const row = getDb()
    .prepare(`SELECT ${cols} FROM ${t} WHERE id = ?`)
    .get(id) as RawRow | undefined;
  return row ? toRow(row, t, loadMachineLinksFor(t, id)) : null;
}

function requireScope(table: MasterTable, input: MasterUpsertInput): string {
  if (!isScopedMasterTable(table)) return "";
  const s = (input.scope ?? "").toString().trim();
  if (!s) throw new Error("このマスタは scope（用途）の指定が必須です。");
  return s;
}

export function insert(table: string, input: MasterUpsertInput): MasterRow {
  const t = ensureTable(table);
  const scoped = isScopedMasterTable(t);
  const keys = extraKeys(t);
  const columns = [
    ...(scoped ? ["scope"] : []),
    "code",
    "name",
    "note",
    ...keys,
    "isActive",
  ];
  const params = [
    ...(scoped ? [requireScope(t, input)] : []),
    input.code,
    input.name,
    input.note ?? null,
    ...extraValues(t, input),
    input.isActive === false ? 0 : 1,
  ];
  const info = getDb()
    .prepare(
      `INSERT INTO ${t} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`
    )
    .run(...params);
  const id = Number(info.lastInsertRowid);
  replaceMachineLinks(t, id, input.machineIds);
  const created = findById(t, id);
  if (!created) throw new Error("作成後の取得に失敗しました。");
  return created;
}

export function update(
  table: string,
  id: number,
  input: MasterUpsertInput
): MasterRow {
  const t = ensureTable(table);
  const scoped = isScopedMasterTable(t);
  const keys = extraKeys(t);
  const assignments = [
    ...(scoped ? ["scope"] : []),
    "code",
    "name",
    "note",
    ...keys,
    "isActive",
  ].map((c) => `${c} = ?`);
  const params = [
    ...(scoped ? [requireScope(t, input)] : []),
    input.code,
    input.name,
    input.note ?? null,
    ...extraValues(t, input),
    input.isActive === false ? 0 : 1,
    id,
  ];
  getDb()
    .prepare(
      `UPDATE ${t}
          SET ${assignments.join(", ")}, updatedAt = datetime('now')
        WHERE id = ?`
    )
    .run(...params);
  replaceMachineLinks(t, id, input.machineIds);
  const found = findById(t, id);
  if (!found) throw new Error("更新後の取得に失敗しました。");
  return found;
}

export function remove(table: string, id: number): void {
  const t = ensureTable(table);
  getDb().prepare(`DELETE FROM ${t} WHERE id = ?`).run(id);
}

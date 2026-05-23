import {
  isMasterTable,
  isScopedMasterTable,
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
}

function toRow(raw: RawRow, scoped: boolean): MasterRow {
  const base: MasterRow = {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    note: raw.note,
    isActive: raw.isActive === 1,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
  if (scoped) {
    base.scope = raw.scope ?? null;
  }
  return base;
}

function ensureTable(table: string): MasterTable {
  if (!isMasterTable(table)) {
    throw new Error(`不正なマスタテーブルです: ${table}`);
  }
  return table;
}

function selectColumns(table: MasterTable): string {
  const baseCols = "id, code, name, note, isActive, createdAt, updatedAt";
  return isScopedMasterTable(table) ? `id, scope, code, name, note, isActive, createdAt, updatedAt` : baseCols;
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
      return rows.map((r) => toRow(r, true));
    }
    const rows = getDb()
      .prepare(
        `SELECT ${cols} FROM ${t} ORDER BY scope ASC, code COLLATE NOCASE ASC`
      )
      .all() as RawRow[];
    return rows.map((r) => toRow(r, true));
  }
  const rows = getDb()
    .prepare(`SELECT ${cols} FROM ${t} ORDER BY code COLLATE NOCASE ASC`)
    .all() as RawRow[];
  return rows.map((r) => toRow(r, false));
}

export function findById(table: string, id: number): MasterRow | null {
  const t = ensureTable(table);
  const scoped = isScopedMasterTable(t);
  const cols = selectColumns(t);
  const row = getDb()
    .prepare(`SELECT ${cols} FROM ${t} WHERE id = ?`)
    .get(id) as RawRow | undefined;
  return row ? toRow(row, scoped) : null;
}

function requireScope(table: MasterTable, input: MasterUpsertInput): string {
  if (!isScopedMasterTable(table)) return "";
  const s = (input.scope ?? "").toString().trim();
  if (!s) throw new Error("このマスタは scope（用途）の指定が必須です。");
  return s;
}

export function insert(table: string, input: MasterUpsertInput): MasterRow {
  const t = ensureTable(table);
  if (isScopedMasterTable(t)) {
    const scope = requireScope(t, input);
    const info = getDb()
      .prepare(
        `INSERT INTO ${t} (scope, code, name, note, isActive) VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        scope,
        input.code,
        input.name,
        input.note ?? null,
        input.isActive === false ? 0 : 1
      );
    const created = findById(t, Number(info.lastInsertRowid));
    if (!created) throw new Error("作成後の取得に失敗しました。");
    return created;
  }
  const info = getDb()
    .prepare(
      `INSERT INTO ${t} (code, name, note, isActive) VALUES (?, ?, ?, ?)`
    )
    .run(
      input.code,
      input.name,
      input.note ?? null,
      input.isActive === false ? 0 : 1
    );
  const created = findById(t, Number(info.lastInsertRowid));
  if (!created) throw new Error("作成後の取得に失敗しました。");
  return created;
}

export function update(
  table: string,
  id: number,
  input: MasterUpsertInput
): MasterRow {
  const t = ensureTable(table);
  if (isScopedMasterTable(t)) {
    const scope = requireScope(t, input);
    getDb()
      .prepare(
        `UPDATE ${t}
            SET scope = ?, code = ?, name = ?, note = ?, isActive = ?, updatedAt = datetime('now')
          WHERE id = ?`
      )
      .run(
        scope,
        input.code,
        input.name,
        input.note ?? null,
        input.isActive === false ? 0 : 1,
        id
      );
  } else {
    getDb()
      .prepare(
        `UPDATE ${t}
            SET code = ?, name = ?, note = ?, isActive = ?, updatedAt = datetime('now')
          WHERE id = ?`
      )
      .run(
        input.code,
        input.name,
        input.note ?? null,
        input.isActive === false ? 0 : 1,
        id
      );
  }
  const found = findById(t, id);
  if (!found) throw new Error("更新後の取得に失敗しました。");
  return found;
}

export function remove(table: string, id: number): void {
  const t = ensureTable(table);
  getDb().prepare(`DELETE FROM ${t} WHERE id = ?`).run(id);
}

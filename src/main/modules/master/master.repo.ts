import {
  isMasterTable,
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
  createdAt: string;
  updatedAt: string;
}

function toRow(raw: RawRow): MasterRow {
  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    note: raw.note,
    isActive: raw.isActive === 1,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function ensureTable(table: string): MasterTable {
  if (!isMasterTable(table)) {
    throw new Error(`不正なマスタテーブルです: ${table}`);
  }
  return table;
}

export function listAll(table: string): MasterRow[] {
  const t = ensureTable(table);
  const rows = getDb()
    .prepare(
      `SELECT id, code, name, note, isActive, createdAt, updatedAt
         FROM ${t}
        ORDER BY code COLLATE NOCASE ASC`
    )
    .all() as RawRow[];
  return rows.map(toRow);
}

export function findById(table: string, id: number): MasterRow | null {
  const t = ensureTable(table);
  const row = getDb()
    .prepare(
      `SELECT id, code, name, note, isActive, createdAt, updatedAt FROM ${t} WHERE id = ?`
    )
    .get(id) as RawRow | undefined;
  return row ? toRow(row) : null;
}

export function insert(table: string, input: MasterUpsertInput): MasterRow {
  const t = ensureTable(table);
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
  const found = findById(t, id);
  if (!found) throw new Error("更新後の取得に失敗しました。");
  return found;
}

export function remove(table: string, id: number): void {
  const t = ensureTable(table);
  getDb().prepare(`DELETE FROM ${t} WHERE id = ?`).run(id);
}

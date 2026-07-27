import type { TechnicalNote } from "@shared/sheetMetalSupport.js";

import { getSheetMetalSupportDb } from "@main/db/sheetMetalSupportConnection.js";

/** 技術ノート（`technical_notes`）の CRUD（論理削除）。 */

interface RawRow {
  id: number;
  part_number: string;
  note_type: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

function toNote(raw: RawRow): TechnicalNote {
  return {
    id: raw.id,
    partNumber: raw.part_number,
    noteType: raw.note_type,
    body: raw.body,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    createdBy: raw.created_by,
    updatedBy: raw.updated_by,
    createdByName: null,
    updatedByName: null,
  };
}

const SELECT_COLS =
  "id, part_number, note_type, body, created_at, updated_at, created_by, updated_by";

export function getById(id: number): TechnicalNote | null {
  const row = getSheetMetalSupportDb()
    .prepare(`SELECT ${SELECT_COLS} FROM technical_notes WHERE id = ?`)
    .get(id) as RawRow | undefined;
  return row ? toNote(row) : null;
}

export function listByPart(partNumber: string): TechnicalNote[] {
  const rows = getSheetMetalSupportDb()
    .prepare(
      `SELECT ${SELECT_COLS}
       FROM technical_notes
       WHERE part_number = ? AND is_active = 1
       ORDER BY updated_at DESC, id DESC`
    )
    .all(partNumber) as RawRow[];
  return rows.map(toNote);
}

export function insert(input: {
  partNumber: string;
  noteType: string | null;
  body: string;
  createdBy: number | null;
}): TechnicalNote {
  const info = getSheetMetalSupportDb()
    .prepare(
      `INSERT INTO technical_notes (part_number, note_type, body, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(input.partNumber, input.noteType, input.body, input.createdBy, input.createdBy);
  const created = getById(Number(info.lastInsertRowid));
  if (!created) throw new Error("技術ノートの作成に失敗しました。");
  return created;
}

export function update(input: {
  id: number;
  noteType: string | null;
  body: string;
  updatedBy: number | null;
}): TechnicalNote {
  const db = getSheetMetalSupportDb();
  const info = db
    .prepare(
      `UPDATE technical_notes
       SET note_type = ?, body = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ? AND is_active = 1`
    )
    .run(input.noteType, input.body, input.updatedBy, input.id);
  if (info.changes === 0) throw new Error("対象の技術ノートが見つかりません。");
  const updated = getById(input.id);
  if (!updated) throw new Error("技術ノートの更新に失敗しました。");
  return updated;
}

/** 論理削除（`is_active = 0`）。 */
export function softDelete(id: number, updatedBy: number | null): void {
  const info = getSheetMetalSupportDb()
    .prepare(
      `UPDATE technical_notes
       SET is_active = 0, updated_by = ?, updated_at = datetime('now')
       WHERE id = ? AND is_active = 1`
    )
    .run(updatedBy, id);
  if (info.changes === 0) throw new Error("対象の技術ノートが見つかりません。");
}

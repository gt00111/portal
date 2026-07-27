import type { RevisionHistory } from "@shared/sheetMetalSupport.js";

import { getSheetMetalSupportDb } from "@main/db/sheetMetalSupportConnection.js";

/**
 * 更新履歴（`revision_histories`）への書き込み・参照。
 * 監査ログのため削除不可（`is_active` を持たない）。加工条件・技術ノート等の
 * 変更時に Service 層が自動記録する（API 経由の任意追加は想定しない）。
 */

export interface RevisionHistoryEntry {
  targetTable: string;
  targetId: number;
  partNumber?: string | null;
  fieldName: string;
  oldValue?: string | null;
  newValue?: string | null;
  changedBy?: number | null;
}

interface RawRow {
  id: number;
  target_table: string;
  target_id: number;
  part_number: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: number | null;
  changed_at: string;
}

export function record(entry: RevisionHistoryEntry): void {
  getSheetMetalSupportDb()
    .prepare(
      `INSERT INTO revision_histories
         (target_table, target_id, part_number, field_name, old_value, new_value, changed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.targetTable,
      entry.targetId,
      entry.partNumber ?? null,
      entry.fieldName,
      entry.oldValue ?? null,
      entry.newValue ?? null,
      entry.changedBy ?? null
    );
}

/** 複数フィールドの変更を一括記録する。 */
export function recordMany(entries: RevisionHistoryEntry[]): void {
  const db = getSheetMetalSupportDb();
  const tx = db.transaction((list: RevisionHistoryEntry[]) => {
    for (const e of list) record(e);
  });
  tx(entries);
}

function toRevisionHistory(raw: RawRow): RevisionHistory {
  return {
    id: raw.id,
    targetTable: raw.target_table,
    targetId: raw.target_id,
    partNumber: raw.part_number,
    fieldName: raw.field_name,
    oldValue: raw.old_value,
    newValue: raw.new_value,
    changedBy: raw.changed_by,
    changedByName: null,
    changedAt: raw.changed_at,
  };
}

export function listByPart(partNumber: string): RevisionHistory[] {
  const rows = getSheetMetalSupportDb()
    .prepare(
      `SELECT id, target_table, target_id, part_number, field_name,
              old_value, new_value, changed_by, changed_at
       FROM revision_histories
       WHERE part_number = ?
       ORDER BY changed_at DESC, id DESC`
    )
    .all(partNumber) as RawRow[];
  return rows.map(toRevisionHistory);
}

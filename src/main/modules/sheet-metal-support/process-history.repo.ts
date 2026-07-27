import type { ProcessHistory } from "@shared/sheetMetalSupport.js";

import { getSheetMetalSupportDb } from "@main/db/sheetMetalSupportConnection.js";

/** 加工履歴（`process_histories`）。テスト加工も本テーブルで管理し、追加・参照のみ。 */

interface RawRow {
  id: number;
  part_number: string;
  processed_at: string | null;
  machine_id: number | null;
  is_test: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
}

function toHistory(raw: RawRow): ProcessHistory {
  return {
    id: raw.id,
    partNumber: raw.part_number,
    processedAt: raw.processed_at,
    machineId: raw.machine_id,
    machineName: null,
    isTest: raw.is_test === 1,
    comment: raw.comment,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    createdBy: raw.created_by,
    createdByName: null,
  };
}

const SELECT_COLS =
  "id, part_number, processed_at, machine_id, is_test, comment, created_at, updated_at, created_by";

export function getById(id: number): ProcessHistory | null {
  const row = getSheetMetalSupportDb()
    .prepare(`SELECT ${SELECT_COLS} FROM process_histories WHERE id = ?`)
    .get(id) as RawRow | undefined;
  return row ? toHistory(row) : null;
}

export function listByPart(partNumber: string): ProcessHistory[] {
  const rows = getSheetMetalSupportDb()
    .prepare(
      `SELECT ${SELECT_COLS}
       FROM process_histories
       WHERE part_number = ? AND is_active = 1
       ORDER BY (processed_at IS NULL), processed_at DESC, id DESC`
    )
    .all(partNumber) as RawRow[];
  return rows.map(toHistory);
}

export function insert(input: {
  partNumber: string;
  processedAt: string | null;
  machineId: number | null;
  isTest: boolean;
  comment: string | null;
  createdBy: number | null;
}): ProcessHistory {
  const info = getSheetMetalSupportDb()
    .prepare(
      `INSERT INTO process_histories
         (part_number, processed_at, machine_id, is_test, comment, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.partNumber,
      input.processedAt,
      input.machineId,
      input.isTest ? 1 : 0,
      input.comment,
      input.createdBy,
      input.createdBy
    );
  const created = getById(Number(info.lastInsertRowid));
  if (!created) throw new Error("加工履歴の作成に失敗しました。");
  return created;
}

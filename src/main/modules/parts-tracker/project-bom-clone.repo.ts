/** §8.5.17.1 リピート案件 BOM コピー */

import { getPartsTrackerDb } from "@main/db/partsTrackerConnection.js";

import {
  applyWeldingRequiredDateToAllLines,
} from "./welding-start-date.repo.js";

export interface CloneBomFromInput {
  targetProjectId: string;
  sourceProjectId: string;
  includeHidden?: boolean;
  replaceExisting?: boolean;
}

export interface CloneBomFromResult {
  insertedCount: number;
  removedCount: number;
}

/** 案件ごとの表示部品行数（is_hidden = 0） */
export function countVisibleLinesByProject(): Map<string, number> {
  const rows = getPartsTrackerDb()
    .prepare(
      `SELECT seisan_project_id, COUNT(*) AS cnt
       FROM project_part_lines
       WHERE is_hidden = 0
       GROUP BY seisan_project_id`
    )
    .all() as Array<{ seisan_project_id: string; cnt: number }>;
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.seisan_project_id, r.cnt);
  }
  return map;
}

export function countVisibleLines(projectId: string): number {
  const row = getPartsTrackerDb()
    .prepare(
      `SELECT COUNT(*) AS cnt FROM project_part_lines
       WHERE seisan_project_id = ? AND is_hidden = 0`
    )
    .get(projectId) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export function countSourceLines(projectId: string, includeHidden: boolean): number {
  const sql = includeHidden
    ? `SELECT COUNT(*) AS cnt FROM project_part_lines WHERE seisan_project_id = ?`
    : `SELECT COUNT(*) AS cnt FROM project_part_lines WHERE seisan_project_id = ? AND is_hidden = 0`;
  const row = getPartsTrackerDb().prepare(sql).get(projectId) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export function cloneBomFrom(input: CloneBomFromInput): CloneBomFromResult {
  const target = (input.targetProjectId ?? "").trim();
  const source = (input.sourceProjectId ?? "").trim();
  if (!target || !source) throw new Error("コピー元・先の案件 ID が必要です。");
  if (target === source) throw new Error("コピー元と先が同じ案件です。");

  const includeHidden = input.includeHidden !== false;
  const ptDb = getPartsTrackerDb();

  const targetExisting = ptDb
    .prepare(`SELECT COUNT(*) AS cnt FROM project_part_lines WHERE seisan_project_id = ?`)
    .get(target) as { cnt: number };
  const hasExisting = (targetExisting?.cnt ?? 0) > 0;
  if (hasExisting && !input.replaceExisting) {
    throw new Error(
      "先案件に既存の部品行があります。全置換する場合は replaceExisting: true を指定してください。"
    );
  }

  const hiddenFilter = includeHidden ? "" : " AND is_hidden = 0";

  const run = ptDb.transaction(() => {
    let removedCount = 0;
    if (hasExisting) {
      const lineIds = ptDb
        .prepare(`SELECT id FROM project_part_lines WHERE seisan_project_id = ?`)
        .all(target) as Array<{ id: number }>;
      if (lineIds.length > 0) {
        const placeholders = lineIds.map(() => "?").join(",");
        const ids = lineIds.map((r) => r.id);
        ptDb
          .prepare(
            `DELETE FROM project_part_line_arrangement_log WHERE line_id IN (${placeholders})`
          )
          .run(...ids);
      }
      const removed = ptDb
        .prepare(`DELETE FROM project_part_lines WHERE seisan_project_id = ?`)
        .run(target);
      removedCount = removed.changes;
    }

    const insertResult = ptDb
      .prepare(
        `INSERT INTO project_part_lines (
          seisan_project_id, part_number, part_name, revision, quantity, source_type, supplier_id,
          lead_time_days, required_date, order_by_date, ordered_at, status, sku_id,
          procurement_lead_time_id, note, sort_order,
          is_arranged, arranged_at, arranged_by_user_name_id, arranged_by_username,
          is_hidden, hidden_at, hidden_by_username, hidden_reason,
          bom_level, assembly_path, parent_assembly_part_number,
          root_product_bom_id, source_product_bom_line_id, import_batch_id
        )
        SELECT
          ?, part_number, part_name, revision, quantity, source_type, supplier_id,
          lead_time_days, required_date, order_by_date, NULL, 'planned', sku_id,
          procurement_lead_time_id, note, sort_order,
          0, NULL, NULL, NULL,
          is_hidden, hidden_at, hidden_by_username, hidden_reason,
          bom_level, assembly_path, parent_assembly_part_number,
          root_product_bom_id, NULL, NULL
        FROM project_part_lines
        WHERE seisan_project_id = ?${hiddenFilter}
        ORDER BY sort_order ASC, id ASC`
      )
      .run(target, source);

    applyWeldingRequiredDateToAllLines(target);

    return {
      insertedCount: insertResult.changes,
      removedCount,
    };
  });

  return run();
}

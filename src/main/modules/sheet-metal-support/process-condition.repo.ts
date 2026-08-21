import type {
  ProcessCondition,
  ProcessConditionBend,
  ProcessConditionBendInput,
  ToolStack,
  ToolStackInput,
  ToolStackItem,
  ToolStackSide,
} from "@shared/sheetMetalSupport.js";
import { isToolStackSide } from "@shared/sheetMetalSupport.js";

import { getSheetMetalSupportDb } from "@main/db/sheetMetalSupportConnection.js";

/**
 * 加工条件（`process_conditions`）＋曲げ順（`process_condition_bends`）＋
 * 金型スタック（`process_condition_stacks`）の CRUD。
 * 品番ごとに 1 件（is_active=1）。曲げ順とスタックは保存時に全置換する。
 */

interface RawCondition {
  id: number;
  part_number: string;
  material: string | null;
  thickness: number | null;
  process_score: number | null;
  work_direction: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  updated_by: number | null;
}

interface RawBend {
  id: number;
  process_condition_id: number;
  bend_sequence: number;
  upper_tool_id: number | null;
  lower_tool_id: number | null;
  machine_id: number | null;
  back_gauge: number | null;
  angle: number | null;
  bend_radius: number | null;
  note: string | null;
}

const CONDITION_COLS =
  "id, part_number, material, thickness, process_score, work_direction, note, created_at, updated_at, created_by, updated_by";

function toBend(raw: RawBend): ProcessConditionBend {
  return {
    id: raw.id,
    bendSequence: raw.bend_sequence,
    upperToolId: raw.upper_tool_id,
    lowerToolId: raw.lower_tool_id,
    machineId: raw.machine_id,
    backGauge: raw.back_gauge,
    angle: raw.angle,
    bendRadius: raw.bend_radius,
    note: raw.note,
    upperToolName: null,
    lowerToolName: null,
    machineName: null,
  };
}

function listBends(processConditionId: number): ProcessConditionBend[] {
  const rows = getSheetMetalSupportDb()
    .prepare(
      `SELECT id, process_condition_id, bend_sequence, upper_tool_id, lower_tool_id,
              machine_id, back_gauge, angle, bend_radius, note
       FROM process_condition_bends
       WHERE process_condition_id = ? AND is_active = 1
       ORDER BY bend_sequence ASC, id ASC`
    )
    .all(processConditionId) as RawBend[];
  return rows.map(toBend);
}

interface RawStack {
  side: string;
  position: number;
  holder_id: number;
}

function emptyStack(): ToolStack {
  return { upper: [], lower: [] };
}

function toStackItem(raw: RawStack): ToolStackItem {
  return {
    position: raw.position,
    holderId: raw.holder_id,
    holderName: null,
  };
}

function listStack(processConditionId: number): ToolStack {
  const rows = getSheetMetalSupportDb()
    .prepare(
      `SELECT side, position, holder_id
       FROM process_condition_stacks
       WHERE process_condition_id = ? AND is_active = 1
       ORDER BY side ASC, position ASC, id ASC`
    )
    .all(processConditionId) as RawStack[];
  const stack = emptyStack();
  for (const row of rows) {
    if (!isToolStackSide(row.side)) continue;
    stack[row.side].push(toStackItem(row));
  }
  return stack;
}

function toCondition(raw: RawCondition): ProcessCondition {
  return {
    id: raw.id,
    partNumber: raw.part_number,
    material: raw.material,
    thickness: raw.thickness,
    processScore: raw.process_score,
    workDirection: raw.work_direction,
    note: raw.note,
    bends: listBends(raw.id),
    stack: listStack(raw.id),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    createdBy: raw.created_by,
    updatedBy: raw.updated_by,
    createdByName: null,
    updatedByName: null,
  };
}

function findRawByPart(partNumber: string): RawCondition | undefined {
  return getSheetMetalSupportDb()
    .prepare(
      `SELECT ${CONDITION_COLS}
       FROM process_conditions
       WHERE part_number = ? AND is_active = 1
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(partNumber) as RawCondition | undefined;
}

export function getByPart(partNumber: string): ProcessCondition | null {
  const raw = findRawByPart(partNumber);
  return raw ? toCondition(raw) : null;
}

export function getById(id: number): ProcessCondition | null {
  const raw = getSheetMetalSupportDb()
    .prepare(`SELECT ${CONDITION_COLS} FROM process_conditions WHERE id = ?`)
    .get(id) as RawCondition | undefined;
  return raw ? toCondition(raw) : null;
}

export interface ProcessConditionSaveFields {
  partNumber: string;
  material: string | null;
  thickness: number | null;
  processScore: number | null;
  workDirection: string | null;
  note: string | null;
  bends: ProcessConditionBendInput[];
  stack: ToolStackInput;
  userNameId: number | null;
}

function replaceBends(
  processConditionId: number,
  bends: ProcessConditionBendInput[],
  userNameId: number | null
): void {
  const db = getSheetMetalSupportDb();
  db.prepare(`DELETE FROM process_condition_bends WHERE process_condition_id = ?`).run(
    processConditionId
  );
  const insertBend = db.prepare(
    `INSERT INTO process_condition_bends
       (process_condition_id, bend_sequence, upper_tool_id, lower_tool_id, machine_id,
        back_gauge, angle, bend_radius, note, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  bends.forEach((b, index) => {
    insertBend.run(
      processConditionId,
      Number.isInteger(b.bendSequence) ? b.bendSequence : index + 1,
      b.upperToolId ?? null,
      b.lowerToolId ?? null,
      b.machineId ?? null,
      b.backGauge ?? null,
      b.angle ?? null,
      b.bendRadius ?? null,
      b.note?.trim() || null,
      userNameId,
      userNameId
    );
  });
}

function replaceStack(
  processConditionId: number,
  stack: ToolStackInput,
  userNameId: number | null
): void {
  const db = getSheetMetalSupportDb();
  db.prepare(`DELETE FROM process_condition_stacks WHERE process_condition_id = ?`).run(
    processConditionId
  );
  const insertRow = db.prepare(
    `INSERT INTO process_condition_stacks
       (process_condition_id, side, position, holder_id, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const sides: ToolStackSide[] = ["upper", "lower"];
  for (const side of sides) {
    const ids = stack[side] ?? [];
    ids.forEach((holderId, index) => {
      insertRow.run(processConditionId, side, index + 1, holderId, userNameId, userNameId);
    });
  }
}

/** 品番ごとに upsert（既存があれば更新、なければ作成）。曲げ順とスタックは全置換。 */
export function save(fields: ProcessConditionSaveFields): ProcessCondition {
  const db = getSheetMetalSupportDb();
  const tx = db.transaction((f: ProcessConditionSaveFields) => {
    const existing = findRawByPart(f.partNumber);
    let conditionId: number;
    if (existing) {
      db.prepare(
        `UPDATE process_conditions
         SET material = ?, thickness = ?, process_score = ?, work_direction = ?, note = ?,
             updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        f.material,
        f.thickness,
        f.processScore,
        f.workDirection,
        f.note,
        f.userNameId,
        existing.id
      );
      conditionId = existing.id;
    } else {
      const info = db
        .prepare(
          `INSERT INTO process_conditions
             (part_number, material, thickness, process_score, work_direction, note, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          f.partNumber,
          f.material,
          f.thickness,
          f.processScore,
          f.workDirection,
          f.note,
          f.userNameId,
          f.userNameId
        );
      conditionId = Number(info.lastInsertRowid);
    }
    replaceBends(conditionId, f.bends, f.userNameId);
    replaceStack(conditionId, f.stack, f.userNameId);
    return conditionId;
  });
  const id = tx(fields);
  const saved = getById(id);
  if (!saved) throw new Error("加工条件の保存に失敗しました。");
  return saved;
}

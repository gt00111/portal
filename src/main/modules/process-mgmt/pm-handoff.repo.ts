import { getProcessMgmtDb } from "@main/db/processMgmtConnection.js";
import type { PmHandoffEvent } from "@shared/processMgmtParallel.js";

const HANDOFF_NOTE_MAX = 2000;

type DbHandoffRow = {
  id: number;
  seisan_project_id: string;
  sw_task_id: number;
  batch_no: number;
  handoff_at: string;
  handoff_by_username: string;
  note: string;
};

function mapRow(row: DbHandoffRow): PmHandoffEvent {
  return {
    id: row.id,
    seisanProjectId: row.seisan_project_id,
    swTaskId: row.sw_task_id,
    batchNo: row.batch_no,
    handoffAt: row.handoff_at,
    handoffByUsername: row.handoff_by_username,
    note: row.note,
  };
}

export function validateHandoffNote(note: string): string {
  const n = note.trim();
  if (!n) throw new Error("引渡しメモを入力してください。");
  if (n.length > HANDOFF_NOTE_MAX) {
    throw new Error(`引渡しメモは ${HANDOFF_NOTE_MAX} 文字以内にしてください。`);
  }
  return n;
}

export function countHandoffsBetween(startIso: string, endIso: string): number {
  const db = getProcessMgmtDb();
  const row = db
    .prepare(
      `
        SELECT COUNT(*) AS n FROM pm_handoff_events
        WHERE handoff_at >= ? AND handoff_at < ?
      `
    )
    .get(startIso, endIso) as { n: number };
  return row.n;
}

export function countHandoffsInCurrentMonth(now = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return countHandoffsBetween(start.toISOString(), end.toISOString());
}

export function countHandoffs(seisanProjectId: string): number {
  const db = getProcessMgmtDb();
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM pm_handoff_events WHERE seisan_project_id = ?`)
    .get(seisanProjectId) as { n: number };
  return row.n;
}

export function getLatestHandoff(seisanProjectId: string): PmHandoffEvent | null {
  const db = getProcessMgmtDb();
  const row = db
    .prepare(
      `
        SELECT * FROM pm_handoff_events
        WHERE seisan_project_id = ?
        ORDER BY batch_no DESC
        LIMIT 1
      `
    )
    .get(seisanProjectId) as DbHandoffRow | undefined;
  return row ? mapRow(row) : null;
}

export function listHandoffsByProject(seisanProjectId: string): PmHandoffEvent[] {
  const db = getProcessMgmtDb();
  const rows = db
    .prepare(
      `
        SELECT * FROM pm_handoff_events
        WHERE seisan_project_id = ?
        ORDER BY batch_no ASC
      `
    )
    .all(seisanProjectId) as DbHandoffRow[];
  return rows.map(mapRow);
}

export function insertHandoff(
  seisanProjectId: string,
  swTaskId: number,
  note: string,
  byUsername: string
): PmHandoffEvent {
  const db = getProcessMgmtDb();
  const validated = validateHandoffNote(note);
  const count = countHandoffs(seisanProjectId);
  const batchNo = count + 1;
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `
        INSERT INTO pm_handoff_events (
          seisan_project_id, sw_task_id, batch_no, handoff_at, handoff_by_username, note
        ) VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(seisanProjectId, swTaskId, batchNo, now, byUsername.trim(), validated);
  const id = Number(result.lastInsertRowid);
  const row = db.prepare(`SELECT * FROM pm_handoff_events WHERE id = ?`).get(id) as DbHandoffRow;
  return mapRow(row);
}

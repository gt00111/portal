import { getProcessMgmtDb } from "@main/db/processMgmtConnection.js";
import type { PmWorkMode } from "@shared/processMgmtParallel.js";

type MetaRow = {
  seisan_project_id: string;
  work_mode: string;
  work_mode_note: string;
  work_mode_changed_at: string | null;
  work_mode_changed_by_username: string;
};

export function getWorkMode(seisanProjectId: string): PmWorkMode {
  const id = seisanProjectId.trim();
  if (!id) return "sequential";
  const db = getProcessMgmtDb();
  const row = db
    .prepare(`SELECT work_mode FROM pm_seisan_project_meta WHERE seisan_project_id = ?`)
    .get(id) as { work_mode: string } | undefined;
  return row?.work_mode === "parallel" ? "parallel" : "sequential";
}

export function setWorkMode(
  seisanProjectId: string,
  workMode: PmWorkMode,
  note: string,
  changedBy: string
): void {
  const id = seisanProjectId.trim();
  if (!id) throw new Error("案件 ID が無効です。");
  if (workMode !== "sequential" && workMode !== "parallel") {
    throw new Error("作業モードが不正です。");
  }
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  const n = (note ?? "").trim();
  db.prepare(
    `
      INSERT INTO pm_seisan_project_meta (
        seisan_project_id, work_mode, work_mode_note, work_mode_changed_at, work_mode_changed_by_username
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(seisan_project_id) DO UPDATE SET
        work_mode = excluded.work_mode,
        work_mode_note = excluded.work_mode_note,
        work_mode_changed_at = excluded.work_mode_changed_at,
        work_mode_changed_by_username = excluded.work_mode_changed_by_username
    `
  ).run(id, workMode, n, now, changedBy.trim());
}

export function listMetaRows(): MetaRow[] {
  const db = getProcessMgmtDb();
  return db.prepare(`SELECT * FROM pm_seisan_project_meta`).all() as MetaRow[];
}

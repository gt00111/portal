import { getProcessMgmtDb } from "@main/db/processMgmtConnection.js";
import { getSeisanDb } from "@main/db/seisanConnection.js";
import * as seisanProjects from "@main/seisan/repos/projects.repo.js";
import type { PmGanttDurationChange, PmGanttSyncResult } from "@shared/processMgmtParallel.js";
import { PM_PARALLEL_RECOMMEND_MAX_DAYS } from "@shared/processMgmtParallel.js";

import { getGanttTemplateMapping } from "./pm-gantt-settings.repo.js";

function calendarDaysBetween(start: string, end: string): number | null {
  const s = start?.trim();
  const e = end?.trim();
  if (!s || !e) return null;
  const sd = new Date(`${s}T00:00:00`);
  const ed = new Date(`${e}T00:00:00`);
  if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return null;
  const diff = Math.floor((ed.getTime() - sd.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

export function readCurrentGanttDurations(seisanProjectId: string): {
  swDays: number | null;
  cadmacDays: number | null;
} {
  const seisan = getSeisanDb();
  const rows = seisan
    .prepare(
      `
        SELECT t.start_date, t.end_date, pt.name AS template_name
        FROM tasks t
        LEFT JOIN process_templates pt ON t.process_template_id = pt.id
        WHERE t.project_id = ? AND t.parent_task_id IS NOT NULL
      `
    )
    .all(seisanProjectId) as { start_date: string; end_date: string; template_name: string | null }[];

  const { swTemplateName, cadmacTemplateName } = getGanttTemplateMapping();
  let swDays: number | null = null;
  let cadmacDays: number | null = null;
  for (const row of rows) {
    const days = calendarDaysBetween(row.start_date, row.end_date);
    if (days == null) continue;
    if (row.template_name === swTemplateName) swDays = days;
    if (row.template_name === cadmacTemplateName) cadmacDays = days;
  }
  return { swDays, cadmacDays };
}

type CacheRow = {
  swDays: number | null;
  cadmacDays: number | null;
  notifiedSwDays: number | null;
  notifiedCadmacDays: number | null;
};

function getCached(seisanProjectId: string): CacheRow | null {
  const db = getProcessMgmtDb();
  const row = db
    .prepare(
      `SELECT sw_days, cadmac_days, notified_sw_days, notified_cadmac_days
       FROM pm_gantt_duration_cache WHERE seisan_project_id = ?`
    )
    .get(seisanProjectId) as {
      sw_days: number | null;
      cadmac_days: number | null;
      notified_sw_days: number | null;
      notified_cadmac_days: number | null;
    } | undefined;
  if (!row) return null;
  return {
    swDays: row.sw_days,
    cadmacDays: row.cadmac_days,
    notifiedSwDays: row.notified_sw_days,
    notifiedCadmacDays: row.notified_cadmac_days,
  };
}

function upsertCache(
  seisanProjectId: string,
  swDays: number | null,
  cadmacDays: number | null,
  opts?: { updateNotified?: boolean }
): void {
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  if (opts?.updateNotified) {
    db.prepare(
      `
        INSERT INTO pm_gantt_duration_cache (
          seisan_project_id, sw_days, cadmac_days, notified_sw_days, notified_cadmac_days, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(seisan_project_id) DO UPDATE SET
          sw_days = excluded.sw_days,
          cadmac_days = excluded.cadmac_days,
          notified_sw_days = excluded.notified_sw_days,
          notified_cadmac_days = excluded.notified_cadmac_days,
          synced_at = excluded.synced_at
      `
    ).run(seisanProjectId, swDays, cadmacDays, swDays, cadmacDays, now);
    return;
  }
  db.prepare(
    `
      INSERT INTO pm_gantt_duration_cache (seisan_project_id, sw_days, cadmac_days, synced_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(seisan_project_id) DO UPDATE SET
        sw_days = excluded.sw_days,
        cadmac_days = excluded.cadmac_days,
        synced_at = excluded.synced_at
    `
  ).run(seisanProjectId, swDays, cadmacDays, now);
}

export function markGanttNotified(seisanProjectId: string, swDays: number | null, cadmacDays: number | null): void {
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  db.prepare(
    `
      UPDATE pm_gantt_duration_cache
      SET notified_sw_days = ?, notified_cadmac_days = ?, synced_at = ?
      WHERE seisan_project_id = ?
    `
  ).run(swDays, cadmacDays, now, seisanProjectId);
}

export function listProjectsNeedingGanttNotify(
  changes: PmGanttDurationChange[]
): PmGanttDurationChange[] {
  return changes.filter((ch) => {
    const cached = getCached(ch.seisanProjectId);
    if (!cached) return true;
    return (
      cached.notifiedSwDays !== ch.currentSwDays || cached.notifiedCadmacDays !== ch.currentCadmacDays
    );
  });
}

export function isParallelRecommend(swDays: number | null, cadmacDays: number | null): boolean {
  if (swDays == null || cadmacDays == null) return false;
  return swDays <= PM_PARALLEL_RECOMMEND_MAX_DAYS && cadmacDays <= PM_PARALLEL_RECOMMEND_MAX_DAYS;
}

function listLinkedSeisanProjectIds(): string[] {
  const db = getProcessMgmtDb();
  const rows = db
    .prepare(`SELECT DISTINCT seisan_project_id FROM tasks WHERE seisan_project_id IS NOT NULL`)
    .all() as { seisan_project_id: string }[];
  return rows.map((r) => r.seisan_project_id);
}

function daysChanged(a: number | null, b: number | null): boolean {
  return a !== b;
}

export function syncGanttDurations(acknowledge: boolean): PmGanttSyncResult {
  const changes: PmGanttDurationChange[] = [];
  const ids = listLinkedSeisanProjectIds();
  for (const seisanProjectId of ids) {
    const current = readCurrentGanttDurations(seisanProjectId);
    const cached = getCached(seisanProjectId);
    const prevSw = cached?.swDays ?? null;
    const prevCad = cached?.cadmacDays ?? null;
    const hasCache = cached != null;
    if (
      hasCache &&
      (daysChanged(prevSw, current.swDays) || daysChanged(prevCad, current.cadmacDays))
    ) {
      const sp = seisanProjects.get(seisanProjectId);
      changes.push({
        seisanProjectId,
        projectName: sp?.project_name ?? sp?.project_no ?? seisanProjectId,
        seisanProjectNo: sp?.project_no ?? null,
        previousSwDays: prevSw,
        previousCadmacDays: prevCad,
        currentSwDays: current.swDays,
        currentCadmacDays: current.cadmacDays,
      });
    }
    if (acknowledge) {
      upsertCache(seisanProjectId, current.swDays, current.cadmacDays, { updateNotified: true });
    } else if (!hasCache) {
      upsertCache(seisanProjectId, current.swDays, current.cadmacDays);
    }
  }
  return { changes, acknowledged: acknowledge };
}

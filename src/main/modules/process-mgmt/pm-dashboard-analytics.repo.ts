import {
  buildDashboardAnalytics,
  getLocalMonthRange,
  PM_DASHBOARD_STALE_DAYS_DEFAULT,
  type PmDashboardAnalytics,
} from "@shared/processMgmtDashboard.js";
import type { PmBoardTask } from "@shared/processMgmt.js";

import * as handoff from "./pm-handoff.repo.js";
import * as parallel from "./pm-parallel.repo.js";
import { enrichBoardRow } from "./pm-tasks.repo.js";
import { getProcessMgmtDb } from "@main/db/processMgmtConnection.js";

const TASK_SELECT = `
  t.id, t.project_id, t.seisan_project_id, t.title, t.description, t.process_type, t.status,
  t.assignee, t.assignee_user_name_id, t.progress_percent, t.progress_note, t.started_at, t.completed_at,
  t.completion_undo_reason, t.completion_undo_at, t.completion_undo_by,
  t.active_batch_no, t.created_at, t.updated_at
`;

function listCompletedTasksInMonth(now = new Date()): PmBoardTask[] {
  const { start, end } = getLocalMonthRange(now);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const db = getProcessMgmtDb();
  const rows = db
    .prepare(
      `
        SELECT
          ${TASK_SELECT},
          p.name AS legacy_name,
          p.client AS legacy_client,
          p.drawing_number AS legacy_drawing_number,
          p.revision AS legacy_revision,
          p.note AS legacy_note
        FROM tasks t
        LEFT JOIN projects p ON t.seisan_project_id IS NULL AND p.id = t.project_id
        WHERE t.status = '完了'
          AND t.completed_at >= ?
          AND t.completed_at < ?
          AND t.process_type IN ('solidworks', 'cadmac', 'general')
        ORDER BY t.completed_at DESC, t.id DESC
      `
    )
    .all(startIso, endIso) as Parameters<typeof enrichBoardRow>[0][];
  return rows.map(enrichBoardRow);
}

export function getDashboardAnalytics(staleDays = PM_DASHBOARD_STALE_DAYS_DEFAULT): PmDashboardAnalytics {
  const active = parallel.enrichBoardTasks(
    listAllActiveBoardTasks()
  );
  const completedThisMonth = listCompletedTasksInMonth();
  const handoffCount = handoff.countHandoffsInCurrentMonth();
  return buildDashboardAnalytics(active, completedThisMonth, handoffCount, staleDays);
}

function listAllActiveBoardTasks(): PmBoardTask[] {
  const db = getProcessMgmtDb();
  const cadmacGateSql = `(
    t.process_type != 'cadmac' OR (
      (t.seisan_project_id IS NOT NULL AND (
        EXISTS (
          SELECT 1 FROM tasks sw
          WHERE sw.seisan_project_id = t.seisan_project_id
            AND sw.process_type = 'solidworks' AND sw.status = '完了'
        )
        OR (
          COALESCE(
            (SELECT work_mode FROM pm_seisan_project_meta m WHERE m.seisan_project_id = t.seisan_project_id),
            'sequential'
          ) = 'parallel'
          AND EXISTS (
            SELECT 1 FROM pm_handoff_events h
            WHERE h.seisan_project_id = t.seisan_project_id
          )
        )
      ))
      OR
      (t.seisan_project_id IS NULL AND EXISTS (
        SELECT 1 FROM tasks sw
        WHERE sw.project_id = t.project_id
          AND sw.process_type = 'solidworks' AND sw.status = '完了'
      ))
    )
  )`;

  const rows = db
    .prepare(
      `
        SELECT
          ${TASK_SELECT},
          p.name AS legacy_name,
          p.client AS legacy_client,
          p.drawing_number AS legacy_drawing_number,
          p.revision AS legacy_revision,
          p.note AS legacy_note
        FROM tasks t
        LEFT JOIN projects p ON t.seisan_project_id IS NULL AND p.id = t.project_id
        WHERE t.status != '完了'
          AND t.process_type IN ('solidworks', 'cadmac', 'general')
          AND ${cadmacGateSql}
        ORDER BY t.updated_at DESC, t.id DESC
      `
    )
    .all() as Parameters<typeof enrichBoardRow>[0][];
  return rows.map(enrichBoardRow);
}

import { getProcessMgmtDb } from "@main/db/processMgmtConnection.js";
import type { PmBoardTask, PmTask } from "@shared/processMgmt.js";
import type { PmWorkMode } from "@shared/processMgmtParallel.js";

import * as gantt from "./pm-gantt-sync.repo.js";
import * as handoff from "./pm-handoff.repo.js";
import * as meta from "./pm-project-meta.repo.js";
import * as support from "./pm-support.repo.js";

import { getTaskDetail } from "./pm-tasks.repo.js";

export function getSwTaskForProjectSync(seisanProjectId: string): PmTask | null {
  const db = getProcessMgmtDb();
  const row = db
    .prepare(
      `SELECT id FROM tasks WHERE seisan_project_id = ? AND process_type = 'solidworks' LIMIT 1`
    )
    .get(seisanProjectId) as { id: number } | undefined;
  if (!row) return null;
  return getTaskDetail(row.id);
}

export function getCadTaskForProjectSync(seisanProjectId: string): PmTask | null {
  const db = getProcessMgmtDb();
  const row = db
    .prepare(
      `SELECT id FROM tasks WHERE seisan_project_id = ? AND process_type = 'cadmac' LIMIT 1`
    )
    .get(seisanProjectId) as { id: number } | undefined;
  if (!row) return null;
  return getTaskDetail(row.id);
}

export function enrichBoardTask(task: PmBoardTask): PmBoardTask {
  if (!task.seisanProjectId) return task;
  const sid = task.seisanProjectId;
  const workMode: PmWorkMode = meta.getWorkMode(sid);
  const latest = handoff.getLatestHandoff(sid);
  const handoffCount = handoff.countHandoffs(sid);
  const durations = gantt.readCurrentGanttDurations(sid);
  const parallelRecommend = gantt.isParallelRecommend(durations.swDays, durations.cadmacDays);

  let supportAssignees =
    task.processType === "solidworks" ? support.listSupportAssignees(task.id) : [];
  const supportProgressList =
    task.processType === "solidworks" ? support.listSupportProgressForTask(task.id) : [];
  const supportAssigneeSummary =
    supportAssignees.length > 0
      ? supportAssignees.map((s) => s.username).filter(Boolean).join("・")
      : "";

  let swStatus: string | null = null;
  if (task.processType === "cadmac") {
    const sw = getSwTaskForProjectSync(sid);
    swStatus = sw?.status ?? null;
  }

  return {
    ...task,
    workMode,
    latestBatchNo: latest?.batchNo ?? null,
    latestBatchNote: latest?.note ?? null,
    handoffCount,
    parallelRecommend,
    supportAssignees,
    supportAssigneeSummary,
    supportProgressList,
    swStatus,
  };
}

export function enrichBoardTasks(tasks: PmBoardTask[]): PmBoardTask[] {
  return tasks.map(enrichBoardTask);
}

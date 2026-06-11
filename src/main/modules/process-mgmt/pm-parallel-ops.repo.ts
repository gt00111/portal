import type { PmBoardTask } from "@shared/processMgmt.js";
import type { PmGanttDurationChange, PmHandoffEvent, PmWorkMode } from "@shared/processMgmtParallel.js";

import * as gantt from "./pm-gantt-sync.repo.js";
import * as handoff from "./pm-handoff.repo.js";
import * as meta from "./pm-project-meta.repo.js";
import * as notifications from "./pm-notifications.repo.js";
import * as parallel from "./pm-parallel.repo.js";
import * as tasks from "./pm-tasks.repo.js";

function formatDays(v: number | null): string {
  return v == null ? "—" : `${v}日`;
}

export function handoffToCadmac(swTaskId: number, note: string, byUsername: string): PmHandoffEvent {
  const sw = tasks.getTaskDetail(swTaskId);
  if (sw.processType !== "solidworks") {
    throw new Error("SolidWorks 工程タスクのみ引渡しできます。");
  }
  if (!sw.seisanProjectId) {
    throw new Error("生産ボード案件と紐づいていないため引渡しできません。");
  }
  const mode = meta.getWorkMode(sw.seisanProjectId);
  if (mode !== "parallel") {
    throw new Error("並行モードの案件のみ CADMAC へ引渡しできます。");
  }
  const event = handoff.insertHandoff(sw.seisanProjectId, swTaskId, note, byUsername);
  const cad = parallel.getCadTaskForProjectSync(sw.seisanProjectId);
  if (cad) {
    tasks.applyCadHandoffPause(cad.id, event.batchNo);
    const board = tasks.getBoardTaskById(cad.id);
    if (board.assignee.trim()) {
      const msg = `バッチ${event.batchNo} が引渡されました: ${event.note}`;
      notifications.insertInnerNotifications(
        [board.assignee],
        cad.id,
        "handoff",
        {
          kind: "handoff",
          message: msg,
          projectName: board.projectName,
          title: board.title,
          processType: board.processType,
          client: board.client,
          drawingNumber: board.drawingNumber,
          revision: board.revision,
          assignee: board.assignee,
          seisanProjectNo: board.seisanProjectNo,
          batchNo: event.batchNo,
        },
        byUsername,
        event.handoffAt
      );
    }
  }
  return event;
}

export function setProjectWorkMode(
  seisanProjectId: string,
  workMode: PmWorkMode,
  note: string,
  changedBy: string
): void {
  const sw = parallel.getSwTaskForProjectSync(seisanProjectId);
  if (!sw) throw new Error("SolidWorks 工程タスクが見つかりません。");
  meta.setWorkMode(seisanProjectId, workMode, note, changedBy);
}

export function notifyGanttDurationChanges(changes: PmGanttDurationChange[], actor: string): void {
  const now = new Date().toISOString();
  for (const ch of changes) {
    const sw = parallel.getSwTaskForProjectSync(ch.seisanProjectId);
    const cad = parallel.getCadTaskForProjectSync(ch.seisanProjectId);
    const recipients = [...new Set([sw?.assignee, cad?.assignee].map((u) => (u ?? "").trim()).filter(Boolean))];
    if (recipients.length === 0) continue;
    const taskId = cad?.id ?? sw?.id ?? 0;
    if (!taskId) continue;
    const board: PmBoardTask =
      cad != null ? tasks.getBoardTaskById(cad.id) : tasks.getBoardTaskById(sw!.id);
    const msg = `ガント日程が更新されました。設計 ${formatDays(ch.previousSwDays)}→${formatDays(ch.currentSwDays)} / レーザー ${formatDays(ch.previousCadmacDays)}→${formatDays(ch.currentCadmacDays)}`;
    notifications.insertInnerNotifications(
      recipients,
      taskId,
      "gantt_duration",
      {
        kind: "gantt_duration",
        message: msg,
        projectName: ch.projectName,
        title: board.title,
        processType: board.processType,
        client: board.client,
        drawingNumber: board.drawingNumber,
        revision: board.revision,
        assignee: board.assignee,
        seisanProjectNo: ch.seisanProjectNo,
      },
      actor,
      now
    );
  }
}

export function syncGanttWithNotifications(acknowledge: boolean, actor: string) {
  const result = gantt.syncGanttDurations(acknowledge);
  if (!acknowledge && result.changes.length > 0) {
    const toNotify = gantt.listProjectsNeedingGanttNotify(result.changes);
    if (toNotify.length > 0) {
      notifyGanttDurationChanges(toNotify, actor);
      for (const ch of toNotify) {
        gantt.markGanttNotified(ch.seisanProjectId, ch.currentSwDays, ch.currentCadmacDays);
      }
    }
  }
  return result;
}

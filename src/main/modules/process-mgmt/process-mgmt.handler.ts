import type { IpcMain } from "electron";

import { getAppRole } from "@shared/auth.js";
import {
  canEditPmTaskLifecycle,
  canProxyPmSwParallelOps,
  canStartPmTask,
} from "@shared/processMgmtPermissions.js";
import { fail, ok } from "@shared/ipcResponse.js";
import type { PmBoardTask, PmProject, PmTask, PmTaskCompletionNotification } from "@shared/processMgmt.js";
import {
  PM_DASHBOARD_STALE_DAYS_DEFAULT,
  type PmDashboardAnalytics,
} from "@shared/processMgmtDashboard.js";
import type {
  PmGanttTemplateMapping,
  PmHandoffEvent,
  PmGanttSyncResult,
  PmSupportAssignee,
  PmWorkMode,
} from "@shared/processMgmtParallel.js";
import type { SessionUser } from "@shared/types.js";

import {
  assertAppRoleAtLeast,
  assertCanWriteProcessMgmtTasks,
  assertCanWriteApp,
  assertCanViewApp,
  assertLoggedIn,
} from "@main/auth-guard.js";
import { getProcessMgmtDbPath } from "@main/db/processMgmtConnection.js";
import {
  listGroupAdminUsernamesForGroupName,
  listGroupMembers,
  loadGroupMembershipForUser,
} from "@main/db/userAccessQueries.js";
import * as seisanProjects from "@main/seisan/repos/projects.repo.js";
import { ensureProcessMgmt } from "@main/process-mgmt-guard.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";

import type { CreatePmProjectPayload, UpdatePmProjectPayload } from "./pm-projects.repo.js";
import * as projects from "./pm-projects.repo.js";
import * as notifications from "./pm-notifications.repo.js";
import * as handoffRepo from "./pm-handoff.repo.js";
import * as parallelOps from "./pm-parallel-ops.repo.js";
import * as parallel from "./pm-parallel.repo.js";
import * as ganttSettings from "./pm-gantt-settings.repo.js";
import * as support from "./pm-support.repo.js";
import * as sync from "./pm-seisan-sync.repo.js";
import type {
  CreatePmTaskPayload,
  ListPmBoardPayload,
  UpdatePmTaskPayload,
  UpdatePmTaskStatusPayload,
} from "./pm-tasks.repo.js";
import * as dashboardAnalytics from "./pm-dashboard-analytics.repo.js";
import * as tasks from "./pm-tasks.repo.js";
import type { PmSupportUserCandidate } from "./pm-support.repo.js";

function assertCanEditProgressNote(task: PmTask, session: SessionUser): void {
  if (getAppRole(session, "process-management") === "admin") return;
  if (task.assignee.trim() === session.username.trim()) return;
  if (
    task.processType === "solidworks" &&
    support.isSupportAssignee(task.id, session.username, session.userNameId ?? null)
  ) {
    return;
  }
  throw new Error("ユーザーまたは工程管理の管理者のみ進捗（％とメモ）を更新できます。");
}

function assertCanStartPmTask(task: PmTask, session: SessionUser): void {
  if (canStartPmTask(session, task.assignee)) return;
  throw new Error("このタスクの主担当のみ作業を開始できます。");
}

function assertTaskPrimaryAssigneeOrAdmin(task: PmTask, session: SessionUser): void {
  if (canEditPmTaskLifecycle(session, task.assignee)) return;
  throw new Error("このタスクの主担当のみ完了・一時中断・再開ができます。");
}

function assertSwPrimaryEditorOrAdmin(swTask: PmTask, session: SessionUser): void {
  if (canProxyPmSwParallelOps(session)) return;
  if (swTask.processType !== "solidworks") {
    throw new Error("SolidWorks 工程の主担当のみ操作できます。");
  }
  if (swTask.assignee.trim() !== session.username.trim()) {
    throw new Error("SolidWorks 工程の主担当のみ操作できます。");
  }
}

function listCompletionNotifyRecipients(
  seisanProjectId: string | null,
  completer: string
): string[] {
  if (!seisanProjectId?.trim()) return [];
  const project = seisanProjects.get(seisanProjectId);
  const groupName = (project?.group_name ?? project?.group_id ?? "").trim();
  if (!groupName) return [];
  return listGroupAdminUsernamesForGroupName(groupName).filter((u) => u !== completer);
}

function filterBoardTasks(list: PmBoardTask[], query: string, client: string): PmBoardTask[] {
  const c = client.trim();
  const q = query.trim().toLowerCase();
  return list.filter((t) => {
    if (c && t.client.trim() !== c) return false;
    if (!q) return true;
    const hay = [t.projectName, t.drawingNumber, t.title, t.note, t.seisanProjectNo ?? "", String(t.progressPercent)]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("process-mgmt:status", async () => {
    try {
      assertLoggedIn();
      const path = getProcessMgmtDbPath();
      return ok<{ connected: boolean; path: string | null }>({
        connected: path !== null,
        path,
      });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:project:list", async () => {
    try {
      assertLoggedIn();
      ensureProcessMgmt();
      return ok<PmProject[]>(projects.listProjects());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:project:create", async (_event, payload: CreatePmProjectPayload) => {
    try {
      assertCanWriteApp("process-management");
      ensureProcessMgmt();
      return ok<PmProject>(projects.createProject(payload ?? { name: "" }));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:project:getDetail", async (_event, payload: { id: number }) => {
    try {
      assertLoggedIn();
      ensureProcessMgmt();
      return ok<PmProject>(projects.getProjectDetail(payload?.id ?? 0));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:project:update", async (_event, payload: UpdatePmProjectPayload) => {
    try {
      assertCanWriteApp("process-management");
      ensureProcessMgmt();
      return ok<PmProject>(projects.updateProject(payload));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:project:delete", async (_event, payload: { id: number }) => {
    try {
      assertCanWriteApp("process-management");
      ensureProcessMgmt();
      return ok(projects.deleteProject(payload?.id ?? 0));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:task:listByProject", async (_event, payload: { projectId: number }) => {
    try {
      const session = assertCanViewApp("process-management");
      ensureProcessMgmt();
      return ok<PmTask[]>(tasks.listTasksByProject(payload?.projectId ?? 0, session.processView));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:task:listMy", async () => {
    try {
      const session = assertCanViewApp("process-management");
      ensureSeisanSatellite();
      ensureProcessMgmt();
      sync.syncDefaultProcessTasksFromSeisan();
      const raw = support.listMyTasksWithSupport(session.username, session.processView);
      return ok<PmBoardTask[]>(parallel.enrichBoardTasks(raw));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "process-mgmt:task:updateProgressNote",
    async (_event, payload: { id: number; progressNote: string; progressPercent: number }) => {
      try {
        const session = assertLoggedIn();
        ensureProcessMgmt();
        const id = Number(payload?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        const existing = tasks.getTaskDetail(id);
        tasks.assertTaskMatchesProcessView(existing, session.processView);
        const note = (payload?.progressNote ?? "").toString();
        const pct = Number(payload?.progressPercent);
        if (existing.processType === "solidworks") {
          const isSupport = support.isSupportAssignee(
            id,
            session.username,
            session.userNameId ?? null
          );
          if (isSupport && existing.assignee.trim() !== session.username.trim()) {
            if (session.userNameId == null) throw new Error("補助担当のユーザー ID が不明です。");
            support.updateSupportProgress(id, session.userNameId, pct, note);
            return ok<PmTask>(tasks.getTaskDetail(id));
          }
        }
        assertCanEditProgressNote(existing, session);
        return ok<PmTask>(tasks.updateProgressNote(id, note, pct));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("process-mgmt:task:create", async (_event, payload: CreatePmTaskPayload) => {
    try {
      const session = assertCanWriteApp("process-management");
      ensureProcessMgmt();
      tasks.assertProcessTypeAllowedForView(payload?.processType ?? "general", session.processView);
      return ok<PmTask>(tasks.createTask(payload));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:task:updateStatus", async (_event, payload: UpdatePmTaskStatusPayload) => {
    try {
      const session = assertCanWriteApp("process-management");
      ensureProcessMgmt();
      const existing = tasks.getTaskDetail(payload.id);
      tasks.assertTaskMatchesProcessView(existing, session.processView);
      return ok<PmTask>(tasks.updateTaskStatus(payload));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:task:getDetail", async (_event, payload: { id: number }) => {
    try {
      const session = assertLoggedIn();
      ensureProcessMgmt();
      const task = tasks.getTaskDetail(payload?.id ?? 0);
      tasks.assertTaskMatchesProcessView(task, session.processView);
      return ok<PmTask>(task);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:task:update", async (_event, payload: UpdatePmTaskPayload) => {
    try {
      const session = assertCanWriteApp("process-management");
      ensureProcessMgmt();
      const existing = tasks.getTaskDetail(payload.id);
      tasks.assertTaskMatchesProcessView(existing, session.processView);
      return ok<PmTask>(tasks.updateTask(payload));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:task:delete", async (_event, payload: { id: number }) => {
    try {
      const session = assertCanWriteApp("process-management");
      ensureProcessMgmt();
      const existing = tasks.getTaskDetail(payload?.id ?? 0);
      tasks.assertTaskMatchesProcessView(existing, session.processView);
      return ok(tasks.deleteTask(payload?.id ?? 0));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:task:listBoard", async (_event, payload: ListPmBoardPayload) => {
    try {
      const session = assertCanViewApp("process-management");
      ensureSeisanSatellite();
      ensureProcessMgmt();
      sync.syncDefaultProcessTasksFromSeisan();
      const pl = payload ?? { mode: "active" as const };
      const list = parallel.enrichBoardTasks(tasks.listBoardTasks(pl, session.processView));
      return ok<PmBoardTask[]>(filterBoardTasks(list, pl.query ?? "", pl.client ?? ""));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:task:start", async (_event, payload: { id: number }) => {
    try {
      const session = assertCanWriteProcessMgmtTasks();
      ensureProcessMgmt();
      const existing = tasks.getTaskDetail(payload?.id ?? 0);
      tasks.assertTaskMatchesProcessView(existing, session.processView);
      assertCanStartPmTask(existing, session);
      const username = session.username ?? "";
      const userNameId = session.userNameId ?? null;
      return ok<PmTask>(tasks.startTask(payload?.id ?? 0, username, userNameId));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:task:complete", async (_event, payload: { id: number }) => {
    try {
      const session = assertCanWriteProcessMgmtTasks();
      ensureProcessMgmt();
      const existing = tasks.getTaskDetail(payload?.id ?? 0);
      tasks.assertTaskMatchesProcessView(existing, session.processView);
      assertTaskPrimaryAssigneeOrAdmin(existing, session);
      const completed = tasks.completeTask(payload?.id ?? 0);
      const boardTask = tasks.getBoardTaskById(completed.id);
      const completer = (session.username ?? "").trim();
      const recipients = listCompletionNotifyRecipients(completed.seisanProjectId, completer);
      if (recipients.length > 0 && completed.completedAt) {
        notifications.insertCompletionNotifications(
          recipients,
          boardTask,
          completer,
          completed.completedAt
        );
      }
      return ok<PmTask>(completed);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "process-mgmt:task:undoComplete",
    async (_event, payload: { id: number; reason: string }) => {
      try {
        const session = assertAppRoleAtLeast("process-management", "admin");
        ensureProcessMgmt();
        const id = Number(payload?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        const existing = tasks.getTaskDetail(id);
        tasks.assertTaskMatchesProcessView(existing, session.processView);
        const reason = (payload?.reason ?? "").toString();
        const restored = tasks.undoComplete(id, reason, session.username ?? "");
        notifications.deleteNotificationsForTask(id);
        return ok<PmTask>(restored);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("process-mgmt:notify:listPending", async () => {
    try {
      const session = assertLoggedIn();
      ensureProcessMgmt();
      const list = notifications.listPendingForRecipient(session.username ?? "");
      return ok<PmTaskCompletionNotification[]>(list);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "process-mgmt:project:setWorkMode",
    async (_event, payload: { seisanProjectId: string; workMode: PmWorkMode; note?: string }) => {
      try {
        const session = assertCanWriteProcessMgmtTasks();
        ensureProcessMgmt();
        const sid = (payload?.seisanProjectId ?? "").trim();
        if (!sid) throw new Error("案件 ID が必要です。");
        const sw = parallel.getSwTaskForProjectSync(sid);
        if (!sw) throw new Error("SolidWorks 工程が見つかりません。");
        assertSwPrimaryEditorOrAdmin(sw, session);
        const mode = payload?.workMode;
        if (mode !== "sequential" && mode !== "parallel") {
          throw new Error("作業モードが不正です。");
        }
        parallelOps.setProjectWorkMode(sid, mode, payload?.note ?? "", session.username ?? "");
        return ok({ seisanProjectId: sid, workMode: mode });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "process-mgmt:task:handoffToCadmac",
    async (_event, payload: { taskId: number; note: string }) => {
      try {
        const session = assertCanWriteProcessMgmtTasks();
        ensureProcessMgmt();
        const taskId = Number(payload?.taskId);
        if (!Number.isFinite(taskId) || taskId <= 0) throw new Error("不正なタスク ID です。");
        const sw = tasks.getTaskDetail(taskId);
        assertSwPrimaryEditorOrAdmin(sw, session);
        const event = parallelOps.handoffToCadmac(taskId, payload?.note ?? "", session.username ?? "");
        return ok<PmHandoffEvent>(event);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "process-mgmt:handoff:listByProject",
    async (_event, payload: { seisanProjectId: string }) => {
      try {
        assertCanViewApp("process-management");
        ensureProcessMgmt();
        const sid = (payload?.seisanProjectId ?? "").trim();
        if (!sid) throw new Error("案件 ID が必要です。");
        return ok(handoffRepo.listHandoffsByProject(sid));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("process-mgmt:task:pause", async (_event, payload: { id: number }) => {
    try {
      const session = assertCanWriteProcessMgmtTasks();
      ensureProcessMgmt();
      const id = Number(payload?.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
      const existing = tasks.getTaskDetail(id);
      tasks.assertTaskMatchesProcessView(existing, session.processView);
      assertTaskPrimaryAssigneeOrAdmin(existing, session);
      const latest = existing.seisanProjectId
        ? handoffRepo.getLatestHandoff(existing.seisanProjectId)
        : null;
      return ok<PmTask>(tasks.pauseTask(id, latest?.batchNo ?? null));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:task:resume", async (_event, payload: { id: number }) => {
    try {
      const session = assertCanWriteProcessMgmtTasks();
      ensureProcessMgmt();
      const id = Number(payload?.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
      const existing = tasks.getTaskDetail(id);
      tasks.assertTaskMatchesProcessView(existing, session.processView);
      assertTaskPrimaryAssigneeOrAdmin(existing, session);
      return ok<PmTask>(tasks.resumeTask(id));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:support:listUserCandidates", async () => {
    try {
      assertCanWriteProcessMgmtTasks();
      ensureProcessMgmt();
      return ok<PmSupportUserCandidate[]>(support.listSupportUserCandidates());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "process-mgmt:task:setSupportAssignees",
    async (_event, payload: { taskId: number; userNameIds: number[] }) => {
      try {
        const session = assertCanWriteProcessMgmtTasks();
        ensureProcessMgmt();
        const taskId = Number(payload?.taskId);
        if (!Number.isFinite(taskId) || taskId <= 0) throw new Error("不正なタスク ID です。");
        const sw = tasks.getTaskDetail(taskId);
        assertSwPrimaryEditorOrAdmin(sw, session);
        const ids = Array.isArray(payload?.userNameIds) ? payload.userNameIds : [];
        return ok<PmSupportAssignee[]>(support.setSupportAssignees(taskId, ids));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("process-mgmt:gantt:getTemplateMapping", async () => {
    try {
      assertCanViewApp("process-management");
      ensureProcessMgmt();
      return ok<PmGanttTemplateMapping>(ganttSettings.getGanttTemplateMapping());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "process-mgmt:gantt:setTemplateMapping",
    async (_event, payload: { swTemplateName?: string; cadmacTemplateName?: string }) => {
      try {
        assertAppRoleAtLeast("process-management", "admin");
        ensureProcessMgmt();
        return ok<PmGanttTemplateMapping>(
          ganttSettings.setGanttTemplateMapping({
            swTemplateName: payload?.swTemplateName,
            cadmacTemplateName: payload?.cadmacTemplateName,
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "process-mgmt:gantt:syncDurations",
    async (_event, payload: { acknowledge?: boolean }) => {
      try {
        const session = assertCanViewApp("process-management");
        ensureSeisanSatellite();
        ensureProcessMgmt();
        const acknowledge = payload?.acknowledge === true;
        const result = parallelOps.syncGanttWithNotifications(acknowledge, session.username ?? "system");
        return ok<PmGanttSyncResult>(result);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("process-mgmt:dashboard:groupContext", async () => {
    try {
      const session = assertCanViewApp("process-management");
      const membership = loadGroupMembershipForUser(session.userNameId);
      if (!membership) {
        return ok<null>(null);
      }
      return ok({
        groupNameId: membership.groupNameId,
        groupName: membership.groupName,
        members: listGroupMembers(membership.groupNameId),
      });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "process-mgmt:dashboard:analytics",
    async (_event, payload: { staleDays?: number } | undefined) => {
      try {
        assertCanViewApp("process-management");
        ensureProcessMgmt();
        const raw = Number(payload?.staleDays);
        const staleDays =
          Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : PM_DASHBOARD_STALE_DAYS_DEFAULT;
        return ok<PmDashboardAnalytics>(dashboardAnalytics.getDashboardAnalytics(staleDays));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("process-mgmt:notify:acknowledge", async (_event, payload: { id: number }) => {
    try {
      const session = assertLoggedIn();
      ensureProcessMgmt();
      const rawId = Number(payload?.id);
      if (!Number.isFinite(rawId) || rawId <= 0) {
        throw new Error("不正な通知 ID です。");
      }
      notifications.acknowledgeNotification(rawId, session.username ?? "");
      return ok<{ acknowledged: true }>({ acknowledged: true });
    } catch (err) {
      return fail(err);
    }
  });
}

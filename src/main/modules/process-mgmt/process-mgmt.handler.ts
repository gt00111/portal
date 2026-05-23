import type { IpcMain } from "electron";

import { getAppRole } from "@shared/auth.js";
import { fail, ok } from "@shared/ipcResponse.js";
import type { PmBoardTask, PmProject, PmTask, PmTaskCompletionNotification } from "@shared/processMgmt.js";
import type { SessionUser } from "@shared/types.js";

import {
  assertAppRoleAtLeast,
  assertCanOperateProcessMgmtTasks,
  assertCanWriteApp,
  assertCanViewApp,
  assertLoggedIn,
} from "@main/auth-guard.js";
import { getProcessMgmtDbPath } from "@main/db/processMgmtConnection.js";
import { listGroupAdminUsernamesForGroupName } from "@main/db/userAccessQueries.js";
import * as seisanProjects from "@main/seisan/repos/projects.repo.js";
import { ensureProcessMgmt } from "@main/process-mgmt-guard.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";

import type { CreatePmProjectPayload, UpdatePmProjectPayload } from "./pm-projects.repo.js";
import * as projects from "./pm-projects.repo.js";
import * as notifications from "./pm-notifications.repo.js";
import * as sync from "./pm-seisan-sync.repo.js";
import type {
  CreatePmTaskPayload,
  ListPmBoardPayload,
  UpdatePmTaskPayload,
  UpdatePmTaskStatusPayload,
} from "./pm-tasks.repo.js";
import * as tasks from "./pm-tasks.repo.js";

function assertCanEditProgressNote(task: PmTask, session: SessionUser): void {
  if (getAppRole(session, "process-management") === "admin") return;
  if (task.assignee.trim() !== session.username.trim()) {
    throw new Error("ユーザーまたは工程管理の管理者のみ進捗（％とメモ）を更新できます。");
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
      const session = assertCanOperateProcessMgmtTasks();
      ensureSeisanSatellite();
      ensureProcessMgmt();
      sync.syncDefaultProcessTasksFromSeisan();
      const raw = tasks.listMyTasks(session.username, session.processView);
      return ok<PmBoardTask[]>(raw.map((t) => tasks.displayPmTask(t)));
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
        assertCanEditProgressNote(existing, session);
        const note = (payload?.progressNote ?? "").toString();
        return ok<PmTask>(tasks.updateProgressNote(id, note, Number(payload?.progressPercent)));
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
      const list = tasks.listBoardTasks(pl, session.processView);
      return ok<PmBoardTask[]>(filterBoardTasks(list, pl.query ?? "", pl.client ?? ""));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:task:start", async (_event, payload: { id: number }) => {
    try {
      const session = assertCanOperateProcessMgmtTasks();
      ensureProcessMgmt();
      const existing = tasks.getTaskDetail(payload?.id ?? 0);
      tasks.assertTaskMatchesProcessView(existing, session.processView);
      const username = session.username ?? "";
      const userNameId = session.userNameId ?? null;
      return ok<PmTask>(tasks.startTask(payload?.id ?? 0, username, userNameId));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("process-mgmt:task:complete", async (_event, payload: { id: number }) => {
    try {
      const session = assertCanOperateProcessMgmtTasks();
      ensureProcessMgmt();
      const existing = tasks.getTaskDetail(payload?.id ?? 0);
      tasks.assertTaskMatchesProcessView(existing, session.processView);
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

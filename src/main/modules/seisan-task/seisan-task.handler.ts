import type { IpcMain } from "electron";

import { SEISAN_CHANNELS } from "@shared/seisan/channels.js";
import { fail, ok } from "@shared/ipcResponse.js";

import { assertLoggedIn } from "@main/auth-guard.js";
import * as tasksRepo from "@main/seisan/repos/tasks.repo.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(
    SEISAN_CHANNELS.task.listByProject,
    async (_event, input: { project_id?: string; include_done?: boolean }) => {
      try {
        assertLoggedIn();
        ensureSeisanSatellite();
        if (!input?.project_id) {
          throw new Error("project_idが必要です。");
        }
        const rows = tasksRepo.listByProject(input.project_id, input.include_done ?? false);
        return ok(rows);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(SEISAN_CHANNELS.task.listAll, async (_event, filter?: tasksRepo.TaskListFilter) => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      const rows = tasksRepo.listAll(filter);
      return ok(rows);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.task.create, async (_event, input: tasksRepo.CreateTaskInput) => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      const row = tasksRepo.create(input);
      return ok(row);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.task.update, async (_event, input: tasksRepo.UpdateTaskInput) => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      const row = tasksRepo.update(input);
      return ok(row);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    SEISAN_CHANNELS.task.updateDates,
    async (_event, input: { id?: string; start_date?: string; end_date?: string }) => {
      try {
        assertLoggedIn();
        ensureSeisanSatellite();
        if (!input?.id || !input.start_date || !input.end_date) {
          throw new Error("IDと開始日・終了日が必要です。");
        }
        const row = tasksRepo.updateDates(input.id, input.start_date, input.end_date);
        return ok(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    SEISAN_CHANNELS.task.updateSort,
    async (_event, input: { tasks?: { id: string; sort_order: number }[] }) => {
      try {
        assertLoggedIn();
        ensureSeisanSatellite();
        if (!input?.tasks?.length) {
          throw new Error("tasks が必要です。");
        }
        tasksRepo.updateSort(input.tasks);
        return ok<void>(undefined);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    SEISAN_CHANNELS.task.updateStatus,
    async (_event, input: { id?: string; status?: string }) => {
      try {
        assertLoggedIn();
        ensureSeisanSatellite();
        if (!input?.id || !input?.status) {
          throw new Error("IDとステータスが必要です。");
        }
        const row = tasksRepo.updateStatus(input.id, input.status);
        return ok(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(SEISAN_CHANNELS.task.delete, async (_event, input: { id?: string }) => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      if (!input?.id) {
        throw new Error("IDが必要です。");
      }
      tasksRepo.remove(input.id);
      return ok<void>(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.task.initProjectTask, async (_event, input: { project_id?: string }) => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      if (!input?.project_id) {
        throw new Error("project_idが必要です。");
      }
      const row = tasksRepo.initProjectTask(input.project_id);
      return ok(row);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    SEISAN_CHANNELS.task.createFromDeadline,
    async (_event, input: { project_id?: string; meeting_date?: string }) => {
      try {
        assertLoggedIn();
        ensureSeisanSatellite();
        if (!input?.project_id) {
          throw new Error("project_idが必要です。");
        }
        const result = tasksRepo.createTasksFromDeadlineBackward(input.project_id, input.meeting_date);
        if (!result.success) {
          throw new Error(result.error);
        }
        return ok(result.created);
      } catch (err) {
        return fail(err);
      }
    }
  );
}

import type { IpcMain } from "electron";

import { SEISAN_CHANNELS } from "@shared/seisan/channels.js";
import { fail, ok } from "@shared/ipcResponse.js";

import { assertCanViewApp, assertCanWriteApp } from "@main/auth-guard.js";
import * as projectsRepo from "@main/seisan/repos/projects.repo.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(SEISAN_CHANNELS.project.list, async (_event, filter?: projectsRepo.ProjectListFilter) => {
    try {
      assertCanViewApp("seisan-board");
      ensureSeisanSatellite();
      const data = projectsRepo.list(filter);
      return ok(data);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.project.get, async (_event, data: { id?: string }) => {
    try {
      assertCanViewApp("seisan-board");
      ensureSeisanSatellite();
      if (!data?.id) {
        throw new Error("IDが必要です。");
      }
      const row = projectsRepo.get(data.id);
      if (!row) {
        throw new Error("案件が見つかりません。");
      }
      return ok(row);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.project.create, async (_event, input: projectsRepo.CreateProjectInput) => {
    try {
      assertCanWriteApp("seisan-board");
      ensureSeisanSatellite();
      const row = projectsRepo.create(input);
      return ok(row);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.project.update, async (_event, input: projectsRepo.UpdateProjectInput) => {
    try {
      assertCanWriteApp("seisan-board");
      ensureSeisanSatellite();
      const row = projectsRepo.update(input);
      return ok(row);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.project.submit, async (_event, data: { id?: string }) => {
    try {
      assertCanWriteApp("seisan-board");
      ensureSeisanSatellite();
      if (!data?.id) {
        throw new Error("IDが必要です。");
      }
      const row = projectsRepo.submit(data.id);
      return ok(row);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.project.approve, async (_event, data: { id?: string }) => {
    try {
      assertCanWriteApp("seisan-board");
      ensureSeisanSatellite();
      if (!data?.id) {
        throw new Error("IDが必要です。");
      }
      const row = projectsRepo.approve(data.id);
      return ok(row);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    SEISAN_CHANNELS.project.updateStatus,
    async (_event, data: { id?: string; status?: string }) => {
      try {
        assertCanWriteApp("seisan-board");
        ensureSeisanSatellite();
        if (!data?.id || !data?.status) {
          throw new Error("IDとステータスが必要です。");
        }
        const row = projectsRepo.updateStatus(data.id, data.status);
        return ok(row);
      } catch (err) {
        return fail(err);
      }
    }
  );
}

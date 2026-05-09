import type { IpcMain } from "electron";

import { SEISAN_CHANNELS } from "@shared/seisan/channels.js";
import { fail, ok } from "@shared/ipcResponse.js";

import { assertLoggedIn } from "@main/auth-guard.js";
import * as processTemplatesRepo from "@main/seisan/repos/processTemplates.repo.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(SEISAN_CHANNELS.template.list, async (_event, activeOnly?: boolean) => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      const rows = processTemplatesRepo.list(activeOnly);
      return ok(rows);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    SEISAN_CHANNELS.template.create,
    async (_event, input: processTemplatesRepo.CreateProcessTemplateInput) => {
      try {
        assertLoggedIn();
        ensureSeisanSatellite();
        const row = processTemplatesRepo.create(input);
        return ok(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    SEISAN_CHANNELS.template.update,
    async (_event, input: processTemplatesRepo.UpdateProcessTemplateInput) => {
      try {
        assertLoggedIn();
        ensureSeisanSatellite();
        const row = processTemplatesRepo.update(input);
        return ok(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(SEISAN_CHANNELS.template.delete, async (_event, data: { id?: string }) => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      if (!data?.id) {
        throw new Error("IDが必要です。");
      }
      processTemplatesRepo.remove(data.id);
      return ok<void>(undefined);
    } catch (err) {
      return fail(err);
    }
  });
}

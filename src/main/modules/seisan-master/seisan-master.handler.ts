import { type IpcMain } from "electron";

import { SEISAN_CHANNELS } from "@shared/seisan/channels.js";
import { fail, ok } from "@shared/ipcResponse.js";

import { assertCanViewApp } from "@main/auth-guard.js";
import { getDbPath, isOpen } from "@main/db/connection.js";
import * as seisanMasterRepo from "./seisan-master.repo.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(SEISAN_CHANNELS.master.status, async () => {
    try {
      assertCanViewApp("seisan-board");
      return ok<{ path: string | null; connected: boolean }>({
        path: getDbPath(),
        connected: isOpen(),
      });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.selectFile, async () => {
    try {
      assertCanViewApp("seisan-board");
      const path = getDbPath();
      if (!path) {
        throw new Error("中央データベースが開かれていません。");
      }
      return ok(path);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.disconnect, async () => {
    try {
      assertCanViewApp("seisan-board");
      return ok<void>(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.customers, async () => {
    try {
      assertCanViewApp("seisan-board");
      return ok(seisanMasterRepo.listCustomers());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.models, async (_event, customerId: number) => {
    try {
      assertCanViewApp("seisan-board");
      return ok(seisanMasterRepo.listModels(Number(customerId)));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.partNumbers, async (_event, modelId: number) => {
    try {
      assertCanViewApp("seisan-board");
      return ok(seisanMasterRepo.listPartNumbers(Number(modelId)));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.componentNames, async (_event, partNumberId: number) => {
    try {
      assertCanViewApp("seisan-board");
      return ok(seisanMasterRepo.listComponentNames(Number(partNumberId)));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.allModels, async () => {
    try {
      assertCanViewApp("seisan-board");
      return ok(seisanMasterRepo.listAllModels());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.allPartNumbers, async () => {
    try {
      assertCanViewApp("seisan-board");
      return ok(seisanMasterRepo.listAllPartNumbers());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.allComponentNames, async () => {
    try {
      assertCanViewApp("seisan-board");
      return ok(seisanMasterRepo.listAllComponentNames());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.groupNames, async () => {
    try {
      assertCanViewApp("seisan-board");
      return ok(seisanMasterRepo.listGroupNames());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.userNames, async () => {
    try {
      assertCanViewApp("seisan-board");
      return ok(seisanMasterRepo.listUserNames());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.distinctCompanies, async () => {
    try {
      assertCanViewApp("seisan-board");
      ensureSeisanSatellite();
      return ok(seisanMasterRepo.distinctCompaniesFromProjects());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.master.distinctGroups, async () => {
    try {
      assertCanViewApp("seisan-board");
      ensureSeisanSatellite();
      return ok(seisanMasterRepo.distinctGroupsFromProjects());
    } catch (err) {
      return fail(err);
    }
  });
}

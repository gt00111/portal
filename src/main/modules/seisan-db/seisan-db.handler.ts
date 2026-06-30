import { existsSync } from "node:fs";

import { BrowserWindow, dialog, type IpcMain } from "electron";

import { SEISAN_CHANNELS } from "@shared/seisan/channels.js";

import { fail, ok } from "@shared/ipcResponse.js";

import { appendAuditEntry } from "@main/audit/audit.repo.js";
import { assertCanViewApp, assertPortalAdmin } from "@main/auth-guard.js";
import { getDbPath } from "@main/db/connection.js";
import { getDefaultSeisanBoardDbPath } from "@main/db/seisanBoardPath.js";
import {
  getSeisanDbPath,
  isSeisanSatelliteOpen,
  openSeisanDatabaseFile,
} from "@main/db/seisanConnection.js";
import { getPortalWindow } from "@main/window.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";

function dialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? getPortalWindow() ?? undefined;
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(SEISAN_CHANNELS.db.getPath, async () => {
    try {
      assertCanViewApp("seisan-board");
      ensureSeisanSatellite();
      return ok<string | null>(getSeisanDbPath());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.db.selectFile, async () => {
    try {
      assertPortalAdmin();
      const central = getDbPath();
      if (!central) {
        throw new Error("ポータル中央データベースが開かれていません。");
      }
      return ok<string | null>(getDefaultSeisanBoardDbPath());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.db.selectProjectFile, async () => {
    try {
      assertPortalAdmin();
      const parent = dialogParent();
      const result = parent
        ? await dialog.showOpenDialog(parent, {
            properties: ["openFile"],
            filters: [
              {
                name: "対応ファイル",
                extensions: ["pdf", "dxf", "tif", "tiff", "png", "jpg", "jpeg", "docx", "xlsx", "xdw", "xbd"],
              },
            ],
          })
        : await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [
              {
                name: "対応ファイル",
                extensions: ["pdf", "dxf", "tif", "tiff", "png", "jpg", "jpeg", "docx", "xlsx", "xdw", "xbd"],
              },
            ],
          });
      if (result.canceled) {
        return ok<string | null>(null);
      }
      return ok<string | null>(result.filePaths[0] ?? null);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.db.createNew, async () => {
    try {
      assertPortalAdmin();
      const central = getDbPath();
      if (!central) {
        throw new Error("ポータル中央データベースが開かれていません。");
      }
      const path = getDefaultSeisanBoardDbPath();
      if (existsSync(path)) {
        throw new Error(`生産ボード DB は既に存在します: ${path}`);
      }
      return ok<string | null>(path);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.db.connect, async () => {
    try {
      assertPortalAdmin();
      const central = getDbPath();
      if (!central) {
        throw new Error("ポータル中央データベースが開かれていません。");
      }
      const path = getDefaultSeisanBoardDbPath();
      openSeisanDatabaseFile(path);
      appendAuditEntry({
        channel: "seisan-db:connect",
        action: "update",
        appId: "seisan-board",
        result: "ok",
        targetType: "seisan_db",
        detail: { path },
      });
      return ok<void>(undefined);
    } catch (err) {
      appendAuditEntry({
        channel: "seisan-db:connect",
        action: "update",
        appId: "seisan-board",
        result: "fail",
        targetType: "seisan_db",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.db.status, async () => {
    try {
      assertCanViewApp("seisan-board");
      ensureSeisanSatellite();
      return ok<{ connected: boolean; path: string | null }>({
        connected: isSeisanSatelliteOpen(),
        path: getSeisanDbPath(),
      });
    } catch (err) {
      return fail(err);
    }
  });
}

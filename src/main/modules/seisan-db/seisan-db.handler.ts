import { BrowserWindow, dialog, type IpcMain } from "electron";

import { SEISAN_CHANNELS } from "@shared/seisan/channels.js";

import { fail, ok } from "@shared/ipcResponse.js";

import { assertLoggedIn } from "@main/auth-guard.js";
import { getDbPath } from "@main/db/connection.js";
import {
  getSeisanDbPath,
  isSeisanSatelliteOpen,
  openSeisanDatabaseFile,
} from "@main/db/seisanConnection.js";
import { setSeisanBoardOverridePath } from "@main/db/seisanBoardPathStore.js";
import { getPortalWindow } from "@main/window.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";

function dialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? getPortalWindow() ?? undefined;
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(SEISAN_CHANNELS.db.getPath, async () => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      return ok<string | null>(getSeisanDbPath());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.db.selectFile, async () => {
    try {
      assertLoggedIn();
      const parent = dialogParent();
      const result = parent
        ? await dialog.showOpenDialog(parent, {
            properties: ["openFile"],
            filters: [{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] }],
          })
        : await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] }],
          });
      if (result.canceled) {
        return ok<string | null>(null);
      }
      return ok<string | null>(result.filePaths[0] ?? null);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.db.selectProjectFile, async () => {
    try {
      assertLoggedIn();
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
      assertLoggedIn();
      const parent = dialogParent();
      const result = parent
        ? await dialog.showSaveDialog(parent, {
            defaultPath: "production.db",
            filters: [{ name: "SQLite Database", extensions: ["db"] }],
          })
        : await dialog.showSaveDialog({
            defaultPath: "production.db",
            filters: [{ name: "SQLite Database", extensions: ["db"] }],
          });
      if (result.canceled || !result.filePath) {
        return ok<string | null>(null);
      }
      return ok<string | null>(result.filePath);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.db.connect, async (_event, data: string | { path?: string }) => {
    try {
      assertLoggedIn();
      const central = getDbPath();
      if (!central) {
        throw new Error("ポータル中央データベースが開かれていません。");
      }
      const path = (typeof data === "string" ? data : data?.path ?? "").trim();
      if (!path) {
        throw new Error("データベースのパスを指定してください。");
      }
      setSeisanBoardOverridePath(path);
      openSeisanDatabaseFile(path);
      return ok<void>(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.db.status, async () => {
    try {
      assertLoggedIn();
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

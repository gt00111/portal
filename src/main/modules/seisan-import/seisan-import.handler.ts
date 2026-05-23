import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { app, BrowserWindow, dialog, type IpcMain } from "electron";

import { buildCsvImportTemplateContent } from "@shared/seisan/csvImportFormat.js";
import { SEISAN_CHANNELS } from "@shared/seisan/channels.js";
import { fail, ok } from "@shared/ipcResponse.js";

import { assertCanViewApp } from "@main/auth-guard.js";
import { getPortalWindow } from "@main/window.js";

function getResourcesPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "resources");
  }
  return join(app.getAppPath(), "resources");
}

function dialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? getPortalWindow() ?? undefined;
}

/** Excel テンプレは `resources/format.xlsx` に同梱すること。 */
function resolveFormatXlsxPath(): string {
  const bundled = join(getResourcesPath(), "format.xlsx");
  if (existsSync(bundled)) {
    return bundled;
  }
  throw new Error(
    "CSVインポート用フォーマット (format.xlsx) が見つかりません。resources/format.xlsx を配置してください。",
  );
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(SEISAN_CHANNELS.import.downloadFormat, async () => {
    try {
      assertCanViewApp("seisan-board");
      const src = resolveFormatXlsxPath();
      const parent = dialogParent();
      const result = parent
        ? await dialog.showSaveDialog(parent, {
            defaultPath: "案件CSVインポート形式.xlsx",
            filters: [{ name: "Excel", extensions: ["xlsx"] }],
          })
        : await dialog.showSaveDialog({
            defaultPath: "案件CSVインポート形式.xlsx",
            filters: [{ name: "Excel", extensions: ["xlsx"] }],
          });
      if (result.canceled || !result.filePath) {
        throw new Error("キャンセルされました");
      }
      copyFileSync(src, result.filePath);
      return ok(result.filePath);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.import.downloadCsvTemplate, async () => {
    try {
      assertCanViewApp("seisan-board");
      const parent = dialogParent();
      const result = parent
        ? await dialog.showSaveDialog(parent, {
            defaultPath: "案件インポート形式.csv",
            filters: [{ name: "CSV", extensions: ["csv"] }],
          })
        : await dialog.showSaveDialog({
            defaultPath: "案件インポート形式.csv",
            filters: [{ name: "CSV", extensions: ["csv"] }],
          });
      if (result.canceled || !result.filePath) {
        throw new Error("キャンセルされました");
      }
      writeFileSync(result.filePath, buildCsvImportTemplateContent(), "utf-8");
      return ok(result.filePath);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.import.exportCsv, async (_event, csvContent: string) => {
    try {
      assertCanViewApp("seisan-board");
      const now = new Date();
      const defaultName = `案件一覧_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.csv`;
      const parent = dialogParent();
      const result = parent
        ? await dialog.showSaveDialog(parent, {
            defaultPath: defaultName,
            filters: [{ name: "CSV", extensions: ["csv"] }],
          })
        : await dialog.showSaveDialog({
            defaultPath: defaultName,
            filters: [{ name: "CSV", extensions: ["csv"] }],
          });
      if (result.canceled || !result.filePath) {
        throw new Error("キャンセルされました");
      }
      const bom = "\uFEFF";
      writeFileSync(result.filePath, bom + csvContent, "utf-8");
      return ok(result.filePath);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.import.selectCsv, async () => {
    try {
      assertCanViewApp("seisan-board");
      const parent = dialogParent();
      const result = parent
        ? await dialog.showOpenDialog(parent, {
            properties: ["openFile"],
            filters: [{ name: "CSV", extensions: ["csv"] }],
          })
        : await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "CSV", extensions: ["csv"] }],
          });
      if (result.canceled || !result.filePaths[0]) {
        throw new Error("キャンセルされました");
      }
      const raw = readFileSync(result.filePaths[0], "utf-8");
      return ok(raw);
    } catch (err) {
      return fail(err);
    }
  });
}

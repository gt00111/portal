import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { BrowserWindow, dialog, shell, type IpcMain } from "electron";

import { SEISAN_CHANNELS } from "@shared/seisan/channels.js";
import { fail, ok } from "@shared/ipcResponse.js";

import { assertCanWrite, assertLoggedIn } from "@main/auth-guard.js";
import * as projectFilesRepo from "@main/seisan/repos/projectFiles.repo.js";
import { getPortalWindow } from "@main/window.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";

function sanitizePathSegment(input: string): string {
  const raw = input.trim();
  const safe = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "");
  return safe || "unknown";
}

async function ensureUniqueFilePath(baseDir: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let candidate = path.join(baseDir, fileName);
  let seq = 1;
  while (true) {
    try {
      await access(candidate);
      seq += 1;
      candidate = path.join(baseDir, `${stem}_${seq}${ext}`);
    } catch {
      return candidate;
    }
  }
}

function dialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? getPortalWindow() ?? undefined;
}

const SEISAN_READ_MAX = 80 * 1024 * 1024;

function mimeFromSeisanFileExt(ext: string): string {
  const e = ext.replace(/^\./, "").toLowerCase();
  switch (e) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "tif":
    case "tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(SEISAN_CHANNELS.file.listByProject, async (_event, input: { project_id?: string }) => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      if (!input?.project_id) {
        throw new Error("project_idが必要です。");
      }
      const rows = projectFilesRepo.listByProject(input.project_id);
      return ok(rows);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    SEISAN_CHANNELS.file.add,
    async (_event, input: { project_id?: string; file_path?: string }) => {
      try {
        assertLoggedIn();
        ensureSeisanSatellite();
        if (!input?.project_id || !input?.file_path) {
          throw new Error("project_id と file_path が必要です。");
        }
        const row = await projectFilesRepo.add(input.project_id, input.file_path);
        return ok(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(SEISAN_CHANNELS.file.open, async (_event, input: { id?: string }) => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      if (!input?.id) {
        throw new Error("IDが必要です。");
      }
      const file = projectFilesRepo.getById(input.id);
      if (!file) {
        throw new Error("ファイルが見つかりません。");
      }
      const errMsg = await shell.openPath(file.file_path);
      if (errMsg) {
        throw new Error(errMsg);
      }
      return ok<void>(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.file.saveCopy, async (_event, input: { id?: string }) => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      if (!input?.id) {
        throw new Error("IDが必要です。");
      }
      const file = projectFilesRepo.getById(input.id);
      if (!file) {
        throw new Error("ファイルが見つかりません。");
      }
      const parent = dialogParent();
      const res = parent
        ? await dialog.showSaveDialog(parent, { defaultPath: file.file_name })
        : await dialog.showSaveDialog({ defaultPath: file.file_name });
      if (res.canceled || !res.filePath) {
        throw new Error("保存がキャンセルされました。");
      }
      await copyFile(file.file_path, res.filePath);
      return ok<{ path: string }>({ path: res.filePath });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    SEISAN_CHANNELS.file.setObsolete,
    async (_event, input: { id?: string; isObsolete?: boolean }) => {
      try {
        assertLoggedIn();
        assertCanWrite();
        ensureSeisanSatellite();
        if (!input?.id) {
          throw new Error("IDが必要です。");
        }
        projectFilesRepo.setObsolete(input.id, input.isObsolete === true);
        return ok<void>(undefined);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(SEISAN_CHANNELS.file.readAsDataUrl, async (_event, input: { id?: string }) => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      if (!input?.id) {
        throw new Error("IDが必要です。");
      }
      const file = projectFilesRepo.getById(input.id);
      if (!file) {
        throw new Error("ファイルが見つかりません。");
      }
      const buf = await readFile(file.file_path);
      if (buf.length > SEISAN_READ_MAX) {
        throw new Error("ファイルが大きすぎます。プレビューできません。");
      }
      const mime = mimeFromSeisanFileExt(file.file_ext);
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      return ok<{ dataUrl: string; fileName: string }>({ dataUrl, fileName: file.file_name });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.file.remove, async (_event, input: { id?: string }) => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      if (!input?.id) {
        throw new Error("IDが必要です。");
      }
      await projectFilesRepo.remove(input.id);
      return ok<void>(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    SEISAN_CHANNELS.file.downloadAll,
    async (_event, input: { project_id?: string }) => {
      try {
        assertLoggedIn();
        ensureSeisanSatellite();
        if (!input?.project_id) {
          throw new Error("project_idが必要です。");
        }
        const files = projectFilesRepo.listByProject(input.project_id);
        if (files.length === 0) {
          throw new Error("ダウンロード対象のファイルがありません。");
        }
        const parent = dialogParent();
        const dest = parent
          ? await dialog.showOpenDialog(parent, {
              properties: ["openDirectory", "createDirectory"],
            })
          : await dialog.showOpenDialog({
              properties: ["openDirectory", "createDirectory"],
            });
        if (dest.canceled || !dest.filePaths[0]) {
          throw new Error("保存先が選択されませんでした。");
        }
        const meta = projectFilesRepo.getProjectMeta(input.project_id);
        if (!meta) {
          throw new Error("案件が見つかりません。");
        }
        const folderName = sanitizePathSegment(meta.project_no ?? input.project_id);
        const projectDir = path.join(dest.filePaths[0], folderName);
        await mkdir(projectDir, { recursive: true });

        for (const f of files) {
          const targetPath = await ensureUniqueFilePath(projectDir, f.file_name);
          await copyFile(f.file_path, targetPath);
        }

        return ok(projectDir);
      } catch (err) {
        return fail(err);
      }
    }
  );
}

import type { IpcMain } from "electron";

import { PIXO_CHANNELS } from "@shared/pixo/channels.js";
import { fail, ok } from "@shared/ipcResponse.js";

import { assertLoggedIn } from "@main/auth-guard.js";
import * as pixo from "./pixo-converter.service.js";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(PIXO_CHANNELS.openPdf, async () => {
    try {
      assertLoggedIn();
      return ok(await pixo.openPdfDialog());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.convertPdf, async (_e, payload: { filePath: string; format?: string }) => {
    try {
      assertLoggedIn();
      const { filePath, format } = payload;
      const result = await pixo.convertPdfToImages(filePath, format);
      return ok(result);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.saveOutputImages, async () => {
    try {
      assertLoggedIn();
      return ok(await pixo.saveOutputImagesToFolder());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.resetTempDirs, async () => {
    try {
      assertLoggedIn();
      return ok(await pixo.resetTempState());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.openTiff, async () => {
    try {
      assertLoggedIn();
      return ok(await pixo.openTiffDialog());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.convertTiff, async (_e, filePath: string) => {
    try {
      assertLoggedIn();
      return ok(await pixo.convertTiffToPdf(filePath));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.openImages, async () => {
    try {
      assertLoggedIn();
      return ok(await pixo.openImagesDialog());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.convertImage, async (_e, filePath: string) => {
    try {
      assertLoggedIn();
      return ok(await pixo.convertImageToPdf(filePath));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.mergePdfs, async (_e, filePaths: string[]) => {
    try {
      assertLoggedIn();
      return ok(await pixo.mergePdfs(filePaths));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    PIXO_CHANNELS.mergeAndSave,
    async (_e, payload: { filePaths: string[]; savePath: string }) => {
      try {
        assertLoggedIn();
        const { filePaths, savePath } = payload;
        return ok(await pixo.mergeAndSaveToPath(filePaths, savePath));
      } catch (err) {
        return fail(err);
      }
    },
  );

  ipcMain.handle(PIXO_CHANNELS.mergeSaveDialog, async () => {
    try {
      assertLoggedIn();
      return ok(await pixo.showMergeSaveDialog());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.copyPdf, async (_e, payload: { sourcePath: string; targetPath: string }) => {
    try {
      assertLoggedIn();
      const { sourcePath, targetPath } = payload;
      return ok(await pixo.copyPdfFile(sourcePath, targetPath));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.deleteTempFile, async (_e, filePath: string) => {
    try {
      assertLoggedIn();
      return ok(await pixo.deleteTempFile(filePath));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.readAsDataUrl, async (_e, filePath: string) => {
    try {
      assertLoggedIn();
      return ok(await pixo.readFileAsDataUrl(filePath));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.getPdfPages, async (_e, filePath: string) => {
    try {
      assertLoggedIn();
      return ok(await pixo.getPdfPages(filePath));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.getPdfPageCount, async (_e, filePath: string) => {
    try {
      assertLoggedIn();
      return ok(await pixo.getPdfPageCount(filePath));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.manipulatePage, async (_e, input: pixo.ManipulatePdfInput) => {
    try {
      assertLoggedIn();
      return ok(await pixo.manipulatePdfPage(input));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(PIXO_CHANNELS.savePdfDialog, async () => {
    try {
      assertLoggedIn();
      return ok(await pixo.showSavePdfDialog());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    PIXO_CHANNELS.saveTempFile,
    async (_e, payload: { fileName: string; data: Uint8Array | number[] }) => {
      try {
        assertLoggedIn();
        const { fileName, data } = payload;
        return ok(await pixo.saveTempUploadFile(fileName, data));
      } catch (err) {
        return fail(err);
      }
    },
  );
}

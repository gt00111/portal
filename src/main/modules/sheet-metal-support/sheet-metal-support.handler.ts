import type { IpcMain } from "electron";

import { fail, ok } from "@shared/ipcResponse.js";
import type {
  DrawingFilePayload,
  PartDetail,
  PartSearchCascadeOptions,
  PartSearchCascadeParams,
  PartSearchParams,
  PartSearchResult,
  SheetMetalSupportStatus,
} from "@shared/sheetMetalSupport.js";

import { assertCanViewApp } from "@main/auth-guard.js";
import { ensureDrawingLibraryForSheetMetalSupport } from "@main/sheet-metal-support-guard.js";
import { isSheetMetalSupportOpen } from "@main/db/sheetMetalSupportConnection.js";
import { isDrawingLibraryOpen } from "@main/db/drawingLibraryConnection.js";

import * as partSearch from "./part-search.service.js";

const APP_ID = "sheet-metal-support";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("smsupport:status", async () => {
    try {
      assertCanViewApp(APP_ID);
      return ok<SheetMetalSupportStatus>({
        ready: isSheetMetalSupportOpen() && isDrawingLibraryOpen(),
      });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "smsupport:searchCascadeOptions",
    async (_event, data: PartSearchCascadeParams | undefined) => {
      try {
        assertCanViewApp(APP_ID);
        ensureDrawingLibraryForSheetMetalSupport();
        return ok<PartSearchCascadeOptions>(partSearch.getCascadeOptions(data ?? {}));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("smsupport:searchParts", async (_event, data: PartSearchParams | undefined) => {
    try {
      assertCanViewApp(APP_ID);
      ensureDrawingLibraryForSheetMetalSupport();
      return ok<PartSearchResult>(partSearch.searchParts(data ?? {}));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("smsupport:getPartDetail", async (_event, data: { partNumber: string }) => {
    try {
      assertCanViewApp(APP_ID);
      ensureDrawingLibraryForSheetMetalSupport();
      return ok<PartDetail | null>(partSearch.getPartDetail(data?.partNumber ?? ""));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("smsupport:getDrawingFile", async (_event, data: { drawingId: number }) => {
    try {
      assertCanViewApp(APP_ID);
      ensureDrawingLibraryForSheetMetalSupport();
      return ok<DrawingFilePayload>(await partSearch.getDrawingFile(data?.drawingId));
    } catch (err) {
      return fail(err);
    }
  });
}

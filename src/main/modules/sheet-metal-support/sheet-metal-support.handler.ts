import { BrowserWindow, dialog, type IpcMain } from "electron";

import { fail, ok } from "@shared/ipcResponse.js";
import type {
  DrawingFilePayload,
  MachineOption,
  ModelAnalysis,
  ModelAnalysisRecord,
  PartDetail,
  PartSearchCascadeOptions,
  PartSearchCascadeParams,
  PartSearchParams,
  PartSearchResult,
  ProcessCondition,
  ProcessConditionInput,
  ProcessHistory,
  ProcessHistoryCreateInput,
  RevisionHistory,
  SheetMetalSupportStatus,
  SimulationModel,
  SimulationModelFilePayload,
  SimulationResult,
  TechnicalNote,
  TechnicalNoteCreateInput,
  TechnicalNoteUpdateInput,
  ToolOption,
} from "@shared/sheetMetalSupport.js";

import { assertCanViewApp, assertCanWriteApp } from "@main/auth-guard.js";
import { ensureDrawingLibraryForSheetMetalSupport } from "@main/sheet-metal-support-guard.js";
import { isSheetMetalSupportOpen } from "@main/db/sheetMetalSupportConnection.js";
import { isDrawingLibraryOpen } from "@main/db/drawingLibraryConnection.js";

import * as judgement from "./judgement.service.js";
import * as partSearch from "./part-search.service.js";
import * as processInfo from "./process-info.service.js";

const APP_ID = "sheet-metal-support";

function dialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? undefined;
}

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

  // -------- Phase 2: 機械マスタ参照 --------

  ipcMain.handle("smsupport:listMachines", async () => {
    try {
      assertCanViewApp(APP_ID);
      return ok<MachineOption[]>(processInfo.listMachines());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("smsupport:listTools", async () => {
    try {
      assertCanViewApp(APP_ID);
      return ok<{ upper: ToolOption[]; lower: ToolOption[] }>({
        upper: processInfo.listUpperTools(),
        lower: processInfo.listLowerTools(),
      });
    } catch (err) {
      return fail(err);
    }
  });

  // -------- Phase 2: 加工条件 --------

  ipcMain.handle("smsupport:processCondition:getByPart", async (_event, data: { partNumber: string }) => {
    try {
      assertCanViewApp(APP_ID);
      return ok<ProcessCondition | null>(processInfo.getProcessCondition(data?.partNumber ?? ""));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("smsupport:processCondition:save", async (_event, data: ProcessConditionInput) => {
    try {
      const session = assertCanWriteApp(APP_ID);
      return ok<ProcessCondition>(processInfo.saveProcessCondition(data, session.userNameId));
    } catch (err) {
      return fail(err);
    }
  });

  // -------- Phase 2: 技術ノート --------

  ipcMain.handle("smsupport:technicalNote:listByPart", async (_event, data: { partNumber: string }) => {
    try {
      assertCanViewApp(APP_ID);
      return ok<TechnicalNote[]>(processInfo.listTechnicalNotes(data?.partNumber ?? ""));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("smsupport:technicalNote:create", async (_event, data: TechnicalNoteCreateInput) => {
    try {
      const session = assertCanWriteApp(APP_ID);
      return ok<TechnicalNote>(processInfo.createTechnicalNote(data, session.userNameId));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("smsupport:technicalNote:update", async (_event, data: TechnicalNoteUpdateInput) => {
    try {
      const session = assertCanWriteApp(APP_ID);
      return ok<TechnicalNote>(processInfo.updateTechnicalNote(data, session.userNameId));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("smsupport:technicalNote:delete", async (_event, data: { id: number }) => {
    try {
      const session = assertCanWriteApp(APP_ID);
      return ok<{ id: number }>(processInfo.deleteTechnicalNote(data?.id, session.userNameId));
    } catch (err) {
      return fail(err);
    }
  });

  // -------- Phase 2: 加工履歴 --------

  ipcMain.handle("smsupport:processHistory:listByPart", async (_event, data: { partNumber: string }) => {
    try {
      assertCanViewApp(APP_ID);
      return ok<ProcessHistory[]>(processInfo.listProcessHistories(data?.partNumber ?? ""));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("smsupport:processHistory:create", async (_event, data: ProcessHistoryCreateInput) => {
    try {
      const session = assertCanWriteApp(APP_ID);
      return ok<ProcessHistory>(processInfo.createProcessHistory(data, session.userNameId));
    } catch (err) {
      return fail(err);
    }
  });

  // -------- Phase 2: 更新履歴 --------

  ipcMain.handle("smsupport:revisionHistory:listByPart", async (_event, data: { partNumber: string }) => {
    try {
      assertCanViewApp(APP_ID);
      return ok<RevisionHistory[]>(processInfo.listRevisionHistories(data?.partNumber ?? ""));
    } catch (err) {
      return fail(err);
    }
  });

  // -------- Phase 3: 3Dモデル（STEP シミュレーション） --------

  ipcMain.handle("smsupport:simulation:getByPart", async (_event, data: { partNumber: string }) => {
    try {
      assertCanViewApp(APP_ID);
      return ok<SimulationModel | null>(processInfo.getSimulationModel(data?.partNumber ?? ""));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("smsupport:simulation:pickModel", async (_event, data: { partNumber: string }) => {
    try {
      const session = assertCanWriteApp(APP_ID);
      const partNumber = data?.partNumber?.trim();
      if (!partNumber) throw new Error("品番を指定してください。");
      const parent = dialogParent();
      const opts: Electron.OpenDialogOptions = {
        filters: [{ name: "STEP", extensions: ["step", "stp"] }],
        properties: ["openFile"],
      };
      const res = parent
        ? await dialog.showOpenDialog(parent, opts)
        : await dialog.showOpenDialog(opts);
      if (res.canceled || !res.filePaths[0]) {
        throw new Error("ファイルが選択されませんでした。");
      }
      return ok<SimulationModel>(
        await processInfo.saveSimulationModelFromPath(partNumber, res.filePaths[0], session.userNameId)
      );
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("smsupport:simulation:getModelFile", async (_event, data: { partNumber: string }) => {
    try {
      assertCanViewApp(APP_ID);
      return ok<SimulationModelFilePayload>(
        await processInfo.readSimulationModelFile(data?.partNumber ?? "")
      );
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("smsupport:simulation:deleteModel", async (_event, data: { partNumber: string }) => {
    try {
      const session = assertCanWriteApp(APP_ID);
      return ok<{ partNumber: string }>(
        await processInfo.deleteSimulationModel(data?.partNumber ?? "", session.userNameId)
      );
    } catch (err) {
      return fail(err);
    }
  });

  // -------- Phase 4: 加工判断エンジン --------

  ipcMain.handle("smsupport:simulation:run", async (_event, data: { partNumber: string }) => {
    try {
      const session = assertCanWriteApp(APP_ID);
      return ok<SimulationResult>(judgement.run(data?.partNumber ?? "", session.userNameId));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("smsupport:simulation:getResult", async (_event, data: { partNumber: string }) => {
    try {
      assertCanViewApp(APP_ID);
      return ok<SimulationResult | null>(judgement.getResult(data?.partNumber ?? ""));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "smsupport:simulation:saveAnalysis",
    async (_event, data: { partNumber: string; analysis: ModelAnalysis }) => {
      try {
        const session = assertCanWriteApp(APP_ID);
        return ok<ModelAnalysisRecord>(
          judgement.saveAnalysis(data?.partNumber ?? "", data?.analysis, session.userNameId)
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "smsupport:simulation:getAnalysis",
    async (_event, data: { partNumber: string }) => {
      try {
        assertCanViewApp(APP_ID);
        return ok<ModelAnalysisRecord | null>(judgement.getAnalysis(data?.partNumber ?? ""));
      } catch (err) {
        return fail(err);
      }
    }
  );
}

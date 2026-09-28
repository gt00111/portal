import { BrowserWindow, dialog, type IpcMain } from "electron";

import { fail, ok } from "@shared/ipcResponse.js";
import type { SheetMetalCamLaunchResult, SheetMetalCamMasterExport, SheetMetalCamStatus } from "@shared/sheetMetalCam.js";
import type { MasterRow, MasterUpsertInput } from "@shared/master.js";
import { assertCanViewApp, assertCanWriteApp } from "@main/auth-guard.js";
import * as cam from "@main/modules/sheet-metal-support/cam-integration.service.js";
import * as master from "./m-bend-master.repo.js";
import * as geometry from "./m-bend-geometry.service.js";
import type { GeometryTarget, GeometryUpdate } from "@shared/mBendGeometry.js";
import { getMBendDbPath } from "@main/db/mBendConnection.js";

const APP_ID = "m-bend";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("mbend:geometry:get", async (_event, data: GeometryTarget) => {
    try { assertCanViewApp(APP_ID); return ok(geometry.getGeometry(data)); } catch (err) { return fail(err); }
  });
  ipcMain.handle("mbend:geometry:save", async (_event, data: GeometryUpdate) => {
    try { assertCanWriteApp(APP_ID); return ok(geometry.savePlacement(data)); } catch (err) { return fail(err); }
  });
  ipcMain.handle("mbend:geometry:read", async (_event, data: GeometryTarget) => {
    try { assertCanViewApp(APP_ID); return ok(await geometry.readModel(data)); } catch (err) { return fail(err); }
  });
  ipcMain.handle("mbend:geometry:import", async (_event, data: GeometryTarget & { revision: number }) => {
    try {
      assertCanWriteApp(APP_ID);
      geometry.getGeometry(data);
      const dbPath = getMBendDbPath();
      const result = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "STEP", extensions: ["step", "stp"] }] });
      if (result.canceled || !result.filePaths[0]) return ok(null);
      assertCanWriteApp(APP_ID);
      if (getMBendDbPath() !== dbPath) throw new Error("接続DBが変更されました。再度取り込んでください。");
      return ok(await geometry.importStep(data, data.revision, result.filePaths[0]));
    } catch (err) { return fail(err); }
  });
  ipcMain.handle("mbend:master:list", async (_event, data: { table: string }) => {
    try { assertCanViewApp(APP_ID); return ok<MasterRow[]>(master.list(data.table)); }
    catch (err) { return fail(err); }
  });
  ipcMain.handle("mbend:master:create", async (_event, data: { table: string; input: MasterUpsertInput }) => {
    try { assertCanWriteApp(APP_ID); validateInput(data.input); return ok<MasterRow>(master.create(data.table, data.input)); }
    catch (err) { return fail(err); }
  });
  ipcMain.handle("mbend:master:update", async (_event, data: { table: string; id: number; input: MasterUpsertInput }) => {
    try { assertCanWriteApp(APP_ID); validateInput(data.input); return ok<MasterRow>(master.update(data.table, data.id, data.input)); }
    catch (err) { return fail(err); }
  });
  ipcMain.handle("mbend:master:delete", async (_event, data: { table: string; id: number }) => {
    try { assertCanWriteApp(APP_ID); master.remove(data.table, data.id); return ok(null); }
    catch (err) { return fail(err); }
  });
  ipcMain.handle("mbend:master:importPortal", async () => {
    try { assertCanWriteApp(APP_ID); return ok(master.importFromPortalMaster()); }
    catch (err) { return fail(err); }
  });
  ipcMain.handle("mbend:status", async () => {
    try { assertCanViewApp(APP_ID); return ok<SheetMetalCamStatus>(cam.getCamStatus()); }
    catch (err) { return fail(err); }
  });
  ipcMain.handle("mbend:selectFolder", async (_event, data: { target: "mbend" | "import" }) => {
    try {
      assertCanWriteApp(APP_ID);
      const parent = BrowserWindow.getFocusedWindow() ?? undefined;
      const options: Electron.OpenDialogOptions = { properties: ["openDirectory"] };
      const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
      const selectedPath = result.filePaths[0];
      if (result.canceled || !selectedPath) return ok<SheetMetalCamStatus>(cam.getCamStatus());
      if (data?.target === "mbend") cam.setMbendRoot(selectedPath);
      else if (data?.target === "import") cam.setImportRoot(selectedPath);
      else throw new Error("設定対象が不正です。");
      return ok<SheetMetalCamStatus>(cam.getCamStatus());
    } catch (err) { return fail(err); }
  });
  ipcMain.handle("mbend:exportMasters", async () => {
    try { assertCanWriteApp(APP_ID); return ok<SheetMetalCamMasterExport>(cam.exportCamMasters()); }
    catch (err) { return fail(err); }
  });
  ipcMain.handle("mbend:launch", async () => {
    try { assertCanWriteApp(APP_ID); return ok<SheetMetalCamLaunchResult>(await cam.launchMbend()); }
    catch (err) { return fail(err); }
  });
}

function validateInput(input: MasterUpsertInput): void {
  if (!input?.code?.trim()) throw new Error("コードを入力してください。");
  if (!input?.name?.trim()) throw new Error("名称を入力してください。");
}

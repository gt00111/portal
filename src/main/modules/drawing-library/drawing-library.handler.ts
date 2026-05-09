import { BrowserWindow, dialog, type IpcMain } from "electron";
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { basename } from "node:path";

import type {
  CompareDrawingsInput,
  DrawingListParams,
  DrawingUpsertInput,
  DrawingWorkCascadeResult,
} from "@shared/drawingLibrary.js";
import { fail, ok } from "@shared/ipcResponse.js";
import type { ProjectFileWithProject } from "@shared/seisan/projectFile.js";

import { assertCanWrite, assertLoggedIn } from "@main/auth-guard.js";
import { ensureDrawingLibrary } from "@main/drawing-library-guard.js";
import { getDrawingLibraryDbPath } from "@main/db/drawingLibraryConnection.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";
import { getPortalWindow } from "@main/window.js";

import * as attachments from "./drawingAttachments.repo.js";
import { compareDrawings } from "./drawingCompare.js";
import * as filesRead from "./drawingFilesRead.repo.js";
import * as masters from "./drawingMasters.repo.js";
import * as repo from "./drawing-library.repo.js";
import * as drawings from "./drawings.repo.js";
import { ensureDxfInCustomerFolder, ensureEdrawingsInFolder, ensurePdfInCustomerFolder, resolveUnderDataDir } from "./drawingStorage.js";

function dialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? getPortalWindow() ?? undefined;
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("drawing-library:listSeisanCustomerDrawings", async () => {
    try {
      assertLoggedIn();
      ensureSeisanSatellite();
      return ok<ProjectFileWithProject[]>(repo.listSeisanCustomerDrawings());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("drawing-library:status", async () => {
    try {
      assertLoggedIn();
      const path = getDrawingLibraryDbPath();
      return ok<{ connected: boolean; path: string | null }>({
        connected: path !== null,
        path,
      });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("drawing:list", async (_event, data: DrawingListParams | undefined) => {
    try {
      assertLoggedIn();
      ensureDrawingLibrary();
      return ok(drawings.listDrawings(data ?? {}));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "drawing:workCascadeOptions",
    async (_event, data: { customerName?: string | null; model?: string | null } | undefined) => {
      try {
        assertLoggedIn();
        ensureDrawingLibrary();
        const opts = drawings.getWorkCascadeOptions(data?.customerName, data?.model);
        return ok<DrawingWorkCascadeResult>(opts);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("drawing:get", async (_event, data: { id?: number }) => {
    try {
      assertLoggedIn();
      ensureDrawingLibrary();
      if (data?.id == null) throw new Error("id が必要です。");
      const row = drawings.getDrawing(data.id);
      if (!row) throw new Error("図面が見つかりません。");
      return ok(row);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("drawing:create", async (_event, data: { input?: DrawingUpsertInput }) => {
    try {
      assertCanWrite();
      ensureDrawingLibrary();
      if (!data?.input?.title) throw new Error("タイトルが必要です。");
      return ok(drawings.insertDrawing(data.input));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "drawing:update",
    async (_event, data: { id?: number; patch?: Partial<DrawingUpsertInput> }) => {
      try {
        assertCanWrite();
        ensureDrawingLibrary();
        if (data?.id == null) throw new Error("id が必要です。");
        return ok(drawings.updateDrawing(data.id, data.patch ?? {}));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("drawing:delete", async (_event, data: { id?: number }) => {
    try {
      assertCanWrite();
      ensureDrawingLibrary();
      if (data?.id == null) throw new Error("id が必要です。");
      await drawings.deleteDrawing(data.id);
      return ok(null);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "drawing:setObsolete",
    async (_event, data: { id?: number; isObsolete?: boolean }) => {
      try {
        assertCanWrite();
        ensureDrawingLibrary();
        if (data?.id == null) throw new Error("id が必要です。");
        return ok(drawings.setObsolete(data.id, data.isObsolete === true));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "drawing:checkDuplicate",
    async (
      _event,
      data: {
        product_name?: string;
        revision?: string;
        drawing_type?: string;
        exclude_id?: number;
      }
    ) => {
      try {
        assertLoggedIn();
        ensureDrawingLibrary();
        if (!data?.product_name?.trim() || !data?.revision?.trim()) {
          return ok({ is_duplicate: false as const, existing: null });
        }
        const existing = drawings.checkDuplicate(
          data.product_name,
          data.revision,
          data.drawing_type ?? "customer",
          data.exclude_id
        );
        return ok({
          is_duplicate: Boolean(existing),
          existing,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "drawing:pickPdf",
    async (
      _event,
      data: { customerName?: string; drawingType?: "customer" | "work" } | undefined
    ) => {
      try {
        assertCanWrite();
        ensureDrawingLibrary();
        if (!data?.customerName?.trim()) throw new Error("顧客名が必要です。");
        const parent = dialogParent();
        const res = parent
          ? await dialog.showOpenDialog(parent, {
              filters: [{ name: "PDF", extensions: ["pdf"] }],
              properties: ["openFile"],
            })
          : await dialog.showOpenDialog({
              filters: [{ name: "PDF", extensions: ["pdf"] }],
              properties: ["openFile"],
            });
        if (res.canceled || !res.filePaths[0]) {
          throw new Error("ファイルが選択されませんでした。");
        }
        const { relativePath } = await ensurePdfInCustomerFolder(
          res.filePaths[0],
          data.customerName,
          data.drawingType ?? "customer"
        );
        return ok({ file_path: relativePath });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("drawing:readFile", async (_event, data: { relativePath?: string }) => {
    try {
      assertLoggedIn();
      ensureDrawingLibrary();
      if (!data?.relativePath?.trim()) throw new Error("relativePath が必要です。");
      const payload = await filesRead.readDataFileAsBase64(data.relativePath);
      return ok(payload);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "drawing:exportFile",
    async (_event, data: { relativePath?: string; defaultName?: string }) => {
      try {
        assertLoggedIn();
        ensureDrawingLibrary();
        if (!data?.relativePath?.trim()) throw new Error("relativePath が必要です。");
        const abs = resolveUnderDataDir(data.relativePath.trim());
        if (!existsSync(abs)) throw new Error("ファイルが見つかりません。");
        const suggest = data.defaultName?.trim() || basename(abs);
        const parent = dialogParent();
        const res = parent
          ? await dialog.showSaveDialog(parent, { defaultPath: suggest })
          : await dialog.showSaveDialog({ defaultPath: suggest });
        if (res.canceled || !res.filePath) {
          throw new Error("保存がキャンセルされました。");
        }
        await copyFile(abs, res.filePath);
        return ok<{ path: string }>({ path: res.filePath });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("drawing-dxf:list", async (_event, data: { drawing_id?: number }) => {
    try {
      assertLoggedIn();
      ensureDrawingLibrary();
      if (data?.drawing_id == null) throw new Error("drawing_id が必要です。");
      return ok(attachments.listDxfByDrawing(data.drawing_id));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "drawing-dxf:upload",
    async (_event, data: { drawing_id?: number; customerName?: string }) => {
      try {
        assertCanWrite();
        ensureDrawingLibrary();
        if (data?.drawing_id == null) throw new Error("drawing_id が必要です。");
        if (!data?.customerName?.trim()) throw new Error("顧客名が必要です。");
        const parent = dialogParent();
        const res = parent
          ? await dialog.showOpenDialog(parent, {
              filters: [{ name: "DXF", extensions: ["dxf"] }],
              properties: ["openFile"],
            })
          : await dialog.showOpenDialog({
              filters: [{ name: "DXF", extensions: ["dxf"] }],
              properties: ["openFile"],
            });
        if (res.canceled || !res.filePaths[0]) {
          throw new Error("ファイルが選択されませんでした。");
        }
        const src = res.filePaths[0];
        const { relativePath } = await ensureDxfInCustomerFolder(src, data.customerName);
        const { statSync } = await import("node:fs");
        const st = statSync(src);
        const row = attachments.insertDxfRow(
          data.drawing_id,
          relativePath,
          src.split(/[/\\]/).pop() ?? "file.dxf",
          st.size
        );
        return ok(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("drawing-dxf:delete", async (_event, data: { id?: number }) => {
    try {
      assertCanWrite();
      ensureDrawingLibrary();
      if (data?.id == null) throw new Error("id が必要です。");
      await attachments.deleteDxfFile(data.id);
      return ok(null);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("drawing-edrawings:list", async (_event, data: { drawing_id?: number }) => {
    try {
      assertLoggedIn();
      ensureDrawingLibrary();
      if (data?.drawing_id == null) throw new Error("drawing_id が必要です。");
      return ok(attachments.listEdrawingsByDrawing(data.drawing_id));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "drawing-edrawings:upload",
    async (_event, data: { drawing_id?: number; customerName?: string }) => {
      try {
        assertCanWrite();
        ensureDrawingLibrary();
        if (data?.drawing_id == null) throw new Error("drawing_id が必要です。");
        if (!data?.customerName?.trim()) throw new Error("顧客名が必要です。");
        const parent = dialogParent();
        const res = parent
          ? await dialog.showOpenDialog(parent, {
              filters: [
                {
                  name: "eDrawings",
                  extensions: ["easm", "eprt", "edrw"],
                },
              ],
              properties: ["openFile"],
            })
          : await dialog.showOpenDialog({
              filters: [
                {
                  name: "eDrawings",
                  extensions: ["easm", "eprt", "edrw"],
                },
              ],
              properties: ["openFile"],
            });
        if (res.canceled || !res.filePaths[0]) {
          throw new Error("ファイルが選択されませんでした。");
        }
        const src = res.filePaths[0];
        const { relativePath } = await ensureEdrawingsInFolder(src, data.customerName);
        const { statSync } = await import("node:fs");
        const st = statSync(src);
        const row = attachments.insertEdrawingsRow(
          data.drawing_id,
          relativePath,
          src.split(/[/\\]/).pop() ?? "file.easm",
          st.size
        );
        return ok(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("drawing-edrawings:delete", async (_event, data: { id?: number }) => {
    try {
      assertCanWrite();
      ensureDrawingLibrary();
      if (data?.id == null) throw new Error("id が必要です。");
      await attachments.deleteEdrawingsFile(data.id);
      return ok(null);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("drawing-comment:list", async (_event, data: { drawing_id?: number }) => {
    try {
      assertLoggedIn();
      ensureDrawingLibrary();
      if (data?.drawing_id == null) throw new Error("drawing_id が必要です。");
      return ok(attachments.listComments(data.drawing_id));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "drawing-comment:create",
    async (_event, data: { drawing_id?: number; comment_text?: string }) => {
      try {
        assertCanWrite();
        ensureDrawingLibrary();
        if (data?.drawing_id == null) throw new Error("drawing_id が必要です。");
        if (!data?.comment_text?.trim()) throw new Error("コメントが必要です。");
        return ok(attachments.insertComment(data.drawing_id, data.comment_text));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "drawing-comment:update",
    async (_event, data: { id?: number; comment_text?: string }) => {
      try {
        assertCanWrite();
        ensureDrawingLibrary();
        if (data?.id == null) throw new Error("id が必要です。");
        if (!data?.comment_text?.trim()) throw new Error("コメントが必要です。");
        return ok(attachments.updateComment(data.id, data.comment_text));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("drawing-comment:delete", async (_event, data: { id?: number }) => {
    try {
      assertCanWrite();
      ensureDrawingLibrary();
      if (data?.id == null) throw new Error("id が必要です。");
      attachments.deleteComment(data.id);
      return ok(null);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("drawing-library:compare", async (_event, data: CompareDrawingsInput | undefined) => {
    try {
      assertLoggedIn();
      if (!data?.filePath1 || !data?.filePath2) {
        throw new Error("比較するファイルパスが必要です。");
      }
      return ok(await compareDrawings(data));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("drawing-library:pickPdfForCompare", async () => {
    try {
      assertLoggedIn();
      const parent = dialogParent();
      const res = parent
        ? await dialog.showOpenDialog(parent, {
            filters: [{ name: "PDF", extensions: ["pdf"] }],
            properties: ["openFile"],
          })
        : await dialog.showOpenDialog({
            filters: [{ name: "PDF", extensions: ["pdf"] }],
            properties: ["openFile"],
          });
      if (res.canceled || !res.filePaths[0]) {
        throw new Error("ファイルが選択されませんでした。");
      }
      return ok<{ path: string }>({ path: res.filePaths[0] });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "drawing-library:categoryList",
    async (_event, data: { drawingType?: "customer" | "work" } | undefined) => {
      try {
        assertLoggedIn();
        ensureDrawingLibrary();
        const t = data?.drawingType ?? "customer";
        return ok(t === "work" ? masters.listWorkCategories() : masters.listCustomerCategories());
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "drawing-library:categoryAdd",
    async (_event, data: { drawingType?: "customer" | "work"; name?: string }) => {
      try {
        assertCanWrite();
        ensureDrawingLibrary();
        if (!data?.name?.trim()) throw new Error("名前が必要です。");
        if (data.drawingType === "work") {
          masters.insertWorkCategory(data.name);
        } else {
          masters.insertCustomerCategory(data.name);
        }
        return ok(null);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "drawing-library:categoryDelete",
    async (_event, data: { drawingType?: "customer" | "work"; name?: string }) => {
      try {
        assertCanWrite();
        ensureDrawingLibrary();
        if (!data?.name) throw new Error("名前が必要です。");
        if (data.drawingType === "work") {
          masters.deleteWorkCategory(data.name);
        } else {
          masters.deleteCustomerCategory(data.name);
        }
        return ok(null);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "drawing-library:masterList",
    async (_event, data: { table?: "customers" | "models" | "products" }) => {
      try {
        assertLoggedIn();
        ensureDrawingLibrary();
        const t = data?.table ?? "customers";
        if (t === "models") return ok(masters.listModels());
        if (t === "products") return ok(masters.listProducts());
        return ok(masters.listCustomers());
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "drawing-library:masterCreate",
    async (_event, data: { table?: "customers" | "models" | "products"; name?: string }) => {
      try {
        assertCanWrite();
        ensureDrawingLibrary();
        if (!data?.name?.trim()) throw new Error("名前が必要です。");
        const t = data.table ?? "customers";
        if (t === "models") return ok(masters.insertModel(data.name));
        if (t === "products") return ok(masters.insertProduct(data.name));
        return ok(masters.insertCustomer(data.name));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "drawing-library:masterDelete",
    async (_event, data: { table?: "customers" | "models" | "products"; id?: number }) => {
      try {
        assertCanWrite();
        ensureDrawingLibrary();
        if (data?.id == null) throw new Error("id が必要です。");
        const t = data.table ?? "customers";
        if (t === "models") masters.deleteModel(data.id);
        else if (t === "products") masters.deleteProduct(data.id);
        else masters.deleteCustomer(data.id);
        return ok(null);
      } catch (err) {
        return fail(err);
      }
    }
  );
}

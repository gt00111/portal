import type { IpcMain } from "electron";

import { fail, ok } from "@shared/ipcResponse.js";
import type { SkuRow, SkuUpsertInput } from "@shared/sku.js";

import { assertCanWrite, assertLoggedIn } from "@main/auth-guard.js";

import { insert, listAll, remove, update } from "./sku.repo.js";

function toIdOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalize(data: unknown): SkuUpsertInput {
  const obj = (data ?? {}) as Partial<SkuUpsertInput>;
  return {
    customerId: toIdOrNull(obj.customerId),
    modelId: toIdOrNull(obj.modelId),
    partNumberId: toIdOrNull(obj.partNumberId),
    componentNameId: toIdOrNull(obj.componentNameId),
    drawingNumber: obj.drawingNumber === undefined ? null : (obj.drawingNumber as string | null),
    revision: obj.revision === undefined ? null : (obj.revision as string | null),
    note: obj.note === undefined ? null : (obj.note as string | null),
    isActive: obj.isActive !== false,
  };
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("sku:list", async () => {
    try {
      assertLoggedIn();
      return ok<SkuRow[]>(listAll());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("sku:create", async (_event, data: { input: SkuUpsertInput }) => {
    try {
      assertCanWrite();
      const row = insert(normalize(data?.input));
      return ok<SkuRow>(row);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "sku:update",
    async (_event, data: { id: number; input: SkuUpsertInput }) => {
      try {
        assertCanWrite();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        const row = update(id, normalize(data?.input));
        return ok<SkuRow>(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("sku:delete", async (_event, data: { id: number }) => {
    try {
      assertCanWrite();
      const id = Number(data?.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
      remove(id);
      return ok<null>(null);
    } catch (err) {
      return fail(err);
    }
  });
}

import type { IpcMain } from "electron";

import { fail, ok } from "@shared/ipcResponse.js";
import type { MasterRow, MasterUpsertInput } from "@shared/master.js";

import { assertCanWrite, assertLoggedIn } from "@main/auth-guard.js";

import { insert, listAll, remove, update } from "./master.repo.js";

function normalizeInput(data: unknown): MasterUpsertInput {
  const obj = (data ?? {}) as Partial<MasterUpsertInput>;
  const code = (obj.code ?? "").toString().trim();
  const name = (obj.name ?? "").toString().trim();
  if (!code) throw new Error("コードは必須です。");
  if (!name) throw new Error("名称は必須です。");
  return {
    code,
    name,
    note: obj.note?.toString() ?? null,
    isActive: obj.isActive !== false,
  };
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("master:list", async (_event, data: { table: string }) => {
    try {
      assertLoggedIn();
      return ok<MasterRow[]>(listAll(data?.table));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "master:create",
    async (_event, data: { table: string; input: MasterUpsertInput }) => {
      try {
        assertCanWrite();
        const row = insert(data?.table, normalizeInput(data?.input));
        return ok<MasterRow>(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:update",
    async (
      _event,
      data: { table: string; id: number; input: MasterUpsertInput }
    ) => {
      try {
        assertCanWrite();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        const row = update(data?.table, id, normalizeInput(data?.input));
        return ok<MasterRow>(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:delete",
    async (_event, data: { table: string; id: number }) => {
      try {
        assertCanWrite();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        remove(data?.table, id);
        return ok<null>(null);
      } catch (err) {
        return fail(err);
      }
    }
  );
}

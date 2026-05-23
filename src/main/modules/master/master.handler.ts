import type { IpcMain } from "electron";

import { fail, ok } from "@shared/ipcResponse.js";
import type { MasterRow, MasterUpsertInput } from "@shared/master.js";

import { appendAuditEntry } from "@main/audit/audit.repo.js";
import { assertLoggedIn, assertPortalAdmin } from "@main/auth-guard.js";

import { insert, listAll, remove, update } from "./master.repo.js";

function normalizeInput(data: unknown): MasterUpsertInput {
  const obj = (data ?? {}) as Partial<MasterUpsertInput>;
  const code = (obj.code ?? "").toString().trim();
  const name = (obj.name ?? "").toString().trim();
  if (!code) throw new Error("コードは必須です。");
  if (!name) throw new Error("名称は必須です。");
  const scopeRaw = obj.scope == null ? null : obj.scope.toString().trim();
  return {
    code,
    name,
    note: obj.note?.toString() ?? null,
    isActive: obj.isActive !== false,
    scope: scopeRaw && scopeRaw.length > 0 ? scopeRaw : null,
  };
}

function pickScope(value: unknown): string | null {
  if (value == null) return null;
  const s = value.toString().trim();
  return s.length > 0 ? s : null;
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(
    "master:list",
    async (_event, data: { table: string; scope?: string | null }) => {
      try {
        assertLoggedIn();
        return ok<MasterRow[]>(listAll(data?.table, pickScope(data?.scope)));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:create",
    async (_event, data: { table: string; input: MasterUpsertInput }) => {
      try {
        assertPortalAdmin();
        const row = insert(data?.table, normalizeInput(data?.input));
        appendAuditEntry({
          channel: "master:create",
          action: "create",
          result: "ok",
          targetType: data?.table ?? "master",
          targetId: row.id,
          detail: { code: row.code, name: row.name, scope: row.scope ?? null },
        });
        return ok<MasterRow>(row);
      } catch (err) {
        appendAuditEntry({
          channel: "master:create",
          action: "create",
          result: "fail",
          targetType: data?.table ?? "master",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
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
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        const row = update(data?.table, id, normalizeInput(data?.input));
        appendAuditEntry({
          channel: "master:update",
          action: "update",
          result: "ok",
          targetType: data?.table ?? "master",
          targetId: id,
          detail: { code: row.code, name: row.name, scope: row.scope ?? null },
        });
        return ok<MasterRow>(row);
      } catch (err) {
        appendAuditEntry({
          channel: "master:update",
          action: "update",
          result: "fail",
          targetType: data?.table ?? "master",
          targetId: data?.id ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:delete",
    async (_event, data: { table: string; id: number }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        remove(data?.table, id);
        appendAuditEntry({
          channel: "master:delete",
          action: "delete",
          result: "ok",
          targetType: data?.table ?? "master",
          targetId: id,
        });
        return ok<null>(null);
      } catch (err) {
        appendAuditEntry({
          channel: "master:delete",
          action: "delete",
          result: "fail",
          targetType: data?.table ?? "master",
          targetId: data?.id ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );
}

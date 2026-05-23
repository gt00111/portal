import type { IpcMain } from "electron";

import { APP_ROLES, type AppRole } from "@shared/auth.js";
import { fail, ok } from "@shared/ipcResponse.js";
import type { OperatorRow } from "@shared/types.js";

import { appendAuditEntry } from "@main/audit/audit.repo.js";
import { assertPortalAdmin } from "@main/auth-guard.js";
import { hashPassword } from "@main/password.js";

import {
  countOtherActiveAdmins,
  insertOperator,
  listOperators,
  updateActiveFlag,
  updateRole,
} from "./operator.repo.js";

function assertValidRole(role: unknown): asserts role is AppRole {
  if (typeof role !== "string" || !APP_ROLES.includes(role as AppRole)) {
    throw new Error("不正な権限です。");
  }
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("operator:list", async () => {
    try {
      assertPortalAdmin();
      return ok<OperatorRow[]>(listOperators());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "operator:create",
    async (_event, data: { username: string; password: string; role: AppRole }) => {
      try {
        assertPortalAdmin();
        const username = (data?.username ?? "").trim();
        const password = (data?.password ?? "").toString();
        if (username.length === 0) throw new Error("ユーザー名は必須です。");
        if (password.length < 6) throw new Error("パスワードは 6 文字以上にしてください。");
        assertValidRole(data?.role);
        const passwordHash = await hashPassword(password);
        const row = insertOperator({ username, passwordHash, role: data.role });
        appendAuditEntry({
          channel: "operator:create",
          action: "create",
          result: "ok",
          targetType: "operator",
          targetId: row.id,
          detail: { username, role: data.role },
        });
        return ok<OperatorRow>(row);
      } catch (err) {
        appendAuditEntry({
          channel: "operator:create",
          action: "create",
          result: "fail",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "operator:setActive",
    async (_event, data: { id: number; isActive: boolean }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        const isActive = Boolean(data?.isActive);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        if (!isActive && countOtherActiveAdmins(id) === 0) {
          throw new Error("最後の有効な管理者を無効化することはできません。");
        }
        updateActiveFlag(id, isActive);
        appendAuditEntry({
          channel: "operator:setActive",
          action: "update",
          result: "ok",
          targetType: "operator",
          targetId: id,
          detail: { isActive },
        });
        return ok<null>(null);
      } catch (err) {
        appendAuditEntry({
          channel: "operator:setActive",
          action: "update",
          result: "fail",
          targetType: "operator",
          targetId: data?.id ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "operator:updateRole",
    async (_event, data: { id: number; role: AppRole }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        assertValidRole(data?.role);
        if (data.role !== "admin" && countOtherActiveAdmins(id) === 0) {
          throw new Error("最後の有効な管理者を降格することはできません。");
        }
        updateRole(id, data.role);
        appendAuditEntry({
          channel: "operator:updateRole",
          action: "update",
          result: "ok",
          targetType: "operator",
          targetId: id,
          detail: { role: data.role },
        });
        return ok<null>(null);
      } catch (err) {
        appendAuditEntry({
          channel: "operator:updateRole",
          action: "update",
          result: "fail",
          targetType: "operator",
          targetId: data?.id ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );
}

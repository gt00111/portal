import type { IpcMain } from "electron";

import { APP_ROLES, type AppRole } from "@shared/auth.js";
import { fail, ok } from "@shared/ipcResponse.js";
import type { ProcessView } from "@shared/processView.js";
import { assertProcessView } from "@shared/processView.js";
import type { OperatorRow } from "@shared/types.js";

import { assertAdmin } from "@main/auth-guard.js";
import { hashPassword } from "@main/password.js";

import {
  countOtherActiveAdmins,
  insertOperator,
  listOperators,
  updateActiveFlag,
  updateProcessView,
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
      assertAdmin();
      return ok<OperatorRow[]>(listOperators());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "operator:create",
    async (
      _event,
      data: { username: string; password: string; role: AppRole; processView?: ProcessView }
    ) => {
      try {
        assertAdmin();
        const username = (data?.username ?? "").trim();
        const password = (data?.password ?? "").toString();
        if (username.length === 0) throw new Error("ユーザー名は必須です。");
        if (password.length < 6) throw new Error("パスワードは 6 文字以上にしてください。");
        assertValidRole(data?.role);
        let processView: ProcessView = "both";
        if (data?.processView !== undefined) {
          assertProcessView(data.processView);
          processView = data.processView;
        }
        const passwordHash = await hashPassword(password);
        const row = insertOperator({ username, passwordHash, role: data.role, processView });
        return ok<OperatorRow>(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "operator:setActive",
    async (_event, data: { id: number; isActive: boolean }) => {
      try {
        assertAdmin();
        const id = Number(data?.id);
        const isActive = Boolean(data?.isActive);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        if (!isActive && countOtherActiveAdmins(id) === 0) {
          throw new Error("最後の有効な管理者を無効化することはできません。");
        }
        updateActiveFlag(id, isActive);
        return ok<null>(null);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "operator:updateRole",
    async (_event, data: { id: number; role: AppRole }) => {
      try {
        assertAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        assertValidRole(data?.role);
        if (data.role !== "admin" && countOtherActiveAdmins(id) === 0) {
          throw new Error("最後の有効な管理者を降格することはできません。");
        }
        updateRole(id, data.role);
        return ok<null>(null);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "operator:updateProcessView",
    async (_event, data: { id: number; processView: ProcessView }) => {
      try {
        assertAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        if (data?.processView == null) throw new Error("工程表示を指定してください。");
        assertProcessView(data.processView);
        updateProcessView(id, data.processView);
        return ok<null>(null);
      } catch (err) {
        return fail(err);
      }
    }
  );
}

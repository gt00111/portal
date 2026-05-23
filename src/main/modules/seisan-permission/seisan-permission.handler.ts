import type { IpcMain } from "electron";

import { SEISAN_CHANNELS } from "@shared/seisan/channels.js";
import { fail, ok } from "@shared/ipcResponse.js";

import { appendAuditEntry } from "@main/audit/audit.repo.js";
import { assertAppRoleAtLeast, assertCanViewApp } from "@main/auth-guard.js";
import type { UserRole } from "@main/seisan/repos/userPermissions.repo.js";
import * as userPermissionsRepo from "@main/seisan/repos/userPermissions.repo.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(SEISAN_CHANNELS.permission.list, async () => {
    try {
      assertCanViewApp("seisan-board");
      ensureSeisanSatellite();
      return ok(userPermissionsRepo.list());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(SEISAN_CHANNELS.permission.getRole, async (_event, userName: string) => {
    try {
      assertCanViewApp("seisan-board");
      ensureSeisanSatellite();
      return ok(userPermissionsRepo.getRole(userName));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    SEISAN_CHANNELS.permission.setRole,
    async (_event, input: { user_name?: string; role?: UserRole }) => {
      try {
        assertAppRoleAtLeast("seisan-board", "admin");
        ensureSeisanSatellite();
        const user_name = input?.user_name ?? "";
        const role = input?.role;
        if (!user_name || !role) {
          throw new Error("user_name と role が必要です。");
        }
        const currentRole = userPermissionsRepo.getRole(user_name);
        if (currentRole === "approver" && role !== "approver") {
          const approverCount = userPermissionsRepo.countByRole("approver");
          if (approverCount <= 1) {
            throw new Error(
              "最低1人の承認者が必要です。他のユーザーを承認者に設定してから変更してください。"
            );
          }
        }
        const row = userPermissionsRepo.setRole(user_name, role);
        appendAuditEntry({
          channel: "seisan-permission:setRole",
          action: "update",
          appId: "seisan-board",
          result: "ok",
          targetType: "seisan_user",
          targetId: user_name,
          detail: { role },
        });
        return ok(row);
      } catch (err) {
        appendAuditEntry({
          channel: "seisan-permission:setRole",
          action: "update",
          appId: "seisan-board",
          result: "fail",
          targetType: "seisan_user",
          targetId: input?.user_name ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle(SEISAN_CHANNELS.permission.remove, async (_event, userName: string) => {
    try {
      assertAppRoleAtLeast("seisan-board", "admin");
      ensureSeisanSatellite();
      const currentRole = userPermissionsRepo.getRole(userName);
      if (currentRole === "approver") {
        const approverCount = userPermissionsRepo.countByRole("approver");
        if (approverCount <= 1) {
          throw new Error(
            "最低1人の承認者が必要です。他のユーザーを承認者に設定してから削除してください。"
          );
        }
      }
      userPermissionsRepo.remove(userName);
      appendAuditEntry({
        channel: "seisan-permission:remove",
        action: "delete",
        appId: "seisan-board",
        result: "ok",
        targetType: "seisan_user",
        targetId: userName,
      });
      return ok<void>(undefined);
    } catch (err) {
      appendAuditEntry({
        channel: "seisan-permission:remove",
        action: "delete",
        appId: "seisan-board",
        result: "fail",
        targetType: "seisan_user",
        targetId: typeof userName === "string" ? userName : null,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return fail(err);
    }
  });
}

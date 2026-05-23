import type { IpcMain } from "electron";

import { fail, ok } from "@shared/ipcResponse.js";
import type { GroupRole, UserAccessDetail, UserAppGrantRow } from "@shared/userAccess.js";
import { GROUP_ROLES } from "@shared/userAccess.js";
import { GRANTABLE_APP_IDS } from "@shared/appIds.js";
import { APP_ROLES, type AppRole } from "@shared/auth.js";
import { assertProcessView, type ProcessView } from "@shared/processView.js";

import { appendAuditEntry } from "@main/audit/audit.repo.js";
import { assertPortalAdmin } from "@main/auth-guard.js";

import * as repo from "./user-access.repo.js";

function parseUserNameId(value: unknown): number {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) throw new Error("不正なユーザー ID です。");
  return id;
}

function parseGroupRole(value: unknown): GroupRole {
  const v = (value ?? "").toString();
  if (!(GROUP_ROLES as readonly string[]).includes(v)) {
    throw new Error("グループ内の役割が不正です。");
  }
  return v as GroupRole;
}

function parseAppRole(value: unknown): AppRole {
  const v = (value ?? "").toString();
  if (!(APP_ROLES as readonly string[]).includes(v)) {
    throw new Error("アプリ権限が不正です。");
  }
  return v as AppRole;
}

function parseGrants(raw: unknown): UserAppGrantRow[] {
  if (!Array.isArray(raw)) throw new Error("アプリ権限の形式が不正です。");
  const grants: UserAppGrantRow[] = [];
  for (const item of raw) {
    const obj = item as Partial<UserAppGrantRow>;
    const appId = (obj.appId ?? "").toString();
    if (!GRANTABLE_APP_IDS.includes(appId as (typeof GRANTABLE_APP_IDS)[number])) {
      throw new Error(`不明なアプリ: ${appId}`);
    }
    const appRole = parseAppRole(obj.appRole);
    let processView: ProcessView | null = null;
    if (obj.processView != null) {
      assertProcessView(obj.processView as ProcessView);
      processView = obj.processView as ProcessView;
    }
    grants.push({
      userNameId: 0,
      appId: appId as UserAppGrantRow["appId"],
      appRole,
      processView: appId === "process-management" ? processView : null,
    });
  }
  return grants;
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("user-access:list", async () => {
    try {
      assertPortalAdmin();
      return ok<UserAccessDetail[]>(repo.listUserAccessDetails());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "user-access:setGroupMembership",
    async (
      _event,
      data: { userNameId: number; groupNameId: number | null; roleInGroup: GroupRole }
    ) => {
      try {
        assertPortalAdmin();
        const userNameId = parseUserNameId(data?.userNameId);
        const roleInGroup = parseGroupRole(data?.roleInGroup);
        let groupNameId: number | null = null;
        if (data?.groupNameId != null) {
          const gid = Number(data.groupNameId);
          if (!Number.isFinite(gid) || gid <= 0) throw new Error("不正なグループ ID です。");
          groupNameId = gid;
        }
        repo.saveUserGroupMembership({ userNameId, groupNameId, roleInGroup });
        appendAuditEntry({
          channel: "user-access:setGroupMembership",
          action: "update",
          result: "ok",
          targetType: "user",
          targetId: userNameId,
          detail: { groupNameId, roleInGroup },
        });
        return ok<null>(null);
      } catch (err) {
        appendAuditEntry({
          channel: "user-access:setGroupMembership",
          action: "update",
          result: "fail",
          targetType: "user",
          targetId: data?.userNameId ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "user-access:saveAppGrants",
    async (_event, data: { userNameId: number; grants: UserAppGrantRow[] }) => {
      try {
        assertPortalAdmin();
        const userNameId = parseUserNameId(data?.userNameId);
        const grants = parseGrants(data?.grants);
        repo.saveUserAppGrants(userNameId, grants);
        appendAuditEntry({
          channel: "user-access:saveAppGrants",
          action: "update",
          result: "ok",
          targetType: "user",
          targetId: userNameId,
          detail: {
            grants: grants.map((g) => ({
              appId: g.appId,
              appRole: g.appRole,
              processView: g.processView,
            })),
          },
        });
        return ok<null>(null);
      } catch (err) {
        appendAuditEntry({
          channel: "user-access:saveAppGrants",
          action: "update",
          result: "fail",
          targetType: "user",
          targetId: data?.userNameId ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );
}

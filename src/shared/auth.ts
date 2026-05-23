import type { GrantableAppId } from "./appIds.js";
import type { SessionUser } from "./types.js";

export const APP_ROLES = ["admin", "editor", "viewer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

const ROLE_RANK: Record<AppRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

/** ポータル管理画面・中央マスタ編集 */
export function isPortalAdmin(role: AppRole): boolean {
  return role === "admin";
}

/** @deprecated ポータル用。業務アプリは getAppRole / canAppWrite を使用 */
export function canWrite(role: AppRole): boolean {
  return role === "admin" || role === "editor";
}

/** @deprecated 業務アプリは canOperateProcessMgmtApp(session) を使用 */
export function canOperateProcessMgmtTasks(role: AppRole): boolean {
  return role === "admin" || role === "editor" || role === "viewer";
}

export function isAdmin(role: AppRole): boolean {
  return role === "admin";
}

export function getAppRole(session: SessionUser, appId: GrantableAppId): AppRole | null {
  return session.appGrants[appId] ?? null;
}

function hasAppRoleAtLeast(session: SessionUser, appId: GrantableAppId, min: AppRole): boolean {
  const role = getAppRole(session, appId);
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export function canAppWrite(session: SessionUser, appId: GrantableAppId): boolean {
  return hasAppRoleAtLeast(session, appId, "editor");
}

export function canAppView(session: SessionUser, appId: GrantableAppId): boolean {
  return hasAppRoleAtLeast(session, appId, "viewer");
}

export function canOperateProcessMgmtApp(session: SessionUser): boolean {
  return hasAppRoleAtLeast(session, "process-management", "viewer");
}

export function isGroupAdmin(session: SessionUser): boolean {
  return session.groupRole === "group_admin";
}

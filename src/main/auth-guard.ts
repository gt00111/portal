import {
  canAppView,
  canAppWrite,
  canOperateProcessMgmtApp,
  getAppRole,
  isPortalAdmin,
} from "@shared/auth.js";
import type { GrantableAppId } from "@shared/appIds.js";
import type { AppRole } from "@shared/auth.js";
import type { SessionUser } from "@shared/types.js";

import { getSession } from "./session.js";

export function assertLoggedIn(): SessionUser {
  const session = getSession();
  if (!session) {
    throw new Error("ログインしていません。");
  }
  return session;
}

/** ポータル設定・マスタ編集・操作者管理 */
export function assertPortalAdmin(): SessionUser {
  const session = assertLoggedIn();
  if (!isPortalAdmin(session.role)) {
    throw new Error("ポータル管理者権限が必要です。");
  }
  return session;
}

/** @deprecated マスタ編集は assertPortalAdmin。アプリ書込は assertCanWriteApp を使用 */
export function assertCanWrite(): SessionUser {
  return assertPortalAdmin();
}

export function assertAdmin(): SessionUser {
  return assertPortalAdmin();
}

export function assertCanWriteApp(appId: GrantableAppId): SessionUser {
  const session = assertLoggedIn();
  if (!canAppWrite(session, appId)) {
    throw new Error("書き込み権限がありません。");
  }
  return session;
}

export function assertCanViewApp(appId: GrantableAppId): SessionUser {
  const session = assertLoggedIn();
  if (!canAppView(session, appId)) {
    throw new Error("このアプリを利用する権限がありません。");
  }
  return session;
}

export function assertAppRoleAtLeast(
  appId: GrantableAppId,
  minRole: AppRole
): SessionUser {
  const session = assertLoggedIn();
  const role = getAppRole(session, appId);
  const rank = { viewer: 1, editor: 2, admin: 3 } as const;
  if (!role || rank[role] < rank[minRole]) {
    throw new Error("権限が不足しています。");
  }
  return session;
}

/** 工程管理のマイタスク一覧等（viewer 以上） */
export function assertCanOperateProcessMgmtTasks(): SessionUser {
  const session = assertLoggedIn();
  if (!canOperateProcessMgmtApp(session)) {
    throw new Error("工程管理のタスク操作権限がありません。");
  }
  return session;
}

/** 工程管理のタスク変更操作（開始・完了・並行設定等）。editor 以上 */
export function assertCanWriteProcessMgmtTasks(): SessionUser {
  return assertAppRoleAtLeast("process-management", "editor");
}

export function assertPasswordChangedOrChanging(): SessionUser {
  const session = assertLoggedIn();
  if (session.mustChangePassword) {
    throw new Error("初期パスワードの変更が必要です。");
  }
  return session;
}

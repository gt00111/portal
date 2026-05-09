import { canOperateProcessMgmtTasks, canWrite, isAdmin } from "@shared/auth.js";
import type { SessionUser } from "@shared/types.js";

import { getSession } from "./session.js";

export function assertLoggedIn(): SessionUser {
  const session = getSession();
  if (!session) {
    throw new Error("ログインしていません。");
  }
  return session;
}

export function assertCanWrite(): SessionUser {
  const session = assertLoggedIn();
  if (!canWrite(session.role)) {
    throw new Error("書き込み権限がありません。");
  }
  return session;
}

/** 工程管理のタスク操作（開始・完了等）。閲覧者も可 */
export function assertCanOperateProcessMgmtTasks(): SessionUser {
  const session = assertLoggedIn();
  if (!canOperateProcessMgmtTasks(session.role)) {
    throw new Error("工程管理のタスク操作権限がありません。");
  }
  return session;
}

export function assertAdmin(): SessionUser {
  const session = assertLoggedIn();
  if (!isAdmin(session.role)) {
    throw new Error("管理者権限が必要です。");
  }
  return session;
}

export function assertPasswordChangedOrChanging(): SessionUser {
  const session = assertLoggedIn();
  if (session.mustChangePassword) {
    throw new Error("初期パスワードの変更が必要です。");
  }
  return session;
}

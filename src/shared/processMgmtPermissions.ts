import { getAppRole } from "./auth.js";
import type { SessionUser } from "./types.js";

export function isPmTaskPrimaryAssignee(session: SessionUser, assignee: string): boolean {
  return assignee.trim() === session.username.trim();
}

/** 開始（未着手）。担当未設定なら着手者が主担当になる。設定済みならその担当のみ（admin は代理可） */
export function canStartPmTask(session: SessionUser, assignee: string): boolean {
  if (getAppRole(session, "process-management") === "admin") return true;
  const name = assignee.trim();
  if (!name) return true;
  return isPmTaskPrimaryAssignee(session, name);
}

/** 完了・一時中断・再開（着手後の作業ライフサイクル）。主担当のみ（admin は代理可） */
export function canEditPmTaskLifecycle(session: SessionUser, assignee: string): boolean {
  if (getAppRole(session, "process-management") === "admin") return true;
  return isPmTaskPrimaryAssignee(session, assignee);
}

/** 並行設定・補助担当・CADへ受渡し（editor / admin が担当外 SW 行でも代理可） */
export function canProxyPmSwParallelOps(session: SessionUser): boolean {
  const role = getAppRole(session, "process-management");
  return role === "admin" || role === "editor";
}

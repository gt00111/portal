export const APP_ROLES = ["admin", "editor", "viewer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export function canWrite(role: AppRole): boolean {
  return role === "admin" || role === "editor";
}

/** 工程管理デスクトップ: 閲覧者も現場作業者としてタスクの開始・完了などを操作可能 */
export function canOperateProcessMgmtTasks(role: AppRole): boolean {
  return role === "admin" || role === "editor" || role === "viewer";
}

export function isAdmin(role: AppRole): boolean {
  return role === "admin";
}

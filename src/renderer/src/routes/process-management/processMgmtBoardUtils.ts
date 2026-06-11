import type { PmBoardTask } from "@shared/processMgmt.js";

export function boardRowProjectKey(t: PmBoardTask): string {
  return `${t.seisanProjectId ?? ""}\t${t.projectName}\t${t.drawingNumber}\t${t.revision}`;
}

export function formatBoardDateTime(iso: string | null): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
}

export function cadShowsPauseInsteadOfComplete(task: PmBoardTask): boolean {
  return (
    task.processType === "cadmac" &&
    task.workMode === "parallel" &&
    task.swStatus != null &&
    task.swStatus !== "完了"
  );
}

export function isTodayIso(iso: string | null): boolean {
  if (!iso?.trim()) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function tasksForProject(boardTasks: PmBoardTask[], seisanProjectId: string | null): PmBoardTask[] {
  if (!seisanProjectId) return [];
  return boardTasks.filter((t) => t.seisanProjectId === seisanProjectId);
}

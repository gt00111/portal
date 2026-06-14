import type { ProjectStatus } from "./project.js";
import type { TaskStatus } from "./task.js";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "下書き",
  submitted: "提出済",
  approved: "承認済",
  in_planning: "計画中",
  in_progress: "進行中",
  done: "完了",
  canceled: "取消",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  planned: "未着手",
  in_progress: "進行中",
  done: "完了",
};

export const PROJECT_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "canceled"],
  submitted: ["approved", "draft", "canceled"],
  approved: ["in_progress", "canceled"],
  in_progress: ["done", "canceled"],
  done: ["in_progress"],
  canceled: ["draft"],
};

/** §8.5.21 部材管理から完了する際のステータス遷移（承認済→進行中→完了 等） */
export function resolveProjectStatusesToComplete(current: string): string[] {
  if (current === "done") return [];
  const direct = PROJECT_STATUS_TRANSITIONS[current] ?? [];
  if (direct.includes("done")) return ["done"];
  if (direct.includes("in_progress")) return ["in_progress", "done"];
  return [];
}

/** §8.5.21.1 部材管理から完了を解除する際の遷移先（`done` → `in_progress` のみ） */
export function resolveProjectStatusAfterUncomplete(current: string): string | null {
  if (current !== "done") return null;
  const allowed = PROJECT_STATUS_TRANSITIONS[current] ?? [];
  return allowed.includes("in_progress") ? "in_progress" : null;
}

export const TASK_STATUS_TRANSITIONS: Record<string, string[]> = {
  planned: ["in_progress"],
  in_progress: ["done", "planned"],
  done: ["in_progress"],
};

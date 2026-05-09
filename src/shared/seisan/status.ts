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

export const TASK_STATUS_TRANSITIONS: Record<string, string[]> = {
  planned: ["in_progress"],
  in_progress: ["done", "planned"],
  done: ["in_progress"],
};

/** 工程管理：並行作業・引渡しバッチ（§8.6） */

export const PM_WORK_MODES = ["sequential", "parallel"] as const;
export type PmWorkMode = (typeof PM_WORK_MODES)[number];

export const PM_WORK_MODE_LABELS: Record<PmWorkMode, string> = {
  sequential: "直列",
  parallel: "並行",
};

/** 並行推奨のしきい値（カレンダー日） */
export const PM_PARALLEL_RECOMMEND_MAX_DAYS = 7;

export const PM_GANTT_SW_TEMPLATE_NAME = "設計";
export const PM_GANTT_CADMAC_TEMPLATE_NAME = "レーザー切断プログラム作成";

export interface PmGanttTemplateMapping {
  swTemplateName: string;
  cadmacTemplateName: string;
}

export const PM_NOTIFICATION_KINDS = [
  "task_complete",
  "handoff",
  "gantt_duration",
] as const;
export type PmNotificationKind = (typeof PM_NOTIFICATION_KINDS)[number];

export interface PmHandoffEvent {
  id: number;
  seisanProjectId: string;
  swTaskId: number;
  batchNo: number;
  handoffAt: string;
  handoffByUsername: string;
  note: string;
}

export interface PmSupportAssignee {
  userNameId: number;
  username: string;
}

/** 補助担当ごとの進捗（主担当マイタスク・ボード詳細用） */
export interface PmSupportProgressEntry {
  userNameId: number;
  username: string;
  progressPercent: number;
  progressNote: string;
  updatedAt: string | null;
}

export interface PmSeisanProjectMeta {
  seisanProjectId: string;
  workMode: PmWorkMode;
  workModeNote: string;
  workModeChangedAt: string | null;
  workModeChangedByUsername: string;
  latestBatchNo: number | null;
  handoffCount: number;
  latestBatchNote: string | null;
  parallelRecommend: boolean;
}

export interface PmGanttDurationChange {
  seisanProjectId: string;
  projectName: string;
  seisanProjectNo: string | null;
  previousSwDays: number | null;
  previousCadmacDays: number | null;
  currentSwDays: number | null;
  currentCadmacDays: number | null;
}

export interface PmGanttSyncResult {
  changes: PmGanttDurationChange[];
  acknowledged: boolean;
}

export type PmMyTaskRole = "primary" | "support";

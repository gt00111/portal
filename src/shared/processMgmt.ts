import type {
  PmMyTaskRole,
  PmNotificationKind,
  PmSupportAssignee,
  PmSupportProgressEntry,
  PmWorkMode,
} from "./processMgmtParallel.js";

/** @deprecated 案件の正は生産ボード。後方互換の IPC のみ */
export interface PmProject {
  id: number;
  name: string;
  description: string;
  client: string;
  drawingNumber: string;
  revision: string;
  note: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** 工程タスク（生産ボード案件 ID で紐づく） */
export interface PmTask {
  id: number;
  /** 外部キー用ダミー案件 ID（生産ボード連携タスクは共通） */
  projectId: number;
  /** 生産ボードの案件 ID（この列があれば案件の正は生産ボード） */
  seisanProjectId: string | null;
  title: string;
  description: string;
  processType: string;
  status: string;
  assignee: string;
  /** 担当者の m_user_names.id（後方互換のため `assignee` も同時に保持） */
  assigneeUserNameId: number | null;
  /** 担当者の進捗（0〜100）。range 入力と同期 */
  progressPercent: number;
  /** 担当者の進捗・状況の自己申告テキスト */
  progressNote: string;
  startedAt: string | null;
  completedAt: string | null;
  /** 管理者が完了取り消ししたときの報告内容（直近1件） */
  completionUndoReason: string;
  completionUndoAt: string | null;
  completionUndoBy: string;
  /** CADMAC 並行作業で扱っている引渡しバッチ番号 */
  activeBatchNo: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PmBoardTask extends PmTask {
  /** 表示用（製番 or 案件名） */
  projectName: string;
  client: string;
  drawingNumber: string;
  revision: string;
  note: string;
  /** 生産ボードの製番（検索・表示用） */
  seisanProjectNo: string | null;
  /** §8.6: 案件の作業モード */
  workMode?: PmWorkMode;
  latestBatchNo?: number | null;
  latestBatchNote?: string | null;
  handoffCount?: number;
  parallelRecommend?: boolean;
  supportAssignees?: PmSupportAssignee[];
  supportAssigneeSummary?: string;
  /** SW 主担当マイタスク: 補助担当ごとの進捗・メモ（閲覧のみ） */
  supportProgressList?: PmSupportProgressEntry[];
  /** マイタスク: 主担当 or 補助 */
  myTaskRole?: PmMyTaskRole;
  /** マイタスク補助: 自分の進捗（主担当進捗とは別） */
  mySupportProgressPercent?: number;
  mySupportProgressNote?: string;
  /** 同一案件の SW 工程ステータス（CAD 行の表示用） */
  swStatus?: string | null;
}

/** インナー通知に保存する表示用スナップショット */
export interface PmTaskCompletionNotifySummary {
  kind?: PmNotificationKind;
  /** handoff / gantt_duration 用の本文 */
  message?: string;
  projectName: string;
  title: string;
  processType: string;
  client: string;
  drawingNumber: string;
  revision: string;
  assignee: string;
  seisanProjectNo: string | null;
  batchNo?: number;
}

/** 未確認のインナー通知（確認するまで一覧に残す） */
export interface PmTaskCompletionNotification {
  id: number;
  taskId: number;
  summary: PmTaskCompletionNotifySummary;
  completedBy: string;
  taskCompletedAt: string;
  createdAt: string;
}

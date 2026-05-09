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
}

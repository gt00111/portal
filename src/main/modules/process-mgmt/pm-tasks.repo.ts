import { getProcessMgmtDb } from "@main/db/processMgmtConnection.js";
import * as seisanProjects from "@main/seisan/repos/projects.repo.js";
import type { PmBoardTask, PmTask } from "@shared/processMgmt.js";
import type { ProcessView } from "@shared/processView.js";

type DbTaskRow = {
  id: number;
  project_id: number;
  seisan_project_id: string | null;
  title: string;
  description: string;
  process_type: string;
  status: string;
  assignee: string;
  assignee_user_name_id: number | null;
  progress_percent: number | null;
  progress_note: string | null;
  started_at: string | null;
  completed_at: string | null;
  completion_undo_reason: string | null;
  completion_undo_at: string | null;
  completion_undo_by: string | null;
  created_at: string;
  updated_at: string;
};

type DbBoardRow = DbTaskRow & {
  legacy_name: string | null;
  legacy_client: string | null;
  legacy_drawing_number: string | null;
  legacy_revision: string | null;
  legacy_note: string | null;
};

export type CreatePmTaskPayload = {
  projectId: number;
  title: string;
  description?: string;
  assignee?: string;
  assigneeUserNameId?: number | null;
  processType?: string;
};

export type UpdatePmTaskStatusPayload = {
  id: number;
  status: string;
};

export type UpdatePmTaskPayload = {
  id: number;
  title: string;
  description: string;
  assignee: string;
  assigneeUserNameId?: number | null;
  status: string;
};

export type ListPmBoardPayload = {
  mode: "active" | "history";
  query?: string;
  client?: string;
  /** 履歴のみ: SW / CADMAC / 両方で工程を切替（アクティブ時は無視されセッションの工程表示を使用） */
  boardProcessView?: ProcessView;
};

const TASK_TITLE_MAX_LENGTH = 120;
const TASK_DESCRIPTION_MAX_LENGTH = 1000;
const TASK_ASSIGNEE_MAX_LENGTH = 80;
const PROGRESS_NOTE_MAX_LENGTH = 2000;
const COMPLETION_UNDO_REASON_MAX_LENGTH = 2000;
const TASK_STATUS_VALUES = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "未開始",
  "作業中",
  "完了",
] as const;
const TASK_PROCESS_TYPES = ["general", "solidworks", "cadmac"] as const;

const TASK_SELECT = `
  t.id, t.project_id, t.seisan_project_id, t.title, t.description, t.process_type, t.status,
  t.assignee, t.assignee_user_name_id, t.progress_percent, t.progress_note, t.started_at, t.completed_at,
  t.completion_undo_reason, t.completion_undo_at, t.completion_undo_by, t.created_at, t.updated_at
`;

function validateProcessType(processType: string): void {
  if (!TASK_PROCESS_TYPES.includes(processType as (typeof TASK_PROCESS_TYPES)[number])) {
    throw new Error(`工程種別は次のいずれかにしてください: ${TASK_PROCESS_TYPES.join(", ")}`);
  }
}

function validateTaskStatus(status: string): void {
  if (!TASK_STATUS_VALUES.includes(status as (typeof TASK_STATUS_VALUES)[number])) {
    throw new Error(`タスク状態は次のいずれかにしてください: ${TASK_STATUS_VALUES.join(", ")}`);
  }
}

function validateTaskInput(title: string, description: string, assignee: string, status: string): void {
  if (!title) {
    throw new Error("タスク名を入力してください。");
  }
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    throw new Error(`タスク名は ${TASK_TITLE_MAX_LENGTH} 文字以内にしてください。`);
  }
  if (description.length > TASK_DESCRIPTION_MAX_LENGTH) {
    throw new Error(`説明は ${TASK_DESCRIPTION_MAX_LENGTH} 文字以内にしてください。`);
  }
  if (assignee.length > TASK_ASSIGNEE_MAX_LENGTH) {
    throw new Error(`担当者は ${TASK_ASSIGNEE_MAX_LENGTH} 文字以内にしてください。`);
  }
  validateTaskStatus(status);
}

export function validateProgressNote(note: string): void {
  if (note.length > PROGRESS_NOTE_MAX_LENGTH) {
    throw new Error(`進捗メモは ${PROGRESS_NOTE_MAX_LENGTH} 文字以内にしてください。`);
  }
}

export function validateCompletionUndoReason(text: string): void {
  const s = text.trim();
  if (!s) {
    throw new Error("完了取り消しの報告内容を入力してください。");
  }
  if (s.length > COMPLETION_UNDO_REASON_MAX_LENGTH) {
    throw new Error(`報告内容は ${COMPLETION_UNDO_REASON_MAX_LENGTH} 文字以内にしてください。`);
  }
}

function normalizeProgressPercentFromDb(n: unknown): number {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 0;
  return Math.min(100, Math.max(0, x));
}

export function validateProgressPercentInput(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) {
    throw new Error("進捗の数値が不正です。");
  }
  const r = Math.round(x);
  if (r < 0 || r > 100) {
    throw new Error("進捗は 0〜100 の範囲で指定してください。");
  }
  return r;
}

function mapDbToPmTask(row: DbTaskRow): PmTask {
  const pct =
    row.status === "完了" ? 100 : normalizeProgressPercentFromDb(row.progress_percent);
  return {
    id: row.id,
    projectId: row.project_id,
    seisanProjectId: row.seisan_project_id,
    title: row.title,
    description: row.description,
    processType: row.process_type,
    status: row.status,
    assignee: row.assignee,
    assigneeUserNameId: row.assignee_user_name_id ?? null,
    progressPercent: pct,
    progressNote: row.progress_note ?? "",
    startedAt: row.started_at,
    completedAt: row.completed_at,
    completionUndoReason: row.completion_undo_reason ?? "",
    completionUndoAt: row.completion_undo_at ?? null,
    completionUndoBy: row.completion_undo_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** ボード行を組み立て（生産ボード参照で表示名を解決） */
export function enrichBoardRow(row: DbBoardRow): PmBoardTask {
  const base = mapDbToPmTask(row);
  if (row.seisan_project_id) {
    const sp = seisanProjects.get(row.seisan_project_id);
    const label = sp?.project_no || sp?.project_name || row.seisan_project_id;
    return {
      ...base,
      projectName: label,
      client: sp?.company_id ?? "",
      drawingNumber: sp?.part_number ?? "",
      revision: sp?.revision ?? "",
      note: sp?.notes ?? "",
      seisanProjectNo: sp?.project_no ?? null,
    };
  }
  return {
    ...base,
    projectName: row.legacy_name ?? "",
    client: row.legacy_client ?? "",
    drawingNumber: row.legacy_drawing_number ?? "",
    revision: row.legacy_revision ?? "",
    note: row.legacy_note ?? "",
    seisanProjectNo: null,
  };
}

/** 一覧表示用に PmTask をボード行へ拡張（マイタスク一覧など） */
export function displayPmTask(task: PmTask): PmBoardTask {
  const row: DbBoardRow = {
    id: task.id,
    project_id: task.projectId,
    seisan_project_id: task.seisanProjectId,
    title: task.title,
    description: task.description,
    process_type: task.processType,
    status: task.status,
    assignee: task.assignee,
    assignee_user_name_id: task.assigneeUserNameId,
    progress_percent: task.progressPercent,
    progress_note: task.progressNote,
    started_at: task.startedAt,
    completed_at: task.completedAt,
    completion_undo_reason: task.completionUndoReason,
    completion_undo_at: task.completionUndoAt,
    completion_undo_by: task.completionUndoBy,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    legacy_name: null,
    legacy_client: null,
    legacy_drawing_number: null,
    legacy_revision: null,
    legacy_note: null,
  };
  return enrichBoardRow(row);
}

function taskTableProcessViewSql(processView: ProcessView): string {
  if (processView === "solidworks") {
    return "(process_type = 'solidworks' OR process_type = 'general')";
  }
  if (processView === "cadmac") {
    return "(process_type = 'cadmac' OR process_type = 'general')";
  }
  return "1 = 1";
}

function boardProcessViewSql(processView: ProcessView): string {
  if (processView === "solidworks") {
    return "(t.process_type = 'solidworks' OR t.process_type = 'general')";
  }
  if (processView === "cadmac") {
    return "(t.process_type = 'cadmac' OR t.process_type = 'general')";
  }
  return "1 = 1";
}

function cadmacGateSql(): string {
  return `(
    t.process_type != 'cadmac' OR (
      (t.seisan_project_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM tasks sw
        WHERE sw.seisan_project_id = t.seisan_project_id
          AND sw.process_type = 'solidworks' AND sw.status = '完了'
      ))
      OR
      (t.seisan_project_id IS NULL AND EXISTS (
        SELECT 1 FROM tasks sw
        WHERE sw.project_id = t.project_id
          AND sw.process_type = 'solidworks' AND sw.status = '完了'
      ))
    )
  )`;
}

export function assertTaskMatchesProcessView(task: PmTask, processView: ProcessView): void {
  if (processView === "both") return;
  if (processView === "solidworks") {
    if (task.processType !== "solidworks" && task.processType !== "general") {
      throw new Error("SolidWorks 工程表示ではこのタスクは操作できません。");
    }
  }
  if (processView === "cadmac") {
    if (task.processType !== "cadmac" && task.processType !== "general") {
      throw new Error("CADMAC 工程表示ではこのタスクは操作できません。");
    }
  }
}

export function assertProcessTypeAllowedForView(processType: string, processView: ProcessView): void {
  if (processView === "both") return;
  const pt = (processType || "general").trim();
  if (processView === "solidworks" && pt === "cadmac") {
    throw new Error("SolidWorks 工程表示では CADMAC 工程のタスクは作成できません。");
  }
  if (processView === "cadmac" && pt === "solidworks") {
    throw new Error("CADMAC 工程表示では SolidWorks 工程のタスクは作成できません。");
  }
}

/** @deprecated 後方互換 IPC 向け */
export function listTasksByProject(projectId: number, processView: ProcessView): PmTask[] {
  const db = getProcessMgmtDb();
  const viewSql = taskTableProcessViewSql(processView);
  const rows = db
    .prepare(
      `
        SELECT id, project_id, seisan_project_id, title, description, process_type, status, assignee,
               assignee_user_name_id,
               progress_percent, progress_note, started_at, completed_at,
               completion_undo_reason, completion_undo_at, completion_undo_by,
               created_at, updated_at
        FROM tasks
        WHERE project_id = ? AND seisan_project_id IS NULL AND ${viewSql}
        ORDER BY id DESC
      `
    )
    .all(projectId) as DbTaskRow[];
  return rows.map(mapDbToPmTask);
}

/** マイタスク：自分が担当の未完了のみ（工程表示フィルタ） */
export function listMyTasks(username: string, processView: ProcessView): PmTask[] {
  const db = getProcessMgmtDb();
  const viewSql = taskTableProcessViewSql(processView);
  const rows = db
    .prepare(
      `
        SELECT id, project_id, seisan_project_id, title, description, process_type, status, assignee,
               assignee_user_name_id,
               progress_percent, progress_note, started_at, completed_at,
               completion_undo_reason, completion_undo_at, completion_undo_by,
               created_at, updated_at
        FROM tasks
        WHERE assignee = ? AND status != '完了' AND ${viewSql}
        ORDER BY updated_at DESC, id DESC
      `
    )
    .all(username.trim()) as DbTaskRow[];
  return rows.map(mapDbToPmTask);
}

export function createTask(payload: CreatePmTaskPayload): PmTask {
  const title = payload.title.trim();
  const description = (payload.description || "").trim();
  const assignee = (payload.assignee || "").trim();
  const assigneeUserNameId =
    payload.assigneeUserNameId == null ? null : Number(payload.assigneeUserNameId);
  const processType = (payload.processType || "general").trim();
  const status = "未開始";
  validateTaskInput(title, description, assignee, status);
  validateProcessType(processType);

  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `
        INSERT INTO tasks (
          project_id, seisan_project_id, title, description, process_type, status, assignee,
          assignee_user_name_id, progress_note,
          progress_percent, started_at, completed_at, created_at, updated_at
        )
        VALUES (?, NULL, ?, ?, ?, '未開始', ?, ?, '', 0, NULL, NULL, ?, ?)
      `
    )
    .run(
      payload.projectId,
      title,
      description,
      processType,
      assignee,
      assigneeUserNameId,
      now,
      now
    );

  return getTaskDetail(Number(result.lastInsertRowid));
}

export function updateTaskStatus(payload: UpdatePmTaskStatusPayload): PmTask {
  const status = payload.status.trim();
  validateTaskStatus(status);
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  if (status === "完了") {
    db.prepare(
      `
      UPDATE tasks
      SET status = '完了',
          completed_at = ?,
          progress_percent = 100,
          completion_undo_reason = '',
          completion_undo_at = NULL,
          completion_undo_by = '',
          updated_at = ?
      WHERE id = ?
    `
    ).run(now, now, payload.id);
  } else {
    db.prepare(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`).run(status, now, payload.id);
  }
  return getTaskDetail(payload.id);
}

export function getTaskDetail(id: number): PmTask {
  const db = getProcessMgmtDb();
  const row = db
    .prepare(
      `
        SELECT id, project_id, seisan_project_id, title, description, process_type, status, assignee,
               assignee_user_name_id,
               progress_percent, progress_note, started_at, completed_at,
               completion_undo_reason, completion_undo_at, completion_undo_by,
               created_at, updated_at
        FROM tasks WHERE id = ?
      `
    )
    .get(id) as DbTaskRow | undefined;
  if (!row) {
    throw new Error("タスクが見つかりません。");
  }
  return mapDbToPmTask(row);
}

/** 単一タスクをボード表示用に解決（完了通知の概要用） */
export function getBoardTaskById(id: number): PmBoardTask {
  const db = getProcessMgmtDb();
  const row = db
    .prepare(
      `
        SELECT
          ${TASK_SELECT},
          p.name AS legacy_name,
          p.client AS legacy_client,
          p.drawing_number AS legacy_drawing_number,
          p.revision AS legacy_revision,
          p.note AS legacy_note
        FROM tasks t
        LEFT JOIN projects p ON t.seisan_project_id IS NULL AND p.id = t.project_id
        WHERE t.id = ?
      `
    )
    .get(id) as DbBoardRow | undefined;
  if (!row) {
    throw new Error("タスクが見つかりません。");
  }
  return enrichBoardRow(row);
}

export function updateTask(payload: UpdatePmTaskPayload): PmTask {
  const title = payload.title.trim();
  const description = payload.description.trim();
  const assignee = payload.assignee.trim();
  const assigneeUserNameId =
    payload.assigneeUserNameId == null ? null : Number(payload.assigneeUserNameId);
  const status = payload.status.trim();
  validateTaskInput(title, description, assignee, status);
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  if (status === "完了") {
    db.prepare(
      `
      UPDATE tasks
      SET title = ?, description = ?, assignee = ?, assignee_user_name_id = ?, status = '完了',
          completed_at = ?,
          progress_percent = 100,
          completion_undo_reason = '',
          completion_undo_at = NULL,
          completion_undo_by = '',
          updated_at = ?
      WHERE id = ?
    `
    ).run(title, description, assignee, assigneeUserNameId, now, now, payload.id);
  } else {
    db.prepare(
      `
      UPDATE tasks
      SET title = ?, description = ?, assignee = ?, assignee_user_name_id = ?, status = ?, updated_at = ?
      WHERE id = ?
    `
    ).run(title, description, assignee, assigneeUserNameId, status, now, payload.id);
  }
  return getTaskDetail(payload.id);
}

export function updateProgressNote(id: number, progressNote: string, progressPercent: number): PmTask {
  const note = progressNote.trim();
  validateProgressNote(note);
  const pct = validateProgressPercentInput(progressPercent);
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  db.prepare(`UPDATE tasks SET progress_note = ?, progress_percent = ?, updated_at = ? WHERE id = ?`).run(
    note,
    pct,
    now,
    id
  );
  return getTaskDetail(id);
}

export function startTask(id: number, username: string, userNameId: number | null): PmTask {
  if (!username.trim()) {
    throw new Error("ログイン名が無効です。");
  }
  const task = getTaskDetail(id);
  if (task.status === "完了") {
    throw new Error("完了済みのタスクは開始できません。");
  }
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  db.prepare(
    `
      UPDATE tasks
      SET status = '作業中', assignee = ?, assignee_user_name_id = ?, started_at = ?, updated_at = ?
      WHERE id = ?
    `
  ).run(username.trim(), userNameId, now, now, id);
  return getTaskDetail(id);
}

export function completeTask(id: number): PmTask {
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  db.prepare(
    `
      UPDATE tasks
      SET status = '完了',
          completed_at = ?,
          progress_percent = 100,
          completion_undo_reason = '',
          completion_undo_at = NULL,
          completion_undo_by = '',
          updated_at = ?
      WHERE id = ?
    `
  ).run(now, now, id);
  return getTaskDetail(id);
}

export function undoComplete(id: number, reason: string, adminUsername: string): PmTask {
  validateCompletionUndoReason(reason);
  const user = adminUsername.trim();
  if (!user) {
    throw new Error("管理者名が無効です。");
  }
  const task = getTaskDetail(id);
  if (task.status !== "完了") {
    throw new Error("完了済みのタスクのみ取り消せます。");
  }
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  const r = reason.trim();
  const result = db
    .prepare(
      `
      UPDATE tasks
      SET status = '作業中',
          completed_at = NULL,
          completion_undo_reason = ?,
          completion_undo_at = ?,
          completion_undo_by = ?,
          updated_at = ?
      WHERE id = ? AND status = '完了'
    `
    )
    .run(r, now, user, now, id);
  if (result.changes === 0) {
    throw new Error("取り消しに失敗しました。すでに完了でない可能性があります。");
  }
  return getTaskDetail(id);
}

/**
 * ボード：全員が同じ一覧を見る。
 * - アクティブ: 完了以外＋ CADMAC は SW 完了条件
 * - 履歴: 完了のみ
 */
export function listBoardTasks(payload: ListPmBoardPayload, sessionProcessView: ProcessView): PmBoardTask[] {
  const mode = payload.mode;
  const processView: ProcessView =
    mode === "history" ? (payload.boardProcessView ?? sessionProcessView) : sessionProcessView;
  const db = getProcessMgmtDb();
  const where: string[] = [];
  where.push(boardProcessViewSql(processView));

  if (mode === "active") {
    where.push("t.status != '完了'");
    where.push(cadmacGateSql());
  } else {
    where.push("t.status = '完了'");
  }

  const sql = `
    SELECT
      ${TASK_SELECT},
      p.name AS legacy_name,
      p.client AS legacy_client,
      p.drawing_number AS legacy_drawing_number,
      p.revision AS legacy_revision,
      p.note AS legacy_note
    FROM tasks t
    LEFT JOIN projects p ON t.seisan_project_id IS NULL AND p.id = t.project_id
    WHERE ${where.join(" AND ")}
    ORDER BY t.updated_at DESC, t.id DESC
  `;

  const rows = db.prepare(sql).all() as DbBoardRow[];
  return rows.map(enrichBoardRow);
}

export function deleteTask(id: number): { id: number } {
  const db = getProcessMgmtDb();
  const result = db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  if (result.changes === 0) {
    throw new Error("タスクが見つかりません。");
  }
  return { id };
}

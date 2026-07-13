import { getProcessMgmtDb } from "@main/db/processMgmtConnection.js";
import { getDb } from "@main/db/connection.js";
import type { PmBoardTask } from "@shared/processMgmt.js";
import type { PmSupportAssignee, PmSupportProgressEntry } from "@shared/processMgmtParallel.js";

import * as tasks from "./pm-tasks.repo.js";
import { displayPmTask } from "./pm-tasks.repo.js";

function resolveUsername(userNameId: number): string {
  const row = getDb()
    .prepare(`SELECT username FROM app_operators WHERE userNameId = ? AND isActive = 1 LIMIT 1`)
    .get(userNameId) as { username: string } | undefined;
  if (row?.username) return row.username;
  const nameRow = getDb()
    .prepare(`SELECT name FROM m_user_names WHERE id = ? AND isActive = 1 LIMIT 1`)
    .get(userNameId) as { name: string } | undefined;
  return nameRow?.name?.trim() ?? "";
}

export function listSupportAssignees(taskId: number): PmSupportAssignee[] {
  const db = getProcessMgmtDb();
  const rows = db
    .prepare(
      `SELECT user_name_id, username FROM task_support_assignees WHERE task_id = ? ORDER BY user_name_id`
    )
    .all(taskId) as { user_name_id: number; username: string }[];
  return rows.map((r) => ({
    userNameId: r.user_name_id,
    username: r.username.trim() || resolveUsername(r.user_name_id),
  }));
}

export interface PmSupportUserCandidate {
  userNameId: number;
  name: string;
}

export function listSupportUserCandidates(): PmSupportUserCandidate[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name FROM m_user_names WHERE isActive = 1 ORDER BY name COLLATE NOCASE ASC, id ASC`
    )
    .all() as { id: number; name: string }[];
  return rows.map((r) => ({ userNameId: r.id, name: r.name.trim() || resolveUsername(r.id) }));
}

export function setSupportAssignees(taskId: number, userNameIds: number[]): PmSupportAssignee[] {
  const task = tasks.getTaskDetail(taskId);
  if (task.processType !== "solidworks") {
    throw new Error("SolidWorks 工程タスクのみ補助担当を登録できます。");
  }
  const db = getProcessMgmtDb();
  const primaryId = task.assigneeUserNameId ?? null;
  const ids = [...new Set(userNameIds.map((x) => Math.trunc(x)).filter((x) => x > 0))].filter(
    (id) => primaryId == null || id !== primaryId
  );
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM task_support_assignees WHERE task_id = ?`).run(taskId);
    const insert = db.prepare(
      `INSERT INTO task_support_assignees (task_id, user_name_id, username) VALUES (?, ?, ?)`
    );
    for (const uid of ids) {
      insert.run(taskId, uid, resolveUsername(uid));
    }
    const progressInsert = db.prepare(
      `
        INSERT INTO task_support_progress (task_id, user_name_id, progress_percent, progress_note, updated_at)
        VALUES (?, ?, 0, '', ?)
        ON CONFLICT(task_id, user_name_id) DO NOTHING
      `
    );
    const now = new Date().toISOString();
    for (const uid of ids) {
      progressInsert.run(taskId, uid, now);
    }
  });
  tx();
  return listSupportAssignees(taskId);
}

export function listSupportProgressForTask(taskId: number): PmSupportProgressEntry[] {
  const assignees = listSupportAssignees(taskId);
  if (assignees.length === 0) return [];
  const db = getProcessMgmtDb();
  return assignees.map((a) => {
    const row = db
      .prepare(
        `
          SELECT progress_percent, progress_note, updated_at
          FROM task_support_progress
          WHERE task_id = ? AND user_name_id = ?
        `
      )
      .get(taskId, a.userNameId) as
      | { progress_percent: number; progress_note: string; updated_at: string | null }
      | undefined;
    return {
      userNameId: a.userNameId,
      username: a.username,
      progressPercent: row
        ? Math.min(100, Math.max(0, Math.round(row.progress_percent)))
        : 0,
      progressNote: row?.progress_note?.trim() ?? "",
      updatedAt: row?.updated_at ?? null,
    };
  });
}

export function getSupportProgress(taskId: number, userNameId: number): { percent: number; note: string } {
  const db = getProcessMgmtDb();
  const row = db
    .prepare(
      `SELECT progress_percent, progress_note FROM task_support_progress WHERE task_id = ? AND user_name_id = ?`
    )
    .get(taskId, userNameId) as { progress_percent: number; progress_note: string } | undefined;
  return {
    percent: row ? Math.min(100, Math.max(0, Math.round(row.progress_percent))) : 0,
    note: row?.progress_note ?? "",
  };
}

export function updateSupportProgress(
  taskId: number,
  userNameId: number,
  progressPercent: number,
  progressNote: string
): void {
  tasks.validateProgressNote(progressNote);
  const pct = tasks.validateProgressPercentInput(progressPercent);
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `
        UPDATE task_support_progress
        SET progress_percent = ?, progress_note = ?, updated_at = ?
        WHERE task_id = ? AND user_name_id = ?
      `
    )
    .run(pct, progressNote.trim(), now, taskId, userNameId);
  if (result.changes === 0) {
    throw new Error("補助担当の進捗が見つかりません。");
  }
}

export function listMyTasksWithSupport(username: string, processView: Parameters<typeof tasks.listMyTasks>[1]): PmBoardTask[] {
  const primary = tasks.listMyTasks(username, processView).map((t) => {
    const board = displayPmTask(t);
    return { ...board, myTaskRole: "primary" as const };
  });
  const db = getProcessMgmtDb();
  const viewSql =
    processView === "solidworks"
      ? "(t.process_type = 'solidworks')"
      : processView === "cadmac"
        ? "0"
        : "(t.process_type = 'solidworks')";
  if (viewSql === "0") return primary;

  const userNameId = getDb()
    .prepare(`SELECT userNameId FROM app_operators WHERE username = ? AND isActive = 1 LIMIT 1`)
    .get(username.trim()) as { userNameId: number | null } | undefined;
  const uid = userNameId?.userNameId ?? null;

  const rows = db
    .prepare(
      `
        SELECT t.id AS task_id, tsa.user_name_id
        FROM task_support_assignees tsa
        JOIN tasks t ON t.id = tsa.task_id
        WHERE t.status != '完了' AND ${viewSql}
          AND (tsa.username = ? OR (? IS NOT NULL AND tsa.user_name_id = ?))
      `
    )
    .all(username.trim(), uid, uid) as { task_id: number; user_name_id: number }[];

  const supportCards: PmBoardTask[] = [];
  for (const row of rows) {
    const task = tasks.getTaskDetail(row.task_id);
    const board = displayPmTask(task);
    const prog = getSupportProgress(row.task_id, row.user_name_id);
    supportCards.push({
      ...board,
      myTaskRole: "support",
      mySupportProgressPercent: prog.percent,
      mySupportProgressNote: prog.note,
      progressPercent: prog.percent,
      progressNote: prog.note,
    });
  }
  return [...primary, ...supportCards];
}

export function isSupportAssignee(taskId: number, username: string, userNameId: number | null): boolean {
  const db = getProcessMgmtDb();
  const row = db
    .prepare(`SELECT 1 FROM task_support_assignees WHERE task_id = ? AND username = ? LIMIT 1`)
    .get(taskId, username.trim());
  if (row) return true;
  if (userNameId != null) {
    const row2 = db
      .prepare(`SELECT 1 FROM task_support_assignees WHERE task_id = ? AND user_name_id = ? LIMIT 1`)
      .get(taskId, userNameId);
    return !!row2;
  }
  return false;
}

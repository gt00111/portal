import { getProcessMgmtDb } from "@main/db/processMgmtConnection.js";
import type { PmBoardTask, PmTaskCompletionNotification, PmTaskCompletionNotifySummary } from "@shared/processMgmt.js";
import type { PmNotificationKind } from "@shared/processMgmtParallel.js";

type DbNotifyRow = {
  id: number;
  recipient_username: string;
  task_id: number;
  summary_json: string;
  completed_by: string;
  task_completed_at: string;
  created_at: string;
  acknowledged_at: string | null;
  notification_kind?: string;
};

function mapRow(row: DbNotifyRow): PmTaskCompletionNotification {
  let summary: PmTaskCompletionNotifySummary;
  try {
    summary = JSON.parse(row.summary_json) as PmTaskCompletionNotifySummary;
  } catch {
    summary = {
      projectName: "",
      title: "",
      processType: "",
      client: "",
      drawingNumber: "",
      revision: "",
      assignee: "",
      seisanProjectNo: null,
    };
  }
  return {
    id: row.id,
    taskId: row.task_id,
    summary,
    completedBy: row.completed_by,
    taskCompletedAt: row.task_completed_at,
    createdAt: row.created_at,
  };
}

function buildSummary(task: PmBoardTask, extras?: Partial<PmTaskCompletionNotifySummary>): PmTaskCompletionNotifySummary {
  return {
    kind: "task_complete",
    projectName: task.projectName,
    title: task.title,
    processType: task.processType,
    client: task.client,
    drawingNumber: task.drawingNumber,
    revision: task.revision,
    assignee: task.assignee,
    seisanProjectNo: task.seisanProjectNo,
    ...extras,
  };
}

export function insertInnerNotifications(
  recipients: string[],
  taskId: number,
  kind: PmNotificationKind,
  summary: PmTaskCompletionNotifySummary,
  actor: string,
  eventAt: string
): void {
  const unique = [...new Set(recipients.map((u) => u.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  const summaryJson = JSON.stringify({ ...summary, kind });
  const inserter = db.prepare(
    `
      INSERT INTO pm_task_completion_notifications (
        recipient_username, task_id, summary_json, completed_by, task_completed_at, created_at, notification_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  );
  const tx = db.transaction(() => {
    for (const recipient of unique) {
      inserter.run(recipient, taskId, summaryJson, actor.trim(), eventAt, now, kind);
    }
  });
  tx();
}

export function insertCompletionNotifications(
  recipients: string[],
  task: PmBoardTask,
  completedBy: string,
  taskCompletedAt: string
): void {
  const unique = [...new Set(recipients.map((u) => u.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  const summaryJson = JSON.stringify(buildSummary(task));
  const inserter = db.prepare(
    `
      INSERT INTO pm_task_completion_notifications (
        recipient_username, task_id, summary_json, completed_by, task_completed_at, created_at, notification_kind
      ) VALUES (?, ?, ?, ?, ?, ?, 'task_complete')
    `
  );
  const tx = db.transaction(() => {
    for (const recipient of unique) {
      inserter.run(recipient, task.id, summaryJson, completedBy.trim(), taskCompletedAt, now);
    }
  });
  tx();
}

export function listPendingForRecipient(recipientUsername: string): PmTaskCompletionNotification[] {
  const user = recipientUsername.trim();
  if (!user) return [];
  const db = getProcessMgmtDb();
  const rows = db
    .prepare(
      `
        SELECT id, recipient_username, task_id, summary_json, completed_by, task_completed_at, created_at, acknowledged_at
          FROM pm_task_completion_notifications
         WHERE recipient_username = ? AND acknowledged_at IS NULL
         ORDER BY id DESC
      `
    )
    .all(user) as DbNotifyRow[];
  return rows.map(mapRow);
}

export function acknowledgeNotification(notificationId: number, recipientUsername: string): void {
  const user = recipientUsername.trim();
  if (!user) {
    throw new Error("ログイン名が無効です。");
  }
  const id = Math.trunc(notificationId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("不正な通知 ID です。");
  }
  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `
        UPDATE pm_task_completion_notifications
           SET acknowledged_at = ?
         WHERE id = ? AND recipient_username = ? AND acknowledged_at IS NULL
      `
    )
    .run(now, id, user);
  if (result.changes === 0) {
    throw new Error("通知が見つからないか、すでに確認済みです。");
  }
}

export function deleteNotificationsForTask(taskId: number): void {
  if (!Number.isFinite(taskId) || taskId <= 0) return;
  const db = getProcessMgmtDb();
  db.prepare(`DELETE FROM pm_task_completion_notifications WHERE task_id = ?`).run(taskId);
}

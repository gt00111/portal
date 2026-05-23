import type {
  AuditEntry,
  AuditListParams,
  AuditListResult,
  AuditResult,
} from "@shared/audit.js";

import { getDb, isOpen } from "@main/db/connection.js";
import { getSession } from "@main/session.js";

interface RawRow {
  id: number;
  occurredAt: string;
  username: string | null;
  userNameId: number | null;
  appId: string | null;
  channel: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  result: AuditResult;
  errorMessage: string | null;
  detailJson: string | null;
}

function toEntry(raw: RawRow): AuditEntry {
  return {
    id: raw.id,
    occurredAt: raw.occurredAt,
    username: raw.username,
    userNameId: raw.userNameId,
    appId: raw.appId,
    channel: raw.channel,
    action: raw.action,
    targetType: raw.targetType,
    targetId: raw.targetId,
    result: raw.result,
    errorMessage: raw.errorMessage,
    detailJson: raw.detailJson,
  };
}

export interface AuditAppendInput {
  channel: string;
  action: string;
  result: AuditResult;
  appId?: string | null;
  targetType?: string | null;
  targetId?: string | number | null;
  errorMessage?: string | null;
  detail?: unknown;
  /** セッションを指定したい場合（呼び出し元で取得済み）。未指定なら現在の session を取得 */
  username?: string | null;
  userNameId?: number | null;
}

export function appendAuditEntry(input: AuditAppendInput): void {
  if (!isOpen()) return;
  try {
    const session = getSession();
    const username = input.username ?? session?.username ?? null;
    const userNameId =
      input.userNameId !== undefined ? input.userNameId : session?.userNameId ?? null;
    let detailJson: string | null = null;
    if (input.detail !== undefined && input.detail !== null) {
      try {
        detailJson = JSON.stringify(input.detail);
      } catch {
        detailJson = null;
      }
    }
    const targetIdStr =
      input.targetId == null ? null : String(input.targetId);
    getDb()
      .prepare(
        `INSERT INTO app_audit_log
          (username, userNameId, appId, channel, action, targetType, targetId, result, errorMessage, detailJson)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        username,
        userNameId,
        input.appId ?? null,
        input.channel,
        input.action,
        input.targetType ?? null,
        targetIdStr,
        input.result,
        input.errorMessage ?? null,
        detailJson
      );
  } catch {
    /* 監査ログ自体の失敗は無視（業務処理の妨げにならないこと） */
  }
}

export function listAuditEntries(params: AuditListParams): AuditListResult {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(Math.max(1, params.pageSize ?? 50), 200);
  const conds: string[] = [];
  const values: (string | number)[] = [];
  if (params.fromAt && params.fromAt.trim()) {
    conds.push("occurredAt >= ?");
    values.push(params.fromAt.trim());
  }
  if (params.toAt && params.toAt.trim()) {
    conds.push("occurredAt <= ?");
    values.push(params.toAt.trim());
  }
  if (params.username && params.username.trim()) {
    conds.push("username = ?");
    values.push(params.username.trim());
  }
  if (params.channel && params.channel.trim()) {
    conds.push("channel = ?");
    values.push(params.channel.trim());
  }
  if (params.result === "ok" || params.result === "fail") {
    conds.push("result = ?");
    values.push(params.result);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const totalRow = getDb()
    .prepare(`SELECT COUNT(*) AS total FROM app_audit_log ${where}`)
    .get(...values) as { total: number } | undefined;
  const total = totalRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;

  const rawRows = getDb()
    .prepare(
      `SELECT id, occurredAt, username, userNameId, appId, channel, action, targetType, targetId, result, errorMessage, detailJson
         FROM app_audit_log
         ${where}
         ORDER BY occurredAt DESC, id DESC
         LIMIT ? OFFSET ?`
    )
    .all(...values, pageSize, offset) as RawRow[];

  return {
    rows: rawRows.map(toEntry),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export function listDistinctChannels(): string[] {
  if (!isOpen()) return [];
  const rows = getDb()
    .prepare("SELECT DISTINCT channel FROM app_audit_log ORDER BY channel ASC")
    .all() as { channel: string }[];
  return rows.map((r) => r.channel);
}

export function listDistinctUsernames(): string[] {
  if (!isOpen()) return [];
  const rows = getDb()
    .prepare(
      "SELECT DISTINCT username FROM app_audit_log WHERE username IS NOT NULL ORDER BY username ASC"
    )
    .all() as { username: string }[];
  return rows.map((r) => r.username);
}

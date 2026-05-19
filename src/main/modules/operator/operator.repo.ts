import type { AppRole } from "@shared/auth.js";
import { assertProcessView, parseProcessView, type ProcessView } from "@shared/processView.js";
import type { OperatorRow } from "@shared/types.js";

import { getDb } from "@main/db/connection.js";

interface Row {
  id: number;
  username: string;
  role: AppRole;
  processView: string;
  isActive: number;
  mustChangePassword: number;
  createdAt: string;
  updatedAt: string;
}

function toOperatorRow(row: Row): OperatorRow {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    processView: parseProcessView(row.processView),
    isActive: row.isActive === 1,
    mustChangePassword: row.mustChangePassword === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 工程タスク完了通知の宛先（アクティブな admin のユーザー名） */
export function listActiveAdminUsernames(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT username FROM app_operators WHERE role = 'admin' AND isActive = 1 ORDER BY id ASC`
    )
    .all() as { username: string }[];
  return rows.map((r) => (r.username ?? "").trim()).filter((u) => u.length > 0);
}

export function listOperators(): OperatorRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, username, role, processView, isActive, mustChangePassword, createdAt, updatedAt
         FROM app_operators
        ORDER BY id ASC`
    )
    .all() as Row[];
  return rows.map(toOperatorRow);
}

export function insertOperator(input: {
  username: string;
  passwordHash: string;
  role: AppRole;
  processView?: ProcessView;
}): OperatorRow {
  const pv = input.processView ?? "both";
  assertProcessView(pv);
  const info = getDb()
    .prepare(
      `INSERT INTO app_operators (username, passwordHash, role, processView, isActive, mustChangePassword)
       VALUES (?, ?, ?, ?, 1, 1)`
    )
    .run(input.username, input.passwordHash, input.role, pv);
  const row = getDb()
    .prepare(
      `SELECT id, username, role, processView, isActive, mustChangePassword, createdAt, updatedAt
         FROM app_operators WHERE id = ?`
    )
    .get(info.lastInsertRowid) as Row;
  return toOperatorRow(row);
}

export function updateActiveFlag(id: number, isActive: boolean): void {
  getDb()
    .prepare(
      `UPDATE app_operators SET isActive = ?, updatedAt = datetime('now') WHERE id = ?`
    )
    .run(isActive ? 1 : 0, id);
}

export function updateRole(id: number, role: AppRole): void {
  getDb()
    .prepare(
      `UPDATE app_operators SET role = ?, updatedAt = datetime('now') WHERE id = ?`
    )
    .run(role, id);
}

export function updateProcessView(id: number, processView: ProcessView): void {
  assertProcessView(processView);
  getDb()
    .prepare(
      `UPDATE app_operators SET processView = ?, updatedAt = datetime('now') WHERE id = ?`
    )
    .run(processView, id);
}

export function countOtherActiveAdmins(excludeId: number): number {
  return (
    getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM app_operators
          WHERE role = 'admin' AND isActive = 1 AND id <> ?`
      )
      .get(excludeId) as { c: number }
  ).c;
}

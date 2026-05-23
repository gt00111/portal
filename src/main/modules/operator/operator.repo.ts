import type { AppRole } from "@shared/auth.js";
import { assertProcessView, type ProcessView } from "@shared/processView.js";
import type { OperatorRow } from "@shared/types.js";

import { getDb } from "@main/db/connection.js";
import {
  ensureMasterUserForUsername,
  seedDefaultGrantsForUser,
} from "@main/db/userAccessQueries.js";

interface Row {
  id: number;
  username: string;
  role: AppRole;
  processView: string;
  userNameId: number | null;
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
    userNameId: row.userNameId,
    isActive: row.isActive === 1,
    mustChangePassword: row.mustChangePassword === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listOperators(): OperatorRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, username, role, processView, userNameId, isActive, mustChangePassword, createdAt, updatedAt
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
}): OperatorRow {
  const username = input.username.trim();
  const userNameId = ensureMasterUserForUsername(username);
  const processView: ProcessView = "both";
  assertProcessView(processView);

  const info = getDb()
    .prepare(
      `INSERT INTO app_operators (username, passwordHash, role, processView, userNameId, isActive, mustChangePassword)
       VALUES (?, ?, ?, ?, ?, 1, 1)`
    )
    .run(username, input.passwordHash, input.role, processView, userNameId);

  seedDefaultGrantsForUser(userNameId, "viewer", processView);

  const row = getDb()
    .prepare(
      `SELECT id, username, role, processView, userNameId, isActive, mustChangePassword, createdAt, updatedAt
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

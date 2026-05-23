import type { AppRole } from "@shared/auth.js";

import { getDb } from "@main/db/connection.js";

export interface OperatorRecord {
  id: number;
  username: string;
  passwordHash: string;
  role: AppRole;
  processView: string;
  userNameId: number | null;
  isActive: number;
  mustChangePassword: number;
}

export function findActiveOperatorByUsername(username: string): OperatorRecord | null {
  const row = getDb()
    .prepare(
      `SELECT id, username, passwordHash, role, processView, userNameId, isActive, mustChangePassword
         FROM app_operators
        WHERE username = ? AND isActive = 1`
    )
    .get(username) as OperatorRecord | undefined;
  return row ?? null;
}

export function findOperatorById(id: number): OperatorRecord | null {
  const row = getDb()
    .prepare(
      `SELECT id, username, passwordHash, role, processView, userNameId, isActive, mustChangePassword
         FROM app_operators
        WHERE id = ?`
    )
    .get(id) as OperatorRecord | undefined;
  return row ?? null;
}

export function updatePassword(id: number, passwordHash: string): void {
  getDb()
    .prepare(
      `UPDATE app_operators
          SET passwordHash = ?, mustChangePassword = 0, updatedAt = datetime('now')
        WHERE id = ?`
    )
    .run(passwordHash, id);
}

export function countActiveAdmins(): number {
  return (
    getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM app_operators WHERE role = 'admin' AND isActive = 1`
      )
      .get() as { c: number }
  ).c;
}

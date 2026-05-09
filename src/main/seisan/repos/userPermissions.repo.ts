import { getSeisanDb } from "@main/db/seisanConnection.js";
import { now } from "@main/seisan/utils/datetime.js";

export type UserRole = 'viewer' | 'editor' | 'approver'

export interface UserPermission {
  user_name: string
  role: UserRole
  created_at: string
  updated_at: string
}

export function list(): UserPermission[] {
  const db = getSeisanDb()
  return db.prepare('SELECT * FROM user_permissions ORDER BY user_name').all() as UserPermission[]
}

export function getRole(userName: string): UserRole {
  const db = getSeisanDb()
  const row = db.prepare('SELECT role FROM user_permissions WHERE user_name = ?').get(userName) as { role: UserRole } | undefined
  return row?.role ?? 'viewer'
}

export function setRole(userName: string, role: UserRole): UserPermission {
  const db = getSeisanDb()
  const ts = now()
  db.prepare(`
    INSERT INTO user_permissions (user_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_name) DO UPDATE SET role = ?, updated_at = ?
  `).run(userName, role, ts, ts, role, ts)
  return db.prepare('SELECT * FROM user_permissions WHERE user_name = ?').get(userName) as UserPermission
}

export function countByRole(role: UserRole): number {
  const db = getSeisanDb()
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM user_permissions WHERE role = ?').get(role) as { cnt: number }
  return row.cnt
}

export function remove(userName: string): void {
  const db = getSeisanDb()
  db.prepare('DELETE FROM user_permissions WHERE user_name = ?').run(userName)
}

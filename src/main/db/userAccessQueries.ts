import { GRANTABLE_APP_IDS, isGrantableAppId, type GrantableAppId } from "@shared/appIds.js";
import type { AppRole } from "@shared/auth.js";
import { parseProcessView, type ProcessView } from "@shared/processView.js";
import type { GroupRole, UserAppGrantRow, UserAccessDetail } from "@shared/userAccess.js";

import { getDb } from "@main/db/connection.js";

export function findUserNameIdByName(name: string): number | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const row = getDb()
    .prepare(`SELECT id FROM m_user_names WHERE name = ? COLLATE NOCASE LIMIT 1`)
    .get(trimmed) as { id: number } | undefined;
  return row?.id ?? null;
}

export function ensureMasterUserForUsername(username: string): number {
  const trimmed = username.trim();
  if (!trimmed) throw new Error("ユーザー名が空です。");
  const existing = findUserNameIdByName(trimmed);
  if (existing != null) return existing;
  const info = getDb()
    .prepare(`INSERT INTO m_user_names (code, name, note, isActive) VALUES (?, ?, NULL, 1)`)
    .run(trimmed, trimmed);
  return Number(info.lastInsertRowid);
}

export function getMasterUserDisplayName(userNameId: number): string {
  const row = getDb()
    .prepare(`SELECT name FROM m_user_names WHERE id = ?`)
    .get(userNameId) as { name: string } | undefined;
  if (!row) throw new Error("マスタユーザーが見つかりません。");
  return row.name;
}

export function loadAppGrantsForUser(
  userNameId: number
): Partial<Record<GrantableAppId, AppRole>> {
  const rows = getDb()
    .prepare(
      `SELECT appId, appRole FROM m_user_app_grants WHERE userNameId = ? ORDER BY appId ASC`
    )
    .all(userNameId) as { appId: string; appRole: AppRole }[];

  const grants: Partial<Record<GrantableAppId, AppRole>> = {};
  for (const row of rows) {
    if (isGrantableAppId(row.appId)) {
      grants[row.appId] = row.appRole;
    }
  }
  return grants;
}

export function loadProcessViewForUser(userNameId: number, fallback: ProcessView): ProcessView {
  const row = getDb()
    .prepare(
      `SELECT processView FROM m_user_app_grants
        WHERE userNameId = ? AND appId = 'process-management'`
    )
    .get(userNameId) as { processView: string | null } | undefined;
  if (row?.processView) {
    return parseProcessView(row.processView);
  }
  return fallback;
}

export function loadGroupRoleForUser(userNameId: number): GroupRole | null {
  const row = getDb()
    .prepare(
      `SELECT roleInGroup FROM m_user_group_memberships WHERE userNameId = ? LIMIT 1`
    )
    .get(userNameId) as { roleInGroup: GroupRole } | undefined;
  return row?.roleInGroup ?? null;
}

export function loadGroupMembershipForUser(
  userNameId: number
): { groupNameId: number; groupName: string } | null {
  const row = getDb()
    .prepare(
      `
      SELECT m.groupNameId, g.name AS groupName
        FROM m_user_group_memberships m
        JOIN m_group_names g ON g.id = m.groupNameId
       WHERE m.userNameId = ?
       LIMIT 1
      `
    )
    .get(userNameId) as { groupNameId: number; groupName: string } | undefined;
  if (!row) return null;
  return { groupNameId: row.groupNameId, groupName: row.groupName };
}

export function listGroupMembers(
  groupNameId: number
): Array<{ userNameId: number; userName: string }> {
  return getDb()
    .prepare(
      `
      SELECT u.id AS userNameId, u.name AS userName
        FROM m_user_group_memberships m
        JOIN m_user_names u ON u.id = m.userNameId
       WHERE m.groupNameId = ? AND u.isActive = 1
       ORDER BY u.name COLLATE NOCASE ASC, u.id ASC
      `
    )
    .all(groupNameId) as Array<{ userNameId: number; userName: string }>;
}

/** 生産案件のグループ名（文字列）に紐づくグループ管理者のログイン名 */
export function listGroupAdminUsernamesForGroupName(groupName: string): string[] {
  const trimmed = groupName.trim();
  if (!trimmed) return [];

  const group = getDb()
    .prepare(`SELECT id FROM m_group_names WHERE name = ? COLLATE NOCASE LIMIT 1`)
    .get(trimmed) as { id: number } | undefined;
  if (!group) return [];

  const rows = getDb()
    .prepare(
      `
      SELECT u.name AS userName
        FROM m_user_group_memberships m
        JOIN m_user_names u ON u.id = m.userNameId
        JOIN app_operators o ON o.userNameId = u.id AND o.isActive = 1
       WHERE m.groupNameId = ? AND m.roleInGroup = 'group_admin'
       ORDER BY u.name COLLATE NOCASE ASC
      `
    )
    .all(group.id) as { userName: string }[];

  return rows.map((r) => (r.userName ?? "").trim()).filter((n) => n.length > 0);
}

export function seedDefaultGrantsForUser(userNameId: number, appRole: AppRole, processView: ProcessView): void {
  const upsert = getDb().prepare(
    `INSERT INTO m_user_app_grants (userNameId, appId, appRole, processView, updatedAt)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(userNameId, appId) DO UPDATE SET
       appRole = excluded.appRole,
       processView = excluded.processView,
       updatedAt = datetime('now')`
  );
  for (const appId of GRANTABLE_APP_IDS) {
    const pv = appId === "process-management" ? processView : null;
    upsert.run(userNameId, appId, appRole, pv);
  }
}

export function listUserAccessDetails(): UserAccessDetail[] {
  const users = getDb()
    .prepare(
      `SELECT id, code, name FROM m_user_names ORDER BY name COLLATE NOCASE ASC, id ASC`
    )
    .all() as { id: number; code: string; name: string }[];

  const opByUser = new Map<number, { id: number; isActive: number }>();
  for (const row of getDb()
    .prepare(`SELECT id, userNameId, isActive FROM app_operators WHERE userNameId IS NOT NULL`)
    .all() as { id: number; userNameId: number; isActive: number }[]) {
    opByUser.set(row.userNameId, { id: row.id, isActive: row.isActive });
  }

  const membershipByUser = new Map<
    number,
    { groupNameId: number; groupName: string; roleInGroup: GroupRole }
  >();
  for (const row of getDb()
    .prepare(
      `
      SELECT m.userNameId, m.groupNameId, m.roleInGroup, g.name AS groupName
        FROM m_user_group_memberships m
        JOIN m_group_names g ON g.id = m.groupNameId
      `
    )
    .all() as {
    userNameId: number;
    groupNameId: number;
    roleInGroup: GroupRole;
    groupName: string;
  }[]) {
    membershipByUser.set(row.userNameId, {
      groupNameId: row.groupNameId,
      groupName: row.groupName,
      roleInGroup: row.roleInGroup,
    });
  }

  const grantsByUser = new Map<number, UserAppGrantRow[]>();
  for (const row of getDb()
    .prepare(
      `SELECT userNameId, appId, appRole, processView FROM m_user_app_grants ORDER BY appId ASC`
    )
    .all() as {
    userNameId: number;
    appId: string;
    appRole: AppRole;
    processView: string | null;
  }[]) {
    if (!isGrantableAppId(row.appId)) continue;
    const list = grantsByUser.get(row.userNameId) ?? [];
    list.push({
      userNameId: row.userNameId,
      appId: row.appId,
      appRole: row.appRole,
      processView: row.processView ? parseProcessView(row.processView) : null,
    });
    grantsByUser.set(row.userNameId, list);
  }

  return users.map((u) => {
    const op = opByUser.get(u.id);
    return {
      userNameId: u.id,
      userName: u.name,
      userCode: u.code,
      operatorId: op?.id ?? null,
      operatorActive: op ? op.isActive === 1 : false,
      groupMembership: membershipByUser.get(u.id) ?? null,
      appGrants: grantsByUser.get(u.id) ?? [],
    };
  });
}

export function setUserGroupMembership(
  userNameId: number,
  groupNameId: number | null,
  roleInGroup: GroupRole
): void {
  const db = getDb();
  if (groupNameId == null) {
    db.prepare(`DELETE FROM m_user_group_memberships WHERE userNameId = ?`).run(userNameId);
    return;
  }
  db.prepare(
    `INSERT INTO m_user_group_memberships (userNameId, groupNameId, roleInGroup, updatedAt)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(userNameId) DO UPDATE SET
       groupNameId = excluded.groupNameId,
       roleInGroup = excluded.roleInGroup,
       updatedAt = datetime('now')`
  ).run(userNameId, groupNameId, roleInGroup);
}

export function replaceUserAppGrants(userNameId: number, grants: UserAppGrantRow[]): void {
  const db = getDb();
  const del = db.prepare(`DELETE FROM m_user_app_grants WHERE userNameId = ?`);
  const ins = db.prepare(
    `INSERT INTO m_user_app_grants (userNameId, appId, appRole, processView, updatedAt)
     VALUES (?, ?, ?, ?, datetime('now'))`
  );
  const tx = db.transaction(() => {
    del.run(userNameId);
    for (const g of grants) {
      if (!isGrantableAppId(g.appId)) continue;
      const pv = g.appId === "process-management" ? g.processView : null;
      ins.run(userNameId, g.appId, g.appRole, pv);
    }
  });
  tx();
}

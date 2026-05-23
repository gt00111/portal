import { parseProcessView } from "@shared/processView.js";
import type { SessionUser } from "@shared/types.js";

import {
  getMasterUserDisplayName,
  loadAppGrantsForUser,
  loadGroupRoleForUser,
  loadProcessViewForUser,
} from "@main/db/userAccessQueries.js";
import type { OperatorRecord } from "@main/modules/auth/auth.repo.js";

export function buildSessionFromOperator(record: OperatorRecord): SessionUser {
  if (record.userNameId == null) {
    throw new Error(
      "ログインアカウントがマスタユーザーに紐づいていません。ポータル管理者に連絡してください。"
    );
  }
  const userNameId = record.userNameId;
  const fallbackPv = parseProcessView(record.processView);
  return {
    id: record.id,
    username: record.username,
    role: record.role,
    userNameId,
    displayName: getMasterUserDisplayName(userNameId),
    processView: loadProcessViewForUser(userNameId, fallbackPv),
    appGrants: loadAppGrantsForUser(userNameId),
    groupRole: loadGroupRoleForUser(userNameId),
    mustChangePassword: record.mustChangePassword === 1,
  };
}

import type { AppRole } from "@shared/auth.js";
import { assertProcessView, type ProcessView } from "@shared/processView.js";
import type { GrantableAppId } from "@shared/appIds.js";
import { isGrantableAppId } from "@shared/appIds.js";
import type { GroupRole, UserAppGrantRow } from "@shared/userAccess.js";

import {
  listUserAccessDetails,
  replaceUserAppGrants,
  setUserGroupMembership,
} from "@main/db/userAccessQueries.js";

export { listUserAccessDetails };

export function saveUserGroupMembership(input: {
  userNameId: number;
  groupNameId: number | null;
  roleInGroup: GroupRole;
}): void {
  setUserGroupMembership(input.userNameId, input.groupNameId, input.roleInGroup);
}

export function saveUserAppGrants(userNameId: number, grants: UserAppGrantRow[]): void {
  for (const g of grants) {
    if (!isGrantableAppId(g.appId)) {
      throw new Error(`不明なアプリ ID: ${g.appId}`);
    }
    if (g.appId === "process-management" && g.processView != null) {
      assertProcessView(g.processView);
    }
  }
  replaceUserAppGrants(userNameId, grants);
}

export function normalizeGrantInput(
  appId: GrantableAppId,
  appRole: AppRole,
  processView: ProcessView | null
): UserAppGrantRow {
  return {
    userNameId: 0,
    appId,
    appRole,
    processView: appId === "process-management" ? processView : null,
  };
}

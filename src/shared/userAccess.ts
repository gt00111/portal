import type { AppRole } from "./auth.js";
import type { ProcessView } from "./processView.js";
import type { GrantableAppId } from "./appIds.js";

export const GROUP_ROLES = ["member", "group_admin"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export interface UserAppGrantRow {
  userNameId: number;
  appId: GrantableAppId;
  appRole: AppRole;
  processView: ProcessView | null;
}

export interface UserGroupMembershipRow {
  userNameId: number;
  groupNameId: number;
  roleInGroup: GroupRole;
  groupName: string;
  userName: string;
}

export interface UserAccessDetail {
  userNameId: number;
  userName: string;
  userCode: string;
  operatorId: number | null;
  operatorActive: boolean;
  groupMembership: {
    groupNameId: number;
    groupName: string;
    roleInGroup: GroupRole;
  } | null;
  appGrants: UserAppGrantRow[];
}

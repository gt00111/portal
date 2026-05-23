/** マスタ `m_user_app_grants.appId` とランチャー `AppDescriptor.id` で共通の ID */
export const GRANTABLE_APP_IDS = [
  "master-database",
  "seisan-board",
  "drawing-library",
  "process-management",
  "pixo-converter",
] as const;

export type GrantableAppId = (typeof GRANTABLE_APP_IDS)[number];

export function isGrantableAppId(value: string): value is GrantableAppId {
  return (GRANTABLE_APP_IDS as readonly string[]).includes(value);
}

import type { AppRole } from "./auth.js";
import type { GrantableAppId } from "./appIds.js";
import type { GroupRole } from "./userAccess.js";
import type { ProcessView } from "./processView.js";

export interface SessionUser {
  id: number;
  username: string;
  /** ポータル操作者の権限（ポータル設定・マスタ編集のみに使用） */
  role: AppRole;
  userNameId: number;
  /** マスタユーザー名（ログイン名と同一） */
  displayName: string;
  /** 工程管理アプリ権限から解決（後方互換・IPC 用） */
  processView: ProcessView;
  /** アプリ別業務権限（ログイン時に読込） */
  appGrants: Partial<Record<GrantableAppId, AppRole>>;
  /** 所属グループ内の役割（未所属なら null） */
  groupRole: GroupRole | null;
  mustChangePassword: boolean;
}

export interface OperatorRow {
  id: number;
  username: string;
  role: AppRole;
  userNameId: number | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyInfo {
  companyName: string;
  mottos: string[];
  /** app_settings に保存するローカル画像パス（未設定時は null） */
  homeHeroBackgroundPath: string | null;
  /** メインが存在確認後に付与する file URL（ホームの CSS 背景用） */
  homeHeroBackgroundFileUrl: string | null;
}

export type BootstrapStage = "db_unset" | "db_ready" | "no_operators" | "ready";

export interface SettingsSnapshot {
  dbPath: string | null;
  bootstrapped: boolean;
  stage: BootstrapStage;
  company: CompanyInfo;
}

/** ポータルホームのアプリ一覧セクション（表示順は PORTAL_APP_SECTION_ORDER） */
export type PortalAppSectionId =
  | "shared-database"
  | "office-support"
  | "progress"
  | "helper-apps";

export interface AppDescriptor {
  id: string;
  displayName: string;
  description: string;
  kind: "internal" | "external";
  ready: boolean;
  section: PortalAppSectionId;
}

import type { AppRole } from "./auth.js";
import type { ProcessView } from "./processView.js";

export interface SessionUser {
  id: number;
  username: string;
  role: AppRole;
  processView: ProcessView;
  mustChangePassword: boolean;
}

export interface OperatorRow {
  id: number;
  username: string;
  role: AppRole;
  processView: ProcessView;
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

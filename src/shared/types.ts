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
}

export type BootstrapStage = "db_unset" | "db_ready" | "no_operators" | "ready";

export interface SettingsSnapshot {
  dbPath: string | null;
  bootstrapped: boolean;
  stage: BootstrapStage;
  company: CompanyInfo;
}

export interface AppDescriptor {
  id: string;
  displayName: string;
  description: string;
  kind: "internal" | "external";
  ready: boolean;
}

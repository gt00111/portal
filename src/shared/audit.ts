/** 監査ログの shared 型 */

export type AuditResult = "ok" | "fail";

export interface AuditEntry {
  id: number;
  occurredAt: string;
  username: string | null;
  userNameId: number | null;
  appId: string | null;
  channel: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  result: AuditResult;
  errorMessage: string | null;
  detailJson: string | null;
}

export interface AuditListParams {
  /** ISO 文字列（YYYY-MM-DD or YYYY-MM-DD HH:MM:SS）。範囲フィルタ */
  fromAt?: string | null;
  toAt?: string | null;
  username?: string | null;
  channel?: string | null;
  result?: AuditResult | null;
  /** 1 ベースのページ */
  page?: number;
  /** 1 ページの件数（既定 50） */
  pageSize?: number;
}

export interface AuditListResult {
  rows: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

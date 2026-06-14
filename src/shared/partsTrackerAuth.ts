/** 部材管理（parts-tracker）アプリ内ロール別権限 — §8.5.20 */

import { getAppRole, type AppRole } from "./auth.js";
import type { ProjectPartLineUpsertInput } from "./partsTracker.js";
import type { SessionUser } from "./types.js";

const APP = "parts-tracker" as const;

export function getPartsTrackerAppRole(session: SessionUser): AppRole | null {
  return getAppRole(session, APP);
}

/** BOM CSV 取込・前回案件コピー・手動行追加 */
export function canPartsTrackerImport(session: SessionUser): boolean {
  return getPartsTrackerAppRole(session) === "admin";
}

/** 一括編集モード（区分・商社・状態） */
export function canPartsTrackerBulkEdit(session: SessionUser): boolean {
  const r = getPartsTrackerAppRole(session);
  return r === "admin" || r === "editor";
}

/** モーダルで品番・名称・Rev・数量を編集 */
export function canPartsTrackerEditBomIdentity(session: SessionUser): boolean {
  return getPartsTrackerAppRole(session) === "admin";
}

/** 行の非表示 / 再表示 */
export function canPartsTrackerSetHidden(session: SessionUser): boolean {
  return getPartsTrackerAppRole(session) === "admin";
}

/** 行削除（管理者のみ） */
export function canPartsTrackerDeleteLine(session: SessionUser): boolean {
  return getPartsTrackerAppRole(session) === "admin";
}

/** モーダル編集（調達まわり等・BOM 同一性以外） */
export function canPartsTrackerModalEdit(session: SessionUser): boolean {
  return canPartsTrackerBulkEdit(session);
}

/** 手配済 ON/OFF */
export function canPartsTrackerSetArranged(session: SessionUser): boolean {
  return canPartsTrackerBulkEdit(session);
}

/** 案件完了（§8.5.21）・完了の解除（§8.5.21.1） */
export function canPartsTrackerCompleteProject(session: SessionUser): boolean {
  return canPartsTrackerBulkEdit(session);
}

/** 溶接工程マッピング（§8.5.22.7） */
export function canPartsTrackerWeldingMapping(session: SessionUser): boolean {
  return getPartsTrackerAppRole(session) === "admin";
}

/** CSV 出力・コピー（印刷用）・印刷 */
export function canPartsTrackerExport(session: SessionUser): boolean {
  return getPartsTrackerAppRole(session) != null;
}

/** editor が line:update で送ってよいキーのみ残す */
export function filterEditorLineUpdateInput(
  input: Partial<ProjectPartLineUpsertInput>
): Partial<ProjectPartLineUpsertInput> {
  return {
    supplierId: input.supplierId,
    leadTimeDays: input.leadTimeDays,
    requiredDate: input.requiredDate,
    note: input.note,
  };
}

export function assertEditorMayUpdateLine(
  input: Partial<ProjectPartLineUpsertInput>,
  existing: {
    partNumber: string;
    partName: string;
    revision: string | null;
    quantity: number;
    sourceType: string;
    status: string;
  }
): void {
  if (input.partNumber !== undefined && input.partNumber.trim() !== existing.partNumber) {
    throw new Error("品番の変更は管理者のみ可能です。");
  }
  if (input.partName !== undefined && input.partName.trim() !== existing.partName) {
    throw new Error("部品名称の変更は管理者のみ可能です。");
  }
  if (input.revision !== undefined && (input.revision ?? null) !== (existing.revision ?? null)) {
    throw new Error("Rev の変更は管理者のみ可能です。");
  }
  if (input.quantity !== undefined && Number(input.quantity) !== existing.quantity) {
    throw new Error("数量の変更は管理者のみ可能です。");
  }
  if (input.sourceType !== undefined && input.sourceType !== existing.sourceType) {
    throw new Error("調達区分の変更は一括編集モードを使用してください。");
  }
  if (input.status !== undefined && input.status !== existing.status) {
    throw new Error("状態の変更は一括編集モードを使用してください。");
  }
}

export function isPartsTrackerAdminRole(role: AppRole | null): boolean {
  return role === "admin";
}

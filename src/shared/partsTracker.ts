export const PART_SOURCE_TYPES = ["inhouse", "purchase", "supplied", "unset"] as const;
export type PartSourceType = (typeof PART_SOURCE_TYPES)[number];

export const PART_SOURCE_TYPE_LABELS: Record<PartSourceType, string> = {
  inhouse: "社内製作",
  purchase: "購入",
  supplied: "支給品",
  unset: "未設定",
};

export const PART_LINE_STATUSES = [
  "planned",
  "ordered",
  "in_progress",
  "received",
  "delayed",
] as const;
export type PartLineStatus = (typeof PART_LINE_STATUSES)[number];

export const PART_LINE_STATUS_LABELS: Record<PartLineStatus, string> = {
  planned: "未着手",
  ordered: "発注済",
  in_progress: "製作中",
  received: "入荷済",
  delayed: "遅延",
};

export type PartLineRisk = "ok" | "need_order" | "delayed";

export interface ProjectPartLine {
  id: number;
  seisanProjectId: string;
  partNumber: string;
  partName: string;
  revision: string | null;
  quantity: number;
  sourceType: PartSourceType;
  supplierId: number | null;
  supplierName: string | null;
  leadTimeDays: number;
  requiredDate: string;
  orderByDate: string | null;
  orderedAt: string | null;
  status: PartLineStatus;
  skuId: number | null;
  procurementLeadTimeId: number | null;
  note: string | null;
  sortOrder: number;
  isArranged: boolean;
  arrangedAt: string | null;
  arrangedByUserNameId: number | null;
  arrangedByUsername: string | null;
  isHidden: boolean;
  hiddenAt: string | null;
  hiddenByUsername: string | null;
  hiddenReason: string | null;
  bomLevel: number;
  assemblyPath: string | null;
  parentAssemblyPartNumber: string | null;
  rootProductBomId: number | null;
  sourceProductBomLineId: number | null;
  importBatchId: number | null;
  requiredDateUserOverride: boolean;
  risk: PartLineRisk;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPartLineUpsertInput {
  seisanProjectId: string;
  partNumber: string;
  partName: string;
  revision?: string | null;
  quantity?: number;
  sourceType: PartSourceType;
  supplierId?: number | null;
  leadTimeDays?: number;
  requiredDate: string;
  orderedAt?: string | null;
  status?: PartLineStatus;
  skuId?: number | null;
  note?: string | null;
  sortOrder?: number;
}

export interface ProjectPartSummary {
  seisanProjectId: string;
  totalLines: number;
  visibleLines: number;
  hiddenLines: number;
  delayedCount: number;
  needOrderCount: number;
  plannedCount: number;
  arrangedCount: number;
  /** 生産案件が完了（`projects.status = done`）のとき true — リスク件数は 0 で返す */
  projectComplete: boolean;
}

export interface SetArrangedInput {
  id: number;
  arranged: boolean;
}

/** §8.5.16 一覧インライン編集の一括保存 */
export interface LineInlineBatchUpdateItem {
  id: number;
  sourceType: PartSourceType;
  supplierId: number | null;
  status: PartLineStatus;
}

export interface LineInlineBatchUpdateInput {
  updates: LineInlineBatchUpdateItem[];
}

export type SourceTabFilter = "all" | PartSourceType;

export interface SetHiddenInput {
  id: number;
  hidden: boolean;
  reason?: string | null;
}

export interface ProjectPartArrangementLogEntry {
  id: number;
  lineId: number;
  action: "set" | "unset";
  userNameId: number | null;
  username: string | null;
  occurredAt: string;
}

/** §8.5.17.3 案件選択（projectList 応答） */
export interface PartsTrackerProjectOption {
  id: string;
  projectNo: string | null;
  projectName: string | null;
  companyName: string;
  /** 生産ボード `projects.model_type`（図面ライブラリ連携の機種） */
  modelType: string | null;
  deadline: string;
  partNumber: string | null;
  lineCount: number;
  /** 生産ボード `projects.status`（§8.5.21 案件完了連動） */
  status: string;
}

export interface CompleteProjectInput {
  seisanProjectId: string;
}

export interface CompleteProjectResult {
  id: string;
  status: string;
}

/** §8.5.6.3.2 手配済チェックは購入行のみ */
export function showsArrangedCheckbox(sourceType: PartSourceType): boolean {
  return sourceType === "purchase";
}

/** §8.5.6.3.1 手配済 ON/OFF 時の status 自動進行（購入のみ） */
export function resolveStatusAfterArrangedToggle(
  status: PartLineStatus,
  arranged: boolean
): PartLineStatus | undefined {
  if (arranged) {
    if (status === "planned") return "ordered";
    return undefined;
  }
  if (status === "ordered") return "planned";
  return undefined;
}

/** §8.5.17.1 リピート BOM コピー元候補 */
export interface RepeatSourceCandidate {
  id: string;
  projectNo: string | null;
  projectName: string | null;
  companyName: string;
  deadline: string;
  lineCount: number;
}

export interface SuggestRepeatSourcesInput {
  seisanProjectId: string;
}

export interface SuggestRepeatSourcesResult {
  targetPartNumber: string | null;
  candidates: RepeatSourceCandidate[];
}

export interface CloneBomFromInput {
  targetProjectId: string;
  sourceProjectId: string;
  includeHidden?: boolean;
  replaceExisting?: boolean;
}

export interface CloneBomFromResult {
  insertedCount: number;
  removedCount: number;
}

export type {
  SyncRequiredDatesFromWeldingResult,
  WeldingProcessTemplateMapping,
  WeldingStartDateInfo,
  WeldingStartDateSource,
} from "./partsTrackerWeldingDate.js";

/** §8.5.18.4 トレーサビリティ履歴インデックス */
export interface PartsTrackerHistoryEntry {
  projectId: string;
  projectNo: string | null;
  projectName: string | null;
  companyName: string;
  deadline: string;
  partNumber: string | null;
  totalLines: number;
  visibleLines: number;
  hiddenLines: number;
  lastUpdatedAt: string | null;
  lastImportAt: string | null;
  lastImportFileName: string | null;
  lastImportRowCount: number | null;
  importBatchCount: number;
}

export function isPartSourceType(value: unknown): value is PartSourceType {
  return typeof value === "string" && (PART_SOURCE_TYPES as readonly string[]).includes(value);
}

export function isPartLineStatus(value: unknown): value is PartLineStatus {
  return typeof value === "string" && (PART_LINE_STATUSES as readonly string[]).includes(value);
}

/** §8.5.18: LT・発注期限を一覧表示する区分 */
export function showsProcurementLeadTime(sourceType: PartSourceType): boolean {
  return sourceType === "purchase" || sourceType === "supplied";
}

export function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function subtractDaysFromIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function computeOrderByDate(requiredDate: string, leadTimeDays: number): string {
  return subtractDaysFromIso(requiredDate, Math.max(0, leadTimeDays));
}

export function computePartLineRisk(input: {
  status: PartLineStatus;
  requiredDate: string;
  orderByDate: string | null;
  leadTimeDays: number;
  sourceType?: PartSourceType;
}): PartLineRisk {
  if (input.status === "received") return "ok";
  const today = todayIsoLocal();
  if (input.requiredDate < today) return "delayed";
  const useLt =
    input.sourceType == null || showsProcurementLeadTime(input.sourceType);
  if (useLt && input.status === "planned") {
    const orderBy =
      input.orderByDate ?? computeOrderByDate(input.requiredDate, input.leadTimeDays);
    if (today > orderBy) return "need_order";
  }
  return "ok";
}

export const PART_SOURCE_TYPES = ["inhouse", "purchase", "supplied"] as const;
export type PartSourceType = (typeof PART_SOURCE_TYPES)[number];

export const PART_SOURCE_TYPE_LABELS: Record<PartSourceType, string> = {
  inhouse: "社内製作",
  purchase: "購入",
  supplied: "支給品",
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
}

export interface SetArrangedInput {
  id: number;
  arranged: boolean;
}

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

export function isPartSourceType(value: unknown): value is PartSourceType {
  return typeof value === "string" && (PART_SOURCE_TYPES as readonly string[]).includes(value);
}

export function isPartLineStatus(value: unknown): value is PartLineStatus {
  return typeof value === "string" && (PART_LINE_STATUSES as readonly string[]).includes(value);
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
}): PartLineRisk {
  if (input.status === "received") return "ok";
  const today = todayIsoLocal();
  if (input.requiredDate < today) return "delayed";
  const orderBy =
    input.orderByDate ?? computeOrderByDate(input.requiredDate, input.leadTimeDays);
  if (input.status === "planned" && today > orderBy) return "need_order";
  if (input.status === "planned" && today > subtractDaysFromIso(input.requiredDate, input.leadTimeDays)) {
    return "need_order";
  }
  return "ok";
}

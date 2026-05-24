import type { PartSourceType } from "./partsTracker.js";

export interface ProcurementLeadTimeRow {
  id: number;
  sourceType: PartSourceType;
  supplierId: number | null;
  supplierName: string | null;
  skuId: number | null;
  partNumber: string | null;
  leadTimeDays: number;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProcurementLeadTimeUpsertInput {
  sourceType: PartSourceType;
  supplierId?: number | null;
  skuId?: number | null;
  partNumber?: string | null;
  leadTimeDays: number;
  note?: string | null;
  isActive?: boolean;
}

export interface ResolveLeadTimeInput {
  sourceType: PartSourceType;
  supplierId?: number | null;
  skuId?: number | null;
  partNumber?: string | null;
}

export interface ResolvedLeadTime {
  leadTimeDays: number;
  procurementLeadTimeId: number | null;
}

/** マスタ行リストから最も具体な LT を選ぶ（handler/repo 共通） */
export function pickBestLeadTime(
  rows: ProcurementLeadTimeRow[],
  input: ResolveLeadTimeInput
): ResolvedLeadTime {
  const active = rows.filter((r) => r.isActive && r.sourceType === input.sourceType);
  if (active.length === 0) {
    return { leadTimeDays: 0, procurementLeadTimeId: null };
  }

  const supplierId = input.supplierId ?? null;
  const skuId = input.skuId ?? null;
  const partNumber = (input.partNumber ?? "").trim() || null;

  const score = (r: ProcurementLeadTimeRow): number => {
    let s = 0;
    if (r.supplierId != null) {
      if (r.supplierId !== supplierId) return -1;
      s += 4;
    }
    if (r.skuId != null) {
      if (r.skuId !== skuId) return -1;
      s += 2;
    }
    if (r.partNumber != null && r.partNumber.trim()) {
      if (r.partNumber.trim().toLowerCase() !== (partNumber ?? "").toLowerCase()) return -1;
      s += 1;
    }
    return s;
  };

  let best: ProcurementLeadTimeRow | null = null;
  let bestScore = -1;
  for (const row of active) {
    const sc = score(row);
    if (sc > bestScore) {
      bestScore = sc;
      best = row;
    }
  }

  if (!best || bestScore < 0) {
    return { leadTimeDays: 0, procurementLeadTimeId: null };
  }
  return { leadTimeDays: best.leadTimeDays, procurementLeadTimeId: best.id };
}

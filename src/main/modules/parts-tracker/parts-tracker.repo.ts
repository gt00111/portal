import type {
  PartLineStatus,
  PartSourceType,
  ProjectPartLine,
  ProjectPartLineUpsertInput,
  ProjectPartSummary,
} from "@shared/partsTracker.js";
import {
  computeOrderByDate,
  computePartLineRisk,
  isPartLineStatus,
  isPartSourceType,
} from "@shared/partsTracker.js";
import type { ProcurementLeadTimeRow } from "@shared/procurementLeadTime.js";
import { pickBestLeadTime } from "@shared/procurementLeadTime.js";

import { getDb } from "@main/db/connection.js";
import { getPartsTrackerDb } from "@main/db/partsTrackerConnection.js";

interface DbLineRow {
  id: number;
  seisan_project_id: string;
  part_number: string;
  part_name: string;
  quantity: number;
  source_type: string;
  supplier_id: number | null;
  lead_time_days: number;
  required_date: string;
  order_by_date: string | null;
  ordered_at: string | null;
  status: string;
  sku_id: number | null;
  procurement_lead_time_id: number | null;
  note: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function loadLeadTimeMasterRows(): ProcurementLeadTimeRow[] {
  const rows = getDb()
    .prepare(
      `SELECT
        lt.id,
        lt.source_type AS sourceType,
        lt.supplier_id AS supplierId,
        s.name AS supplierName,
        lt.sku_id AS skuId,
        lt.part_number AS partNumber,
        lt.lead_time_days AS leadTimeDays,
        lt.note,
        lt.isActive,
        lt.createdAt,
        lt.updatedAt
      FROM m_procurement_lead_times lt
      LEFT JOIN m_suppliers s ON s.id = lt.supplier_id`
    )
    .all() as ProcurementLeadTimeRow[];
  return rows.map((r) => ({
    ...r,
    isActive: Boolean(r.isActive),
  }));
}

function supplierName(supplierId: number | null): string | null {
  if (supplierId == null) return null;
  const row = getDb()
    .prepare(`SELECT name FROM m_suppliers WHERE id = ?`)
    .get(supplierId) as { name: string } | undefined;
  return row?.name ?? null;
}

function mapLine(raw: DbLineRow): ProjectPartLine {
  const status = raw.status as PartLineStatus;
  const orderByDate =
    raw.order_by_date ?? computeOrderByDate(raw.required_date, raw.lead_time_days);
  return {
    id: raw.id,
    seisanProjectId: raw.seisan_project_id,
    partNumber: raw.part_number,
    partName: raw.part_name,
    quantity: raw.quantity,
    sourceType: raw.source_type as PartSourceType,
    supplierId: raw.supplier_id,
    supplierName: supplierName(raw.supplier_id),
    leadTimeDays: raw.lead_time_days,
    requiredDate: raw.required_date,
    orderByDate,
    orderedAt: raw.ordered_at,
    status,
    skuId: raw.sku_id,
    procurementLeadTimeId: raw.procurement_lead_time_id,
    note: raw.note,
    sortOrder: raw.sort_order,
    risk: computePartLineRisk({
      status,
      requiredDate: raw.required_date,
      orderByDate,
      leadTimeDays: raw.lead_time_days,
    }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

const LINE_SELECT = `
  SELECT id, seisan_project_id, part_number, part_name, quantity, source_type,
         supplier_id, lead_time_days, required_date, order_by_date, ordered_at,
         status, sku_id, procurement_lead_time_id, note, sort_order, created_at, updated_at
  FROM project_part_lines
`;

function normalizeUpsert(input: ProjectPartLineUpsertInput, existing?: ProjectPartLine): {
  partNumber: string;
  partName: string;
  quantity: number;
  sourceType: PartSourceType;
  supplierId: number | null;
  leadTimeDays: number;
  requiredDate: string;
  orderByDate: string;
  orderedAt: string | null;
  status: PartLineStatus;
  skuId: number | null;
  procurementLeadTimeId: number | null;
  note: string | null;
  sortOrder: number;
} {
  const partNumber = (input.partNumber ?? "").trim();
  const partName = (input.partName ?? "").trim();
  const requiredDate = (input.requiredDate ?? "").trim();
  if (!partNumber) throw new Error("品番は必須です。");
  if (!partName) throw new Error("部品名称は必須です。");
  if (!requiredDate) throw new Error("必要着日は必須です。");
  if (!isPartSourceType(input.sourceType)) throw new Error("調達区分が不正です。");

  const supplierId = input.supplierId ?? null;
  if (input.sourceType === "purchase" && supplierId == null) {
    throw new Error("購入区分では商社を選択してください。");
  }

  let leadTimeDays = input.leadTimeDays;
  let procurementLeadTimeId: number | null = existing?.procurementLeadTimeId ?? null;

  if (leadTimeDays == null || leadTimeDays === undefined) {
    const resolved = pickBestLeadTime(loadLeadTimeMasterRows(), {
      sourceType: input.sourceType,
      supplierId,
      skuId: input.skuId ?? null,
      partNumber,
    });
    leadTimeDays = resolved.leadTimeDays;
    procurementLeadTimeId = resolved.procurementLeadTimeId;
  } else {
    leadTimeDays = Math.max(0, Math.floor(Number(leadTimeDays)));
  }

  const status =
    input.status && isPartLineStatus(input.status)
      ? input.status
      : (existing?.status ?? "planned");

  const orderByDate = computeOrderByDate(requiredDate, leadTimeDays);

  return {
    partNumber,
    partName,
    quantity: Math.max(0, Number(input.quantity ?? 1)),
    sourceType: input.sourceType,
    supplierId,
    leadTimeDays,
    requiredDate,
    orderByDate,
    orderedAt: input.orderedAt ?? existing?.orderedAt ?? null,
    status,
    skuId: input.skuId ?? null,
    procurementLeadTimeId,
    note: input.note?.toString().trim() || null,
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
  };
}

export function listByProject(seisanProjectId: string): ProjectPartLine[] {
  const id = (seisanProjectId ?? "").trim();
  if (!id) throw new Error("案件 ID が必要です。");
  const rows = getPartsTrackerDb()
    .prepare(`${LINE_SELECT} WHERE seisan_project_id = ? ORDER BY sort_order ASC, id ASC`)
    .all(id) as DbLineRow[];
  return rows.map(mapLine);
}

export function findById(id: number): ProjectPartLine | null {
  const row = getPartsTrackerDb()
    .prepare(`${LINE_SELECT} WHERE id = ?`)
    .get(id) as DbLineRow | undefined;
  return row ? mapLine(row) : null;
}

export function create(input: ProjectPartLineUpsertInput): ProjectPartLine {
  const projectId = (input.seisanProjectId ?? "").trim();
  if (!projectId) throw new Error("案件 ID が必要です。");
  const n = normalizeUpsert(input);
  const info = getPartsTrackerDb()
    .prepare(
      `INSERT INTO project_part_lines (
        seisan_project_id, part_number, part_name, quantity, source_type, supplier_id,
        lead_time_days, required_date, order_by_date, ordered_at, status, sku_id,
        procurement_lead_time_id, note, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      projectId,
      n.partNumber,
      n.partName,
      n.quantity,
      n.sourceType,
      n.supplierId,
      n.leadTimeDays,
      n.requiredDate,
      n.orderByDate,
      n.orderedAt,
      n.status,
      n.skuId,
      n.procurementLeadTimeId,
      n.note,
      n.sortOrder
    );
  const row = findById(Number(info.lastInsertRowid));
  if (!row) throw new Error("作成後の取得に失敗しました。");
  return row;
}

export function update(id: number, input: Partial<ProjectPartLineUpsertInput>): ProjectPartLine {
  const existing = findById(id);
  if (!existing) throw new Error("部品行が見つかりません。");
  const merged: ProjectPartLineUpsertInput = {
    seisanProjectId: existing.seisanProjectId,
    partNumber: input.partNumber ?? existing.partNumber,
    partName: input.partName ?? existing.partName,
    quantity: input.quantity ?? existing.quantity,
    sourceType: input.sourceType ?? existing.sourceType,
    supplierId: input.supplierId !== undefined ? input.supplierId : existing.supplierId,
    leadTimeDays: input.leadTimeDays ?? existing.leadTimeDays,
    requiredDate: input.requiredDate ?? existing.requiredDate,
    orderedAt: input.orderedAt !== undefined ? input.orderedAt : existing.orderedAt,
    status: input.status ?? existing.status,
    skuId: input.skuId !== undefined ? input.skuId : existing.skuId,
    note: input.note !== undefined ? input.note : existing.note,
    sortOrder: input.sortOrder ?? existing.sortOrder,
  };
  const n = normalizeUpsert(merged, existing);
  getPartsTrackerDb()
    .prepare(
      `UPDATE project_part_lines SET
        part_number = ?, part_name = ?, quantity = ?, source_type = ?, supplier_id = ?,
        lead_time_days = ?, required_date = ?, order_by_date = ?, ordered_at = ?, status = ?,
        sku_id = ?, procurement_lead_time_id = ?, note = ?, sort_order = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      n.partNumber,
      n.partName,
      n.quantity,
      n.sourceType,
      n.supplierId,
      n.leadTimeDays,
      n.requiredDate,
      n.orderByDate,
      n.orderedAt,
      n.status,
      n.skuId,
      n.procurementLeadTimeId,
      n.note,
      n.sortOrder,
      id
    );
  const row = findById(id);
  if (!row) throw new Error("更新後の取得に失敗しました。");
  return row;
}

export function remove(id: number): void {
  const info = getPartsTrackerDb().prepare(`DELETE FROM project_part_lines WHERE id = ?`).run(id);
  if (info.changes === 0) throw new Error("部品行が見つかりません。");
}

export function summarizeProject(seisanProjectId: string): ProjectPartSummary {
  const lines = listByProject(seisanProjectId);
  let delayedCount = 0;
  let needOrderCount = 0;
  let plannedCount = 0;
  for (const line of lines) {
    if (line.risk === "delayed") delayedCount++;
    if (line.risk === "need_order") needOrderCount++;
    if (line.status === "planned") plannedCount++;
  }
  return {
    seisanProjectId,
    totalLines: lines.length,
    delayedCount,
    needOrderCount,
    plannedCount,
  };
}

export function suggestLeadTime(input: {
  sourceType: PartSourceType;
  supplierId?: number | null;
  skuId?: number | null;
  partNumber?: string | null;
}): { leadTimeDays: number; procurementLeadTimeId: number | null } {
  return pickBestLeadTime(loadLeadTimeMasterRows(), input);
}

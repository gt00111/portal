import type {
  ProcurementLeadTimeRow,
  ProcurementLeadTimeUpsertInput,
  ResolveLeadTimeInput,
  ResolvedLeadTime,
} from "@shared/procurementLeadTime.js";
import { pickBestLeadTime } from "@shared/procurementLeadTime.js";
import { isPartSourceType } from "@shared/partsTracker.js";

import { getDb } from "@main/db/connection.js";

interface RawRow {
  id: number;
  source_type: string;
  supplier_id: number | null;
  sku_id: number | null;
  part_number: string | null;
  lead_time_days: number;
  note: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
  supplier_name: string | null;
}

function mapRow(raw: RawRow): ProcurementLeadTimeRow {
  return {
    id: raw.id,
    sourceType: raw.source_type as ProcurementLeadTimeRow["sourceType"],
    supplierId: raw.supplier_id,
    supplierName: raw.supplier_name,
    skuId: raw.sku_id,
    partNumber: raw.part_number,
    leadTimeDays: raw.lead_time_days,
    note: raw.note,
    isActive: raw.isActive === 1,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

const SELECT_SQL = `
  SELECT
    lt.id,
    lt.source_type,
    lt.supplier_id,
    lt.sku_id,
    lt.part_number,
    lt.lead_time_days,
    lt.note,
    lt.isActive,
    lt.createdAt,
    lt.updatedAt,
    s.name AS supplier_name
  FROM m_procurement_lead_times lt
  LEFT JOIN m_suppliers s ON s.id = lt.supplier_id
`;

export function listAll(): ProcurementLeadTimeRow[] {
  const rows = getDb()
    .prepare(
      `${SELECT_SQL} ORDER BY lt.source_type, s.name COLLATE NOCASE, lt.part_number COLLATE NOCASE`
    )
    .all() as RawRow[];
  return rows.map(mapRow);
}

export function findById(id: number): ProcurementLeadTimeRow | null {
  const row = getDb()
    .prepare(`${SELECT_SQL} WHERE lt.id = ?`)
    .get(id) as RawRow | undefined;
  return row ? mapRow(row) : null;
}

function normalizeInput(input: ProcurementLeadTimeUpsertInput): {
  sourceType: string;
  supplierId: number | null;
  skuId: number | null;
  partNumber: string | null;
  leadTimeDays: number;
  note: string | null;
  isActive: number;
} {
  if (!isPartSourceType(input.sourceType)) {
    throw new Error("調達区分が不正です。");
  }
  const leadTimeDays = Math.max(0, Math.floor(Number(input.leadTimeDays) || 0));
  const partNumber = (input.partNumber ?? "").toString().trim() || null;
  const supplierId = input.supplierId ?? null;
  if (input.sourceType === "purchase" && supplierId == null) {
    throw new Error("購入区分では商社の選択が必要です。");
  }
  return {
    sourceType: input.sourceType,
    supplierId,
    skuId: input.skuId ?? null,
    partNumber,
    leadTimeDays,
    note: input.note?.toString().trim() || null,
    isActive: input.isActive === false ? 0 : 1,
  };
}

export function insert(input: ProcurementLeadTimeUpsertInput): ProcurementLeadTimeRow {
  const n = normalizeInput(input);
  const info = getDb()
    .prepare(
      `INSERT INTO m_procurement_lead_times
        (source_type, supplier_id, sku_id, part_number, lead_time_days, note, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      n.sourceType,
      n.supplierId,
      n.skuId,
      n.partNumber,
      n.leadTimeDays,
      n.note,
      n.isActive
    );
  const created = findById(Number(info.lastInsertRowid));
  if (!created) throw new Error("作成後の取得に失敗しました。");
  return created;
}

export function update(id: number, input: ProcurementLeadTimeUpsertInput): ProcurementLeadTimeRow {
  if (!findById(id)) throw new Error("標準リードタイムが見つかりません。");
  const n = normalizeInput(input);
  getDb()
    .prepare(
      `UPDATE m_procurement_lead_times SET
        source_type = ?, supplier_id = ?, sku_id = ?, part_number = ?,
        lead_time_days = ?, note = ?, isActive = ?, updatedAt = datetime('now')
       WHERE id = ?`
    )
    .run(
      n.sourceType,
      n.supplierId,
      n.skuId,
      n.partNumber,
      n.leadTimeDays,
      n.note,
      n.isActive,
      id
    );
  const row = findById(id);
  if (!row) throw new Error("更新後の取得に失敗しました。");
  return row;
}

export function remove(id: number): void {
  const info = getDb().prepare(`DELETE FROM m_procurement_lead_times WHERE id = ?`).run(id);
  if (info.changes === 0) throw new Error("標準リードタイムが見つかりません。");
}

export function resolveLeadTime(input: ResolveLeadTimeInput): ResolvedLeadTime {
  return pickBestLeadTime(listAll(), input);
}

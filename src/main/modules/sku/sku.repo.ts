import type { SkuRow, SkuUpsertInput } from "@shared/sku.js";

import { getDb } from "@main/db/connection.js";

interface RawRow {
  id: number;
  customerId: number | null;
  modelId: number | null;
  partNumberId: number | null;
  componentNameId: number | null;
  drawingNumber: string | null;
  revision: string | null;
  note: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
  customerCode: string | null;
  customerName: string | null;
  modelCode: string | null;
  modelName: string | null;
  partNumberCode: string | null;
  partNumberName: string | null;
  componentNameCode: string | null;
  componentNameName: string | null;
}

const SELECT_JOIN = `
  SELECT s.id, s.customerId, s.modelId, s.partNumberId, s.componentNameId,
         s.drawingNumber, s.revision, s.note, s.isActive, s.createdAt, s.updatedAt,
         c.code  AS customerCode,       c.name  AS customerName,
         m.code  AS modelCode,          m.name  AS modelName,
         p.code  AS partNumberCode,     p.name  AS partNumberName,
         cn.code AS componentNameCode,  cn.name AS componentNameName
    FROM m_skus s
    LEFT JOIN m_customers       c  ON c.id  = s.customerId
    LEFT JOIN m_models          m  ON m.id  = s.modelId
    LEFT JOIN m_part_numbers    p  ON p.id  = s.partNumberId
    LEFT JOIN m_component_names cn ON cn.id = s.componentNameId
`;

function toRow(raw: RawRow): SkuRow {
  return {
    id: raw.id,
    customerId: raw.customerId,
    modelId: raw.modelId,
    partNumberId: raw.partNumberId,
    componentNameId: raw.componentNameId,
    drawingNumber: raw.drawingNumber,
    revision: raw.revision,
    note: raw.note,
    isActive: raw.isActive === 1,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    customerCode: raw.customerCode,
    customerName: raw.customerName,
    modelCode: raw.modelCode,
    modelName: raw.modelName,
    partNumberCode: raw.partNumberCode,
    partNumberName: raw.partNumberName,
    componentNameCode: raw.componentNameCode,
    componentNameName: raw.componentNameName,
  };
}

function normalize(input: SkuUpsertInput): SkuUpsertInput {
  return {
    customerId: input.customerId ?? null,
    modelId: input.modelId ?? null,
    partNumberId: input.partNumberId ?? null,
    componentNameId: input.componentNameId ?? null,
    drawingNumber: emptyToNull(input.drawingNumber),
    revision: emptyToNull(input.revision),
    note: emptyToNull(input.note ?? null),
    isActive: input.isActive !== false,
  };
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.toString().trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function listAll(): SkuRow[] {
  const rows = getDb()
    .prepare(`${SELECT_JOIN} ORDER BY s.id DESC`)
    .all() as RawRow[];
  return rows.map(toRow);
}

export function findById(id: number): SkuRow | null {
  const row = getDb()
    .prepare(`${SELECT_JOIN} WHERE s.id = ?`)
    .get(id) as RawRow | undefined;
  return row ? toRow(row) : null;
}

export function insert(input: SkuUpsertInput): SkuRow {
  const n = normalize(input);
  const info = getDb()
    .prepare(
      `INSERT INTO m_skus
         (customerId, modelId, partNumberId, componentNameId,
          drawingNumber, revision, note, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      n.customerId,
      n.modelId,
      n.partNumberId,
      n.componentNameId,
      n.drawingNumber,
      n.revision,
      n.note ?? null,
      n.isActive === false ? 0 : 1
    );
  const created = findById(Number(info.lastInsertRowid));
  if (!created) throw new Error("作成後の取得に失敗しました。");
  return created;
}

export function update(id: number, input: SkuUpsertInput): SkuRow {
  const n = normalize(input);
  getDb()
    .prepare(
      `UPDATE m_skus
          SET customerId = ?, modelId = ?, partNumberId = ?, componentNameId = ?,
              drawingNumber = ?, revision = ?, note = ?, isActive = ?,
              updatedAt = datetime('now')
        WHERE id = ?`
    )
    .run(
      n.customerId,
      n.modelId,
      n.partNumberId,
      n.componentNameId,
      n.drawingNumber,
      n.revision,
      n.note ?? null,
      n.isActive === false ? 0 : 1,
      id
    );
  const found = findById(id);
  if (!found) throw new Error("更新後の取得に失敗しました。");
  return found;
}

export function remove(id: number): void {
  getDb().prepare(`DELETE FROM m_skus WHERE id = ?`).run(id);
}

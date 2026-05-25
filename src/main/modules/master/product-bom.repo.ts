/** 製品マスタ + 製品 BOM の repository（5-A-1 / 5-E 統合・親番テンプレ兼用） */

import type { PartSourceType } from "@shared/partsTracker.js";
import { isPartSourceType } from "@shared/partsTracker.js";
import type {
  BomLineKind,
  ProductBomLineRow,
  ProductBomLineUpsertInput,
  ProductBomRow,
  ProductBomStatus,
  ProductBomUpsertInput,
  ProductRow,
  ProductUpsertInput,
} from "@shared/productBom.js";
import { BOM_LINE_KINDS, PRODUCT_BOM_STATUSES } from "@shared/productBom.js";

import { getDb } from "@main/db/connection.js";

interface RawProductRow {
  id: number;
  part_number: string;
  name: string;
  sku_id: number | null;
  default_supplier_id: number | null;
  default_supplier_name: string | null;
  note: string | null;
  isActive: number;
  bom_count: number;
  latest_revision: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapProduct(r: RawProductRow): ProductRow {
  return {
    id: r.id,
    partNumber: r.part_number,
    name: r.name,
    skuId: r.sku_id,
    defaultSupplierId: r.default_supplier_id,
    defaultSupplierName: r.default_supplier_name,
    note: r.note,
    isActive: r.isActive === 1,
    bomCount: r.bom_count ?? 0,
    latestRevision: r.latest_revision,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const PRODUCT_SELECT = `
  SELECT
    p.id,
    p.part_number,
    p.name,
    p.sku_id,
    p.default_supplier_id,
    s.name AS default_supplier_name,
    p.note,
    p.isActive,
    p.createdAt,
    p.updatedAt,
    (SELECT COUNT(*) FROM m_product_boms b WHERE b.product_id = p.id) AS bom_count,
    (SELECT b.revision FROM m_product_boms b
       WHERE b.product_id = p.id
       ORDER BY (CASE WHEN b.status = 'released' THEN 0 ELSE 1 END), b.updatedAt DESC
       LIMIT 1) AS latest_revision
  FROM m_products p
  LEFT JOIN m_suppliers s ON s.id = p.default_supplier_id
`;

export function listProducts(): ProductRow[] {
  const rows = getDb()
    .prepare(`${PRODUCT_SELECT} ORDER BY p.part_number COLLATE NOCASE`)
    .all() as RawProductRow[];
  return rows.map(mapProduct);
}

export function findProduct(id: number): ProductRow | null {
  const row = getDb()
    .prepare(`${PRODUCT_SELECT} WHERE p.id = ?`)
    .get(id) as RawProductRow | undefined;
  return row ? mapProduct(row) : null;
}

function normalizeProduct(input: ProductUpsertInput): {
  partNumber: string;
  name: string;
  skuId: number | null;
  defaultSupplierId: number | null;
  note: string | null;
  isActive: number;
} {
  const partNumber = (input.partNumber ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!partNumber) throw new Error("親番（品番）は必須です。");
  if (!name) throw new Error("製品名称は必須です。");
  return {
    partNumber,
    name,
    skuId: input.skuId ?? null,
    defaultSupplierId: input.defaultSupplierId ?? null,
    note: input.note?.toString().trim() || null,
    isActive: input.isActive === false ? 0 : 1,
  };
}

export function insertProduct(input: ProductUpsertInput): ProductRow {
  const n = normalizeProduct(input);
  const info = getDb()
    .prepare(
      `INSERT INTO m_products
        (part_number, name, sku_id, default_supplier_id, note, isActive)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(n.partNumber, n.name, n.skuId, n.defaultSupplierId, n.note, n.isActive);
  const created = findProduct(Number(info.lastInsertRowid));
  if (!created) throw new Error("製品の作成後取得に失敗しました。");
  return created;
}

export function updateProduct(id: number, input: ProductUpsertInput): ProductRow {
  if (!findProduct(id)) throw new Error("製品が見つかりません。");
  const n = normalizeProduct(input);
  getDb()
    .prepare(
      `UPDATE m_products SET
        part_number = ?, name = ?, sku_id = ?, default_supplier_id = ?,
        note = ?, isActive = ?, updatedAt = datetime('now')
       WHERE id = ?`
    )
    .run(n.partNumber, n.name, n.skuId, n.defaultSupplierId, n.note, n.isActive, id);
  const row = findProduct(id);
  if (!row) throw new Error("更新後の取得に失敗しました。");
  return row;
}

export function removeProduct(id: number): void {
  const info = getDb().prepare(`DELETE FROM m_products WHERE id = ?`).run(id);
  if (info.changes === 0) throw new Error("製品が見つかりません。");
}

// -------- BOM ヘッダ --------

interface RawBomRow {
  id: number;
  product_id: number;
  product_part_number: string;
  product_name: string;
  revision: string;
  status: string;
  released_at: string | null;
  released_by_username: string | null;
  note: string | null;
  line_count: number;
  createdAt: string;
  updatedAt: string;
}

function mapBom(r: RawBomRow): ProductBomRow {
  return {
    id: r.id,
    productId: r.product_id,
    productPartNumber: r.product_part_number,
    productName: r.product_name,
    revision: r.revision,
    status: r.status as ProductBomStatus,
    releasedAt: r.released_at,
    releasedByUsername: r.released_by_username,
    note: r.note,
    lineCount: r.line_count ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const BOM_SELECT = `
  SELECT
    b.id,
    b.product_id,
    p.part_number AS product_part_number,
    p.name AS product_name,
    b.revision,
    b.status,
    b.released_at,
    b.released_by_username,
    b.note,
    b.createdAt,
    b.updatedAt,
    (SELECT COUNT(*) FROM m_product_bom_lines bl WHERE bl.product_bom_id = b.id) AS line_count
  FROM m_product_boms b
  INNER JOIN m_products p ON p.id = b.product_id
`;

export function listBomsByProduct(productId: number): ProductBomRow[] {
  const rows = getDb()
    .prepare(`${BOM_SELECT} WHERE b.product_id = ? ORDER BY b.revision DESC`)
    .all(productId) as RawBomRow[];
  return rows.map(mapBom);
}

export function findBom(id: number): ProductBomRow | null {
  const row = getDb()
    .prepare(`${BOM_SELECT} WHERE b.id = ?`)
    .get(id) as RawBomRow | undefined;
  return row ? mapBom(row) : null;
}

function isStatus(value: unknown): value is ProductBomStatus {
  return (
    typeof value === "string" && (PRODUCT_BOM_STATUSES as readonly string[]).includes(value)
  );
}

export function insertBom(input: ProductBomUpsertInput): ProductBomRow {
  const productId = Number(input?.productId);
  const revision = (input?.revision ?? "").toString().trim();
  if (!Number.isFinite(productId) || productId <= 0) throw new Error("製品 ID が不正です。");
  if (!revision) throw new Error("Rev は必須です。");
  const status: ProductBomStatus = isStatus(input.status) ? input.status : "draft";
  const note = input.note?.toString().trim() || null;
  const info = getDb()
    .prepare(
      `INSERT INTO m_product_boms (product_id, revision, status, note)
       VALUES (?, ?, ?, ?)`
    )
    .run(productId, revision, status, note);
  const created = findBom(Number(info.lastInsertRowid));
  if (!created) throw new Error("Rev の作成後取得に失敗しました。");
  return created;
}

export function updateBom(id: number, input: ProductBomUpsertInput): ProductBomRow {
  const existing = findBom(id);
  if (!existing) throw new Error("Rev が見つかりません。");
  const revision = (input.revision ?? existing.revision).toString().trim();
  if (!revision) throw new Error("Rev は必須です。");
  const status: ProductBomStatus = isStatus(input.status) ? input.status : existing.status;
  const note = input.note?.toString().trim() || null;
  getDb()
    .prepare(
      `UPDATE m_product_boms SET
        revision = ?, status = ?, note = ?, updatedAt = datetime('now')
       WHERE id = ?`
    )
    .run(revision, status, note, id);
  const row = findBom(id);
  if (!row) throw new Error("更新後の取得に失敗しました。");
  return row;
}

export function releaseBom(id: number, username: string | null): ProductBomRow {
  const existing = findBom(id);
  if (!existing) throw new Error("Rev が見つかりません。");
  getDb()
    .prepare(
      `UPDATE m_product_boms SET
        status = 'released',
        released_at = datetime('now'),
        released_by_username = ?,
        updatedAt = datetime('now')
       WHERE id = ?`
    )
    .run(username, id);
  const row = findBom(id);
  if (!row) throw new Error("Released 化後の取得に失敗しました。");
  return row;
}

export function removeBom(id: number): void {
  const info = getDb().prepare(`DELETE FROM m_product_boms WHERE id = ?`).run(id);
  if (info.changes === 0) throw new Error("Rev が見つかりません。");
}

/** Rev を別 Rev としてコピー（行も複製）。新規 status は draft。 */
export function cloneBom(sourceId: number, newRevision: string): ProductBomRow {
  const source = findBom(sourceId);
  if (!source) throw new Error("コピー元 Rev が見つかりません。");
  const rev = newRevision.trim();
  if (!rev) throw new Error("新 Rev を指定してください。");
  const created = insertBom({ productId: source.productId, revision: rev, note: source.note });
  const lines = listBomLinesByBom(sourceId);
  for (const l of lines) {
    insertBomLine({
      productBomId: created.id,
      lineKind: l.lineKind,
      partNumber: l.partNumber,
      partName: l.partName,
      quantity: l.quantity,
      sourceType: l.sourceType,
      supplierId: l.supplierId,
      skuId: l.skuId,
      refProductBomId: l.refProductBomId,
      refPartNumber: l.refPartNumber,
      sortOrder: l.sortOrder,
      note: l.note,
    });
  }
  return created;
}

// -------- BOM 構成行 --------

interface RawLineRow {
  id: number;
  product_bom_id: number;
  line_kind: string;
  part_number: string;
  part_name: string;
  quantity: number;
  source_type: string;
  supplier_id: number | null;
  supplier_name: string | null;
  sku_id: number | null;
  ref_product_bom_id: number | null;
  ref_part_number: string | null;
  ref_product_part_number: string | null;
  ref_product_revision: string | null;
  sort_order: number;
  note: string | null;
}

function mapLine(r: RawLineRow): ProductBomLineRow {
  const ref =
    r.line_kind === "sub_assembly"
      ? r.ref_product_part_number != null
        ? `${r.ref_product_part_number} Rev ${r.ref_product_revision ?? ""}`.trim()
        : r.ref_part_number ?? null
      : null;
  return {
    id: r.id,
    productBomId: r.product_bom_id,
    lineKind: r.line_kind as BomLineKind,
    partNumber: r.part_number,
    partName: r.part_name,
    quantity: r.quantity,
    sourceType: r.source_type as PartSourceType,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    skuId: r.sku_id,
    refProductBomId: r.ref_product_bom_id,
    refPartNumber: r.ref_part_number,
    refSummary: ref,
    sortOrder: r.sort_order,
    note: r.note,
  };
}

const LINE_SELECT = `
  SELECT
    bl.id,
    bl.product_bom_id,
    bl.line_kind,
    bl.part_number,
    bl.part_name,
    bl.quantity,
    bl.source_type,
    bl.supplier_id,
    s.name AS supplier_name,
    bl.sku_id,
    bl.ref_product_bom_id,
    bl.ref_part_number,
    rp.part_number AS ref_product_part_number,
    rb.revision AS ref_product_revision,
    bl.sort_order,
    bl.note
  FROM m_product_bom_lines bl
  LEFT JOIN m_suppliers s ON s.id = bl.supplier_id
  LEFT JOIN m_product_boms rb ON rb.id = bl.ref_product_bom_id
  LEFT JOIN m_products rp ON rp.id = rb.product_id
`;

export function listBomLinesByBom(productBomId: number): ProductBomLineRow[] {
  const rows = getDb()
    .prepare(
      `${LINE_SELECT} WHERE bl.product_bom_id = ? ORDER BY bl.sort_order ASC, bl.id ASC`
    )
    .all(productBomId) as RawLineRow[];
  return rows.map(mapLine);
}

export function findBomLine(id: number): ProductBomLineRow | null {
  const row = getDb()
    .prepare(`${LINE_SELECT} WHERE bl.id = ?`)
    .get(id) as RawLineRow | undefined;
  return row ? mapLine(row) : null;
}

function isBomLineKind(value: unknown): value is BomLineKind {
  return typeof value === "string" && (BOM_LINE_KINDS as readonly string[]).includes(value);
}

function normalizeLine(input: ProductBomLineUpsertInput): {
  productBomId: number;
  lineKind: BomLineKind;
  partNumber: string;
  partName: string;
  quantity: number;
  sourceType: PartSourceType;
  supplierId: number | null;
  skuId: number | null;
  refProductBomId: number | null;
  refPartNumber: string | null;
  sortOrder: number;
  note: string | null;
} {
  const productBomId = Number(input.productBomId);
  if (!Number.isFinite(productBomId) || productBomId <= 0) {
    throw new Error("製品 BOM ID が不正です。");
  }
  if (!isBomLineKind(input.lineKind)) throw new Error("行種別が不正です。");
  if (!isPartSourceType(input.sourceType)) throw new Error("調達区分が不正です。");
  const partNumber = (input.partNumber ?? "").trim();
  const partName = (input.partName ?? "").trim();
  if (!partNumber) throw new Error("品番は必須です。");
  if (!partName) throw new Error("名称は必須です。");
  return {
    productBomId,
    lineKind: input.lineKind,
    partNumber,
    partName,
    quantity: Math.max(0, Number(input.quantity ?? 1)),
    sourceType: input.sourceType,
    supplierId: input.supplierId ?? null,
    skuId: input.skuId ?? null,
    refProductBomId: input.refProductBomId ?? null,
    refPartNumber: input.refPartNumber?.toString().trim() || null,
    sortOrder: input.sortOrder ?? 0,
    note: input.note?.toString().trim() || null,
  };
}

export function insertBomLine(input: ProductBomLineUpsertInput): ProductBomLineRow {
  const n = normalizeLine(input);
  const info = getDb()
    .prepare(
      `INSERT INTO m_product_bom_lines
        (product_bom_id, line_kind, part_number, part_name, quantity, source_type,
         supplier_id, sku_id, ref_product_bom_id, ref_part_number, sort_order, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      n.productBomId,
      n.lineKind,
      n.partNumber,
      n.partName,
      n.quantity,
      n.sourceType,
      n.supplierId,
      n.skuId,
      n.refProductBomId,
      n.refPartNumber,
      n.sortOrder,
      n.note
    );
  const created = findBomLine(Number(info.lastInsertRowid));
  if (!created) throw new Error("行の作成後取得に失敗しました。");
  return created;
}

export function updateBomLine(id: number, input: ProductBomLineUpsertInput): ProductBomLineRow {
  if (!findBomLine(id)) throw new Error("行が見つかりません。");
  const n = normalizeLine(input);
  getDb()
    .prepare(
      `UPDATE m_product_bom_lines SET
        line_kind = ?, part_number = ?, part_name = ?, quantity = ?, source_type = ?,
        supplier_id = ?, sku_id = ?, ref_product_bom_id = ?, ref_part_number = ?,
        sort_order = ?, note = ?, updatedAt = datetime('now')
       WHERE id = ?`
    )
    .run(
      n.lineKind,
      n.partNumber,
      n.partName,
      n.quantity,
      n.sourceType,
      n.supplierId,
      n.skuId,
      n.refProductBomId,
      n.refPartNumber,
      n.sortOrder,
      n.note,
      id
    );
  const row = findBomLine(id);
  if (!row) throw new Error("更新後の取得に失敗しました。");
  return row;
}

export function removeBomLine(id: number): void {
  const info = getDb().prepare(`DELETE FROM m_product_bom_lines WHERE id = ?`).run(id);
  if (info.changes === 0) throw new Error("行が見つかりません。");
}

/** 親番（part_number）に紐づく最新の released Rev を返す。なければ最新更新の Rev。 */
export function findBomForPartNumber(partNumber: string): ProductBomRow | null {
  const pn = partNumber.trim();
  if (!pn) return null;
  const row = getDb()
    .prepare(
      `${BOM_SELECT}
       WHERE p.part_number = ? COLLATE NOCASE
       ORDER BY (CASE WHEN b.status = 'released' THEN 0 ELSE 1 END), b.updatedAt DESC
       LIMIT 1`
    )
    .get(pn) as RawBomRow | undefined;
  return row ? mapBom(row) : null;
}

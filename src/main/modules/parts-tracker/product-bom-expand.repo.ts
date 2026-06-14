/** 製品 BOM の再帰展開（5-A-1 / 5-E 統合・親番テンプレート兼用） */

import type { PartSourceType } from "@shared/partsTracker.js";
import type {
  ExpandDuplicatePolicy,
  ProductBomExpandInput,
  ProductBomExpandPreview,
  ProductBomExpandPreviewItem,
  ProductBomExpandResult,
} from "@shared/productBom.js";
import { computeOrderByDate } from "@shared/partsTracker.js";

import { getDb } from "@main/db/connection.js";
import { getPartsTrackerDb } from "@main/db/partsTrackerConnection.js";

import { listBomLinesByBom, findBom } from "../master/product-bom.repo.js";
import { resolveWeldingStartDate } from "./welding-start-date.repo.js";

const ASSEMBLY_SEP = "/";

interface ExpansionLineRow {
  id: number;
  product_bom_id: number;
  line_kind: string;
  part_number: string;
  part_name: string;
  quantity: number;
  source_type: string;
  supplier_id: number | null;
  sku_id: number | null;
  ref_product_bom_id: number | null;
  ref_part_number: string | null;
  sort_order: number;
}

function findBomByPartNumber(partNumber: string): number | null {
  const row = getDb()
    .prepare(
      `SELECT b.id FROM m_product_boms b
       INNER JOIN m_products p ON p.id = b.product_id
       WHERE p.part_number = ? COLLATE NOCASE
       ORDER BY (CASE WHEN b.status = 'released' THEN 0 ELSE 1 END), b.updatedAt DESC
       LIMIT 1`
    )
    .get(partNumber.trim()) as { id: number } | undefined;
  return row?.id ?? null;
}

function getProductInfo(bomId: number): { partNumber: string; revision: string } {
  const row = getDb()
    .prepare(
      `SELECT p.part_number AS partNumber, b.revision AS revision
       FROM m_product_boms b
       INNER JOIN m_products p ON p.id = b.product_id
       WHERE b.id = ?`
    )
    .get(bomId) as { partNumber: string; revision: string } | undefined;
  if (!row) throw new Error(`製品 BOM #${bomId} が見つかりません。`);
  return row;
}

interface ExpandContext {
  rootBomId: number;
  visited: Set<number>;
  items: ProductBomExpandPreviewItem[];
  missing: Array<{ partNumber: string; sourceProductBomLineId: number; parentAssemblyPath: string }>;
  cycleDetected: boolean;
  cyclePath: string[];
  subAssemblyCount: number;
  maxDepth: number;
}

function expandBomRecursive(
  ctx: ExpandContext,
  bomId: number,
  multiplier: number,
  level: number,
  assemblyPath: string,
  parentPartNumber: string | null,
  bomStack: string[]
): void {
  if (ctx.visited.has(bomId)) {
    ctx.cycleDetected = true;
    ctx.cyclePath = [...bomStack];
    return;
  }
  ctx.visited.add(bomId);
  const productInfo = getProductInfo(bomId);
  const newStack = [...bomStack, `${productInfo.partNumber} Rev ${productInfo.revision}`];
  ctx.maxDepth = Math.max(ctx.maxDepth, level);

  const lines = getDb()
    .prepare(
      `SELECT id, product_bom_id, line_kind, part_number, part_name, quantity,
              source_type, supplier_id, sku_id, ref_product_bom_id, ref_part_number, sort_order
       FROM m_product_bom_lines
       WHERE product_bom_id = ?
       ORDER BY sort_order ASC, id ASC`
    )
    .all(bomId) as ExpansionLineRow[];

  for (const line of lines) {
    const childQty = multiplier * (line.quantity ?? 1);
    if (line.line_kind === "part") {
      ctx.items.push({
        partNumber: line.part_number,
        partName: line.part_name,
        quantity: childQty,
        sourceType: line.source_type as PartSourceType,
        supplierId: line.supplier_id,
        skuId: line.sku_id,
        bomLevel: level,
        assemblyPath:
          assemblyPath.length === 0
            ? line.part_number
            : `${assemblyPath}${ASSEMBLY_SEP}${line.part_number}`,
        parentAssemblyPartNumber: parentPartNumber,
        sourceProductBomLineId: line.id,
        rootProductBomId: ctx.rootBomId,
      });
      continue;
    }
    // sub_assembly
    ctx.subAssemblyCount += 1;
    const childAssemblyPath =
      assemblyPath.length === 0
        ? line.part_number
        : `${assemblyPath}${ASSEMBLY_SEP}${line.part_number}`;
    let childBomId = line.ref_product_bom_id;
    if (childBomId == null) {
      const candidate = line.ref_part_number ?? line.part_number;
      childBomId = findBomByPartNumber(candidate);
    }
    if (childBomId == null) {
      ctx.missing.push({
        partNumber: line.part_number,
        sourceProductBomLineId: line.id,
        parentAssemblyPath: childAssemblyPath,
      });
      continue;
    }
    expandBomRecursive(
      ctx,
      childBomId,
      childQty,
      level + 1,
      childAssemblyPath,
      line.part_number,
      newStack
    );
  }
  ctx.visited.delete(bomId);
}

export function previewExpansion(productBomId: number, multiplier = 1): ProductBomExpandPreview {
  const bom = findBom(productBomId);
  if (!bom) throw new Error("製品 BOM が見つかりません。");
  // 子の存在確認のため軽くプリロード
  void listBomLinesByBom(productBomId);

  const ctx: ExpandContext = {
    rootBomId: productBomId,
    visited: new Set(),
    items: [],
    missing: [],
    cycleDetected: false,
    cyclePath: [],
    subAssemblyCount: 0,
    maxDepth: 0,
  };
  expandBomRecursive(ctx, productBomId, multiplier, 0, "", null, []);

  return {
    rootProductBomId: productBomId,
    productPartNumber: bom.productPartNumber,
    productRevision: bom.revision,
    totalLeafLines: ctx.items.length,
    subAssemblyCount: ctx.subAssemblyCount,
    maxDepth: ctx.maxDepth,
    missingSubAssemblies: ctx.missing,
    cycleDetected: ctx.cycleDetected,
    cyclePath: ctx.cycleDetected ? ctx.cyclePath : undefined,
    items: ctx.items,
  };
}

function existingLineKey(line: {
  part_number: string;
  assembly_path: string | null;
}): string {
  return `${line.part_number.trim().toLowerCase()}|${(line.assembly_path ?? "").toLowerCase()}`;
}

export function commitExpansion(
  input: ProductBomExpandInput,
  username: string | null
): ProductBomExpandResult {
  const seisanProjectId = (input.seisanProjectId ?? "").trim();
  if (!seisanProjectId) throw new Error("案件 ID が必要です。");
  const productBomId = Number(input.productBomId);
  if (!Number.isFinite(productBomId) || productBomId <= 0) {
    throw new Error("製品 BOM ID が不正です。");
  }
  const multiplier = Math.max(1, Number(input.multiplier ?? 1));
  const duplicatePolicy: ExpandDuplicatePolicy = input.duplicatePolicy ?? "skip";

  const preview = previewExpansion(productBomId, multiplier);
  if (preview.cycleDetected) {
    throw new Error(
      `循環参照を検出しました: ${preview.cyclePath?.join(" → ") ?? "(unknown)"}`
    );
  }
  void username; // 操作者は監査ログ側で記録（line には残さない）

  const ptDb = getPartsTrackerDb();
  const centralDb = getDb();

  const existing = ptDb
    .prepare(
      `SELECT id, part_number, assembly_path, quantity
       FROM project_part_lines WHERE seisan_project_id = ?`
    )
    .all(seisanProjectId) as Array<{
    id: number;
    part_number: string;
    assembly_path: string | null;
    quantity: number;
  }>;

  const existingMap = new Map<string, { id: number; quantity: number }>();
  for (const e of existing) {
    existingMap.set(existingLineKey(e), { id: e.id, quantity: e.quantity });
  }

  const insertStmt = ptDb.prepare(
    `INSERT INTO project_part_lines (
      seisan_project_id, part_number, part_name, quantity, source_type, supplier_id,
      lead_time_days, required_date, order_by_date, status, sku_id,
      procurement_lead_time_id, note, sort_order,
      bom_level, assembly_path, parent_assembly_part_number,
      root_product_bom_id, source_product_bom_line_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, NULL, ?, ?, ?, ?, ?, ?)`
  );

  const updateQtyStmt = ptDb.prepare(
    `UPDATE project_part_lines SET quantity = ?, updated_at = datetime('now') WHERE id = ?`
  );
  const updateAllStmt = ptDb.prepare(
    `UPDATE project_part_lines SET
      part_name = ?, quantity = ?, source_type = ?, supplier_id = ?,
      lead_time_days = ?, required_date = ?, order_by_date = ?,
      bom_level = ?, parent_assembly_part_number = ?,
      root_product_bom_id = ?, source_product_bom_line_id = ?,
      updated_at = datetime('now')
     WHERE id = ?`
  );

  const ltSelect = centralDb.prepare(
    `SELECT lt.id, lt.lead_time_days, lt.supplier_id, lt.sku_id, lt.part_number
     FROM m_procurement_lead_times lt
     WHERE lt.source_type = ? AND lt.isActive = 1`
  );

  const baseRequired = input.requiredDate?.trim() || resolveWeldingStartDate(seisanProjectId).date;

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let sortOrder = (existing.length + 1) * 10;

  for (const item of preview.items) {
    const key = `${item.partNumber.trim().toLowerCase()}|${item.assemblyPath.toLowerCase()}`;
    const ltRows = ltSelect.all(item.sourceType) as Array<{
      id: number;
      lead_time_days: number;
      supplier_id: number | null;
      sku_id: number | null;
      part_number: string | null;
    }>;
    // 部品行ごとに LT 提案（簡易: matching 0/score）
    let leadTimeDays = 0;
    let procurementLeadTimeId: number | null = null;
    for (const lt of ltRows) {
      const supplierMatch = lt.supplier_id == null || lt.supplier_id === item.supplierId;
      const skuMatch = lt.sku_id == null || lt.sku_id === item.skuId;
      const partMatch =
        !lt.part_number ||
        lt.part_number.trim().toLowerCase() === item.partNumber.trim().toLowerCase();
      if (supplierMatch && skuMatch && partMatch) {
        if (lt.lead_time_days > leadTimeDays || procurementLeadTimeId == null) {
          leadTimeDays = lt.lead_time_days;
          procurementLeadTimeId = lt.id;
        }
      }
    }
    const orderByDate = computeOrderByDate(baseRequired, leadTimeDays);
    const hit = existingMap.get(key);

    if (hit) {
      if (duplicatePolicy === "skip") {
        skippedCount += 1;
        continue;
      }
      if (duplicatePolicy === "addQuantity") {
        updateQtyStmt.run(hit.quantity + item.quantity, hit.id);
        updatedCount += 1;
        continue;
      }
      // overwrite
      updateAllStmt.run(
        item.partName,
        item.quantity,
        item.sourceType,
        item.supplierId,
        leadTimeDays,
        baseRequired,
        orderByDate,
        item.bomLevel,
        item.parentAssemblyPartNumber,
        item.rootProductBomId,
        item.sourceProductBomLineId,
        hit.id
      );
      updatedCount += 1;
      continue;
    }

    insertStmt.run(
      seisanProjectId,
      item.partNumber,
      item.partName,
      item.quantity,
      item.sourceType,
      item.supplierId,
      leadTimeDays,
      baseRequired,
      orderByDate,
      item.skuId,
      procurementLeadTimeId,
      sortOrder,
      item.bomLevel,
      item.assemblyPath,
      item.parentAssemblyPartNumber,
      item.rootProductBomId,
      item.sourceProductBomLineId
    );
    sortOrder += 10;
    insertedCount += 1;
  }

  return {
    rootProductBomId: productBomId,
    insertedCount,
    updatedCount,
    skippedCount,
    missingSubAssemblies: preview.missingSubAssemblies.length,
  };
}

/** 親番一致する `m_products` ＋ Rev 一覧を返す（既存案件への後付け展開用） */
export function findMatchingProductsByPartNumber(partNumber: string): Array<{
  productId: number;
  productPartNumber: string;
  productName: string;
  productBomId: number;
  revision: string;
  status: string;
  updatedAt: string;
}> {
  const pn = (partNumber ?? "").trim();
  if (!pn) return [];
  return getDb()
    .prepare(
      `SELECT
         p.id AS productId,
         p.part_number AS productPartNumber,
         p.name AS productName,
         b.id AS productBomId,
         b.revision,
         b.status,
         b.updatedAt
       FROM m_products p
       INNER JOIN m_product_boms b ON b.product_id = p.id
       WHERE p.part_number = ? COLLATE NOCASE
       ORDER BY (CASE WHEN b.status = 'released' THEN 0 ELSE 1 END), b.updatedAt DESC`
    )
    .all(pn) as Array<{
    productId: number;
    productPartNumber: string;
    productName: string;
    productBomId: number;
    revision: string;
    status: string;
    updatedAt: string;
  }>;
}

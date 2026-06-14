/** 部材管理 BOM CSV 取込（5-B / §8.5.13.4.1・4.2） */

import type {
  ExistingImportLineSnapshot,
  ImportMergePlanItem,
  ProcurementSnapshot,
} from "@shared/bomImportMerge.js";
import {
  buildImportLineKey,
  estimateImportMerge,
  planImportMerge,
  type CsvImportMergeRow,
} from "@shared/bomImportMerge.js";
import type {
  BomCsvImportBatchRow,
  BomCsvImportCommitInput,
  BomCsvImportCommitResult,
  ImportDuplicatePolicy,
} from "@shared/partsTrackerCsvFormat.js";
import { BOM_CSV_DASH } from "@shared/partsTrackerCsvFormat.js";
import type { PartLineStatus, PartSourceType } from "@shared/partsTracker.js";
import {
  computeOrderByDate,
  isPartSourceType,
  showsProcurementLeadTime,
} from "@shared/partsTracker.js";

import { getDb } from "@main/db/connection.js";
import { getPartsTrackerDb } from "@main/db/partsTrackerConnection.js";

import { resolveWeldingStartDate } from "./welding-start-date.repo.js";

function normalizeRevisionForDb(revision: string | null | undefined): string | null {
  const t = revision?.toString().trim();
  if (!t || t === BOM_CSV_DASH) return BOM_CSV_DASH;
  return t;
}

function suggestLt(
  sourceType: PartSourceType,
  supplierId: number | null,
  partNumber: string
): { leadTimeDays: number; procurementLeadTimeId: number | null } {
  if (!showsProcurementLeadTime(sourceType)) {
    return { leadTimeDays: 0, procurementLeadTimeId: null };
  }

  const rows = getDb()
    .prepare(
      `SELECT id, lead_time_days, supplier_id, sku_id, part_number
       FROM m_procurement_lead_times
       WHERE source_type = ? AND isActive = 1`
    )
    .all(sourceType) as Array<{
    id: number;
    lead_time_days: number;
    supplier_id: number | null;
    sku_id: number | null;
    part_number: string | null;
  }>;
  let best: { leadTimeDays: number; procurementLeadTimeId: number | null } = {
    leadTimeDays: 0,
    procurementLeadTimeId: null,
  };
  let bestScore = -1;
  for (const lt of rows) {
    let score = 0;
    if (lt.supplier_id != null) {
      if (lt.supplier_id !== supplierId) continue;
      score += 4;
    }
    if (lt.part_number && lt.part_number.trim()) {
      if (lt.part_number.trim().toLowerCase() !== partNumber.trim().toLowerCase()) continue;
      score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = { leadTimeDays: lt.lead_time_days, procurementLeadTimeId: lt.id };
    }
  }
  return best;
}

function listBatchById(id: number): BomCsvImportBatchRow | null {
  const row = getPartsTrackerDb()
    .prepare(
      `SELECT id, seisan_project_id, source, file_name, row_count, imported_by_username, created_at
       FROM project_part_import_batches WHERE id = ?`
    )
    .get(id) as
    | {
        id: number;
        seisan_project_id: string;
        source: string;
        file_name: string | null;
        row_count: number;
        imported_by_username: string | null;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    seisanProjectId: row.seisan_project_id,
    source: row.source,
    fileName: row.file_name,
    rowCount: row.row_count,
    importedByUsername: row.imported_by_username,
    createdAt: row.created_at,
  };
}

type DbLineRow = {
  id: number;
  part_number: string;
  part_name: string;
  quantity: number;
  revision: string | null;
  assembly_path: string | null;
  bom_level: number;
  parent_assembly_part_number: string | null;
  sort_order: number;
  note: string | null;
  source_type: string;
  supplier_id: number | null;
  status: string;
  is_arranged: number;
  arranged_at: string | null;
  arranged_by_user_name_id: number | null;
  arranged_by_username: string | null;
  lead_time_days: number;
  required_date: string;
  order_by_date: string | null;
  procurement_lead_time_id: number | null;
  is_hidden: number;
  hidden_at: string | null;
  hidden_by_username: string | null;
  hidden_reason: string | null;
  ordered_at: string | null;
};

function toProcurementSnapshot(row: DbLineRow): ProcurementSnapshot {
  return {
    sourceType: isPartSourceType(row.source_type) ? row.source_type : "unset",
    supplierId: row.supplier_id,
    status: row.status as PartLineStatus,
    isArranged: row.is_arranged,
    arrangedAt: row.arranged_at,
    arrangedByUserNameId: row.arranged_by_user_name_id,
    arrangedByUsername: row.arranged_by_username,
    leadTimeDays: row.lead_time_days,
    requiredDate: row.required_date,
    orderByDate: row.order_by_date,
    procurementLeadTimeId: row.procurement_lead_time_id,
    isHidden: row.is_hidden,
    hiddenAt: row.hidden_at,
    hiddenByUsername: row.hidden_by_username,
    hiddenReason: row.hidden_reason,
    orderedAt: row.ordered_at,
  };
}

function loadExistingSnapshots(seisanProjectId: string): ExistingImportLineSnapshot[] {
  const rows = getPartsTrackerDb()
    .prepare(
      `SELECT id, part_number, part_name, quantity, revision, assembly_path,
              bom_level, parent_assembly_part_number, sort_order, note,
              source_type, supplier_id, status, is_arranged, arranged_at,
              arranged_by_user_name_id, arranged_by_username, lead_time_days,
              required_date, order_by_date, procurement_lead_time_id,
              is_hidden, hidden_at, hidden_by_username, hidden_reason, ordered_at
       FROM project_part_lines
       WHERE seisan_project_id = ?
       ORDER BY sort_order ASC, id ASC`
    )
    .all(seisanProjectId) as DbLineRow[];

  return rows.map((r) => ({
    id: r.id,
    partNumber: r.part_number,
    partName: r.part_name,
    quantity: r.quantity,
    revision: r.revision,
    assemblyPath: r.assembly_path,
    bomLevel: r.bom_level ?? 0,
    parentAssemblyPartNumber: r.parent_assembly_part_number,
    sortOrder: r.sort_order,
    note: r.note,
    procurement: toProcurementSnapshot(r),
  }));
}

function toCsvMergeRows(
  rows: BomCsvImportCommitInput["rows"]
): CsvImportMergeRow[] {
  return rows.map((r, i) => {
    const partNumber = (r.partNumber ?? "").trim();
    const revision = normalizeRevisionForDb(r.revision);
    const assemblyPath = r.assemblyPath?.toString().trim() || partNumber;
    return {
      partNumber,
      partName: (r.partName ?? "").trim() || partNumber,
      quantity: Math.max(0, Number(r.quantity ?? 1)),
      revision,
      assemblyLevel: Math.max(0, Math.floor(Number(r.assemblyLevel ?? 0))),
      parentAssemblyPartNumber: r.parentAssemblyPartNumber?.toString().trim() || null,
      assemblyPath,
      note: r.note?.toString().trim() || null,
      csvSortOrder: r.csvSortOrder ?? i,
    };
  }).filter((r) => r.partNumber.length > 0);
}

export function listImportBatches(seisanProjectId: string): BomCsvImportBatchRow[] {
  const rows = getPartsTrackerDb()
    .prepare(
      `SELECT id, seisan_project_id, source, file_name, row_count, imported_by_username, created_at
       FROM project_part_import_batches
       WHERE seisan_project_id = ?
       ORDER BY created_at DESC, id DESC`
    )
    .all(seisanProjectId) as Array<{
    id: number;
    seisan_project_id: string;
    source: string;
    file_name: string | null;
    row_count: number;
    imported_by_username: string | null;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    seisanProjectId: r.seisan_project_id,
    source: r.source,
    fileName: r.file_name,
    rowCount: r.row_count,
    importedByUsername: r.imported_by_username,
    createdAt: r.created_at,
  }));
}

export function estimateImportMergeForProject(
  seisanProjectId: string,
  csvRows: CsvImportMergeRow[],
  policy: ImportDuplicatePolicy
): ReturnType<typeof estimateImportMerge> {
  const existing = loadExistingSnapshots(seisanProjectId);
  return estimateImportMerge(existing, csvRows, policy);
}

function insertLine(
  ptDb: ReturnType<typeof getPartsTrackerDb>,
  seisanProjectId: string,
  item: ImportMergePlanItem,
  batchId: number,
  requiredDate: string,
  procurement: ProcurementSnapshot | null
): void {
  const sourceType = procurement?.sourceType ?? "unset";
  const supplierId = procurement?.supplierId ?? null;
  const lt = procurement
    ? {
        leadTimeDays: procurement.leadTimeDays,
        procurementLeadTimeId: procurement.procurementLeadTimeId,
      }
    : suggestLt(sourceType, supplierId, item.partNumber);
  const reqDate = procurement?.requiredDate ?? requiredDate;
  const orderByDate =
    procurement?.orderByDate ?? computeOrderByDate(reqDate, lt.leadTimeDays);

  ptDb.prepare(
    `INSERT INTO project_part_lines (
      seisan_project_id, part_number, part_name, revision, quantity, source_type, supplier_id,
      lead_time_days, required_date, order_by_date, status, procurement_lead_time_id,
      note, sort_order, bom_level, assembly_path, parent_assembly_part_number, import_batch_id,
      is_arranged, arranged_at, arranged_by_user_name_id, arranged_by_username,
      is_hidden, hidden_at, hidden_by_username, hidden_reason, ordered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    seisanProjectId,
    item.partNumber,
    item.partName,
    item.revision,
    item.quantity,
    sourceType,
    supplierId,
    lt.leadTimeDays,
    reqDate,
    orderByDate,
    procurement?.status ?? "planned",
    lt.procurementLeadTimeId,
    item.note,
    item.sortOrder,
    item.bomLevel,
    item.assemblyPath,
    item.parentAssemblyPartNumber,
    batchId,
    procurement?.isArranged ?? 0,
    procurement?.arrangedAt ?? null,
    procurement?.arrangedByUserNameId ?? null,
    procurement?.arrangedByUsername ?? null,
    procurement?.isHidden ?? 0,
    procurement?.hiddenAt ?? null,
    procurement?.hiddenByUsername ?? null,
    procurement?.hiddenReason ?? null,
    procurement?.orderedAt ?? null
  );
}

function updateBomFields(
  ptDb: ReturnType<typeof getPartsTrackerDb>,
  item: ImportMergePlanItem,
  batchId: number
): void {
  ptDb.prepare(
    `UPDATE project_part_lines SET
      part_name = ?, quantity = ?, note = ?,
      bom_level = ?, assembly_path = ?, parent_assembly_part_number = ?,
      sort_order = ?, import_batch_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    item.partName,
    item.quantity,
    item.note,
    item.bomLevel,
    item.assemblyPath,
    item.parentAssemblyPartNumber,
    item.sortOrder,
    batchId,
    item.existingId
  );
}

function updateSortOrderOnly(ptDb: ReturnType<typeof getPartsTrackerDb>, item: ImportMergePlanItem): void {
  ptDb.prepare(
    `UPDATE project_part_lines SET sort_order = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(item.sortOrder, item.existingId);
}

export function commitCsvImport(
  input: BomCsvImportCommitInput,
  username: string | null
): BomCsvImportCommitResult {
  const seisanProjectId = (input.seisanProjectId ?? "").trim();
  if (!seisanProjectId) throw new Error("案件 ID が必要です。");
  const duplicatePolicy: ImportDuplicatePolicy = input.duplicatePolicy ?? "updateOnRevision";
  const fileName = input.fileName ?? null;
  const requiredDate = input.requiredDate?.trim() || resolveWeldingStartDate(seisanProjectId).date;

  const csvRows = toCsvMergeRows(input.rows ?? []);
  if (csvRows.length === 0) throw new Error("取込行がありません。");

  const ptDb = getPartsTrackerDb();
  const existingBefore = loadExistingSnapshots(seisanProjectId);
  const procurementByKey = new Map(
    existingBefore.map((row) => [
      buildImportLineKey(row.partNumber, row.revision, row.assemblyPath),
      row.procurement,
    ])
  );

  const plan = planImportMerge(existingBefore, csvRows, duplicatePolicy, procurementByKey);

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let removedCount = 0;

  const run = ptDb.transaction(() => {
    const batchInfo = ptDb
      .prepare(
        `INSERT INTO project_part_import_batches
          (seisan_project_id, source, file_name, row_count, imported_by_username)
         VALUES (?, 'solidworks_bom_csv', ?, ?, ?)`
      )
      .run(seisanProjectId, fileName, csvRows.length, username);
    const batchId = Number(batchInfo.lastInsertRowid);

    if (duplicatePolicy === "replaceAll" && existingBefore.length > 0) {
      const removed = ptDb
        .prepare(`DELETE FROM project_part_lines WHERE seisan_project_id = ?`)
        .run(seisanProjectId);
      removedCount = removed.changes;
    }

    for (const item of plan.items) {
      switch (item.action) {
        case "skip":
          skippedCount += 1;
          break;
        case "insert":
          insertLine(
            ptDb,
            seisanProjectId,
            item,
            batchId,
            requiredDate,
            item.procurementRestore ?? null
          );
          insertedCount += 1;
          break;
        case "update":
          updateBomFields(ptDb, item, batchId);
          updatedCount += 1;
          break;
        case "keep":
          updateSortOrderOnly(ptDb, item);
          updatedCount += 1;
          break;
        default:
          break;
      }
    }

    return batchId;
  });

  const batchId = run();
  const batch = listBatchById(batchId);
  if (!batch) throw new Error("取込バッチ作成に失敗しました。");

  return {
    batch,
    insertedCount,
    updatedCount,
    skippedCount,
    removedCount,
    preservedProcurementCount: plan.preservedProcurementCount,
    orderMergeApplied: plan.orderMergeApplied,
  };
}

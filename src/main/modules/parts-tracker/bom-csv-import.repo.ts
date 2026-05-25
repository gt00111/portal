/** 部材管理 BOM CSV 取込（5-B） */

import type {
  BomCsvImportBatchRow,
  BomCsvImportCommitInput,
  BomCsvImportCommitResult,
  ImportDuplicatePolicy,
} from "@shared/partsTrackerCsvFormat.js";
import type { PartSourceType } from "@shared/partsTracker.js";
import { computeOrderByDate, isPartSourceType } from "@shared/partsTracker.js";

import { getDb } from "@main/db/connection.js";
import { getPartsTrackerDb } from "@main/db/partsTrackerConnection.js";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function suggestLt(
  sourceType: PartSourceType,
  supplierId: number | null,
  partNumber: string
): { leadTimeDays: number; procurementLeadTimeId: number | null } {
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

export function commitCsvImport(
  input: BomCsvImportCommitInput,
  username: string | null
): BomCsvImportCommitResult {
  const seisanProjectId = (input.seisanProjectId ?? "").trim();
  if (!seisanProjectId) throw new Error("案件 ID が必要です。");
  const rows = input.rows ?? [];
  if (rows.length === 0) throw new Error("取込行がありません。");
  const duplicatePolicy: ImportDuplicatePolicy = input.duplicatePolicy ?? "updateOnRevision";
  const fileName = input.fileName ?? null;
  const requiredDate = input.requiredDate ?? todayIso();

  const ptDb = getPartsTrackerDb();
  const batchInfo = ptDb
    .prepare(
      `INSERT INTO project_part_import_batches
        (seisan_project_id, source, file_name, row_count, imported_by_username)
       VALUES (?, 'solidworks_bom_csv', ?, ?, ?)`
    )
    .run(seisanProjectId, fileName, rows.length, username);
  const batchId = Number(batchInfo.lastInsertRowid);

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let removedCount = 0;

  if (duplicatePolicy === "replaceAll") {
    const removed = ptDb
      .prepare(`DELETE FROM project_part_lines WHERE seisan_project_id = ?`)
      .run(seisanProjectId);
    removedCount = removed.changes;
  }

  const existing = ptDb
    .prepare(
      `SELECT id, part_number, revision FROM project_part_lines WHERE seisan_project_id = ?`
    )
    .all(seisanProjectId) as Array<{
    id: number;
    part_number: string;
    revision: string | null;
  }>;
  const keyMap = new Map<string, number>();
  for (const e of existing) {
    keyMap.set(
      `${e.part_number.trim().toLowerCase()}|${(e.revision ?? "").toLowerCase()}`,
      e.id
    );
  }

  const insertStmt = ptDb.prepare(
    `INSERT INTO project_part_lines (
      seisan_project_id, part_number, part_name, revision, quantity, source_type, supplier_id,
      lead_time_days, required_date, order_by_date, status, procurement_lead_time_id,
      note, sort_order, bom_level, parent_assembly_part_number, import_batch_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?)`
  );

  const updateStmt = ptDb.prepare(
    `UPDATE project_part_lines SET
      part_name = ?, quantity = ?, source_type = ?, supplier_id = ?,
      lead_time_days = ?, order_by_date = ?,
      bom_level = ?, parent_assembly_part_number = ?,
      import_batch_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  );

  let sortOrder = (existing.length + 1) * 10;
  for (const r of rows) {
    const partNumber = (r.partNumber ?? "").trim();
    const partName = (r.partName ?? "").trim() || partNumber;
    if (!partNumber) {
      skippedCount += 1;
      continue;
    }
    const sourceType: PartSourceType = isPartSourceType(r.sourceType) ? r.sourceType : "purchase";
    const supplierId = r.supplierId ?? null;
    const quantity = Math.max(0, Number(r.quantity ?? 1));
    const revision = r.revision?.toString().trim() || null;
    const note = r.note?.toString().trim() || null;
    const level = Math.max(0, Math.floor(Number(r.assemblyLevel ?? 0)));
    const parent = r.parentAssemblyPartNumber?.toString().trim() || null;

    const lt = suggestLt(sourceType, supplierId, partNumber);
    const orderByDate = computeOrderByDate(requiredDate, lt.leadTimeDays);

    const key = `${partNumber.toLowerCase()}|${(revision ?? "").toLowerCase()}`;
    const hit = keyMap.get(key);
    if (hit != null && duplicatePolicy !== "replaceAll") {
      if (duplicatePolicy === "appendOnly") {
        skippedCount += 1;
        continue;
      }
      // updateOnRevision: 同一 part+rev は更新
      updateStmt.run(
        partName,
        quantity,
        sourceType,
        supplierId,
        lt.leadTimeDays,
        orderByDate,
        level,
        parent,
        batchId,
        hit
      );
      updatedCount += 1;
      continue;
    }

    insertStmt.run(
      seisanProjectId,
      partNumber,
      partName,
      revision,
      quantity,
      sourceType,
      supplierId,
      lt.leadTimeDays,
      requiredDate,
      orderByDate,
      lt.procurementLeadTimeId,
      note,
      sortOrder,
      level,
      parent,
      batchId
    );
    sortOrder += 10;
    insertedCount += 1;
  }

  const batch = listBatchById(batchId);
  if (!batch) throw new Error("取込バッチ作成に失敗しました。");
  return { batch, insertedCount, updatedCount, skippedCount, removedCount };
}

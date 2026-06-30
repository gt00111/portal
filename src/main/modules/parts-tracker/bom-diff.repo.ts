/** BOM Rev 差分（5-F） */

import type {
  BomDiffCurrentVsPrevInput,
  BomDiffLineInput,
  BomDiffProductRevInput,
  BomDiffProjectInput,
  BomDiffResult,
} from "@shared/bomDiff.js";
import { buildDiffSummaryText, computeBomDiff } from "@shared/bomDiff.js";

import { getDb } from "@main/db/connection.js";
import { getPartsTrackerDb } from "@main/db/partsTrackerConnection.js";
import * as seisanProjects from "@main/seisan/repos/projects.repo.js";

import { previewExpansion } from "./product-bom-expand.repo.js";

function loadProductBomSnapshot(productBomId: number): BomDiffLineInput[] {
  const preview = previewExpansion(productBomId, 1);
  return preview.items.map((it, index) => ({
    partNumber: it.partNumber,
    partName: it.partName,
    quantity: it.quantity,
    revision: null,
    assemblyPath: it.assemblyPath,
    bomLevel: it.bomLevel,
    parentAssemblyPartNumber: it.parentAssemblyPartNumber,
    sortOrder: it.sourceProductBomLineId ?? index * 10,
  }));
}

function bomLabel(productBomId: number): string {
  const row = getDb()
    .prepare(
      `SELECT p.part_number AS pn, b.revision AS rev
       FROM m_product_boms b
       INNER JOIN m_products p ON p.id = b.product_id
       WHERE b.id = ?`
    )
    .get(productBomId) as { pn: string; rev: string } | undefined;
  if (!row) return `#${productBomId}`;
  return `${row.pn} Rev ${row.rev}`;
}

export function diffProductRev(input: BomDiffProductRevInput): BomDiffResult {
  const a = Number(input.productBomIdA);
  const b = Number(input.productBomIdB);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("BOM ID が不正です。");
  const linesA = loadProductBomSnapshot(a);
  const linesB = loadProductBomSnapshot(b);
  const { summary, entries, matchAlgorithm } = computeBomDiff(linesA, linesB);
  const aLabel = bomLabel(a);
  const bLabel = bomLabel(b);
  return {
    scope: "productRev",
    aLabel,
    bLabel,
    summary,
    entries,
    summaryText: buildDiffSummaryText(aLabel, bLabel, summary),
    matchAlgorithm,
  };
}

function loadProjectSnapshot(seisanProjectId: string): BomDiffLineInput[] {
  const rows = getPartsTrackerDb()
    .prepare(
      `SELECT part_number, part_name, quantity, revision, assembly_path,
              bom_level, parent_assembly_part_number, sort_order
       FROM project_part_lines
       WHERE seisan_project_id = ? AND is_hidden = 0
       ORDER BY sort_order ASC, id ASC`
    )
    .all(seisanProjectId) as Array<{
    part_number: string;
    part_name: string;
    quantity: number;
    revision: string | null;
    assembly_path: string | null;
    bom_level: number;
    parent_assembly_part_number: string | null;
    sort_order: number;
  }>;
  return rows.map((r) => ({
    partNumber: r.part_number,
    partName: r.part_name,
    quantity: r.quantity,
    revision: r.revision,
    assemblyPath: r.assembly_path,
    bomLevel: r.bom_level ?? 0,
    parentAssemblyPartNumber: r.parent_assembly_part_number,
    sortOrder: r.sort_order,
  }));
}

function projectLabel(seisanProjectId: string): string {
  const row = seisanProjects.get(seisanProjectId);
  if (!row) return seisanProjectId;
  return [row.project_no, row.project_name].filter(Boolean).join(" · ") || seisanProjectId;
}

export function diffProjects(input: BomDiffProjectInput): BomDiffResult {
  const a = (input.seisanProjectIdA ?? "").trim();
  const b = (input.seisanProjectIdB ?? "").trim();
  if (!a || !b) throw new Error("案件 ID が必要です。");
  const linesA = loadProjectSnapshot(a);
  const linesB = loadProjectSnapshot(b);
  const { summary, entries, matchAlgorithm } = computeBomDiff(linesA, linesB);
  const aLabel = projectLabel(a);
  const bLabel = projectLabel(b);
  return {
    scope: "project",
    aLabel,
    bLabel,
    summary,
    entries,
    summaryText: buildDiffSummaryText(aLabel, bLabel, summary),
    matchAlgorithm,
  };
}

/** 案件の `product_bom_id`（スナップショット）と、その製品の **より新しい Rev** を比較する */
export function diffCurrentVsLatest(input: BomDiffCurrentVsPrevInput): BomDiffResult | null {
  const projectId = (input.seisanProjectId ?? "").trim();
  if (!projectId) throw new Error("案件 ID が必要です。");

  const ptDb = getPartsTrackerDb();
  const row = ptDb
    .prepare(
      `SELECT root_product_bom_id AS bomId, COUNT(*) AS cnt
       FROM project_part_lines
       WHERE seisan_project_id = ? AND root_product_bom_id IS NOT NULL
       GROUP BY root_product_bom_id
       ORDER BY cnt DESC, bomId DESC
       LIMIT 1`
    )
    .get(projectId) as { bomId: number | null; cnt: number } | undefined;
  if (!row || row.bomId == null) return null;
  const currentBomId = row.bomId;

  const latest = getDb()
    .prepare(
      `SELECT b2.id AS id, b2.revision AS revision
       FROM m_product_boms b1
       INNER JOIN m_product_boms b2 ON b2.product_id = b1.product_id
       WHERE b1.id = ?
       ORDER BY (CASE WHEN b2.status = 'released' THEN 0 ELSE 1 END), b2.updatedAt DESC
       LIMIT 1`
    )
    .get(currentBomId) as { id: number; revision: string } | undefined;
  if (!latest || latest.id === currentBomId) return null;

  const linesA = loadProductBomSnapshot(currentBomId);
  const linesB = loadProductBomSnapshot(latest.id);
  const { summary, entries, matchAlgorithm } = computeBomDiff(linesA, linesB);
  const aLabel = bomLabel(currentBomId);
  const bLabel = bomLabel(latest.id);
  return {
    scope: "currentVsPrev",
    aLabel,
    bLabel,
    summary,
    entries,
    summaryText: buildDiffSummaryText(aLabel, bLabel, summary),
    matchAlgorithm,
  };
}

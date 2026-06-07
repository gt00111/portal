/** §8.5.18.4 トレーサビリティ履歴 */

import type { PartsTrackerHistoryEntry } from "@shared/partsTracker.js";

import { getPartsTrackerDb } from "@main/db/partsTrackerConnection.js";
import * as seisanProjects from "@main/seisan/repos/projects.repo.js";

interface LineAggRow {
  seisan_project_id: string;
  total: number;
  visible: number;
  last_updated: string | null;
}

interface ImportAggRow {
  seisan_project_id: string;
  batch_count: number;
  last_import_at: string | null;
  last_file_name: string | null;
  last_row_count: number | null;
}

export function listHistoryIndex(): PartsTrackerHistoryEntry[] {
  const ptDb = getPartsTrackerDb();
  const lineAggs = ptDb
    .prepare(
      `SELECT
        seisan_project_id,
        COUNT(*) AS total,
        SUM(CASE WHEN is_hidden = 0 THEN 1 ELSE 0 END) AS visible,
        MAX(updated_at) AS last_updated
       FROM project_part_lines
       GROUP BY seisan_project_id`
    )
    .all() as LineAggRow[];

  if (lineAggs.length === 0) return [];

  const importAggs = ptDb
    .prepare(
      `SELECT
        seisan_project_id,
        COUNT(*) AS batch_count,
        MAX(created_at) AS last_import_at
       FROM project_part_import_batches
       GROUP BY seisan_project_id`
    )
    .all() as Array<{
    seisan_project_id: string;
    batch_count: number;
    last_import_at: string | null;
  }>;

  const lastBatchByProject = new Map<
    string,
    { fileName: string | null; rowCount: number; createdAt: string }
  >();
  for (const row of lineAggs) {
    const latest = ptDb
      .prepare(
        `SELECT file_name, row_count, created_at
         FROM project_part_import_batches
         WHERE seisan_project_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
      )
      .get(row.seisan_project_id) as
      | { file_name: string | null; row_count: number; created_at: string }
      | undefined;
    if (latest) {
      lastBatchByProject.set(row.seisan_project_id, {
        fileName: latest.file_name,
        rowCount: latest.row_count,
        createdAt: latest.created_at,
      });
    }
  }

  const importMap = new Map<string, ImportAggRow>();
  for (const imp of importAggs) {
    const batch = lastBatchByProject.get(imp.seisan_project_id);
    importMap.set(imp.seisan_project_id, {
      seisan_project_id: imp.seisan_project_id,
      batch_count: imp.batch_count,
      last_import_at: batch?.createdAt ?? imp.last_import_at,
      last_file_name: batch?.fileName ?? null,
      last_row_count: batch?.rowCount ?? null,
    });
  }

  const seisanList = seisanProjects.list({ limit: 500, sort_by: "deadline", sort_order: "desc" });
  const projectMeta = new Map(seisanList.items.map((p) => [p.id, p]));

  const entries: PartsTrackerHistoryEntry[] = [];
  for (const agg of lineAggs) {
    const meta = projectMeta.get(agg.seisan_project_id);
    const imp = importMap.get(agg.seisan_project_id);
    entries.push({
      projectId: agg.seisan_project_id,
      projectNo: meta?.project_no ?? null,
      projectName: meta?.project_name ?? null,
      companyName: meta?.company_name ?? "（不明）",
      deadline: meta?.deadline ?? "—",
      partNumber: meta?.part_number ?? null,
      totalLines: agg.total,
      visibleLines: agg.visible,
      hiddenLines: agg.total - agg.visible,
      lastUpdatedAt: agg.last_updated,
      lastImportAt: imp?.last_import_at ?? null,
      lastImportFileName: imp?.last_file_name ?? null,
      lastImportRowCount: imp?.last_row_count ?? null,
      importBatchCount: imp?.batch_count ?? 0,
    });
  }

  entries.sort((a, b) => {
    const ta = a.lastUpdatedAt ?? a.lastImportAt ?? "";
    const tb = b.lastUpdatedAt ?? b.lastImportAt ?? "";
    return tb.localeCompare(ta);
  });

  return entries;
}

/** BOM CSV 再取込マージ（§8.5.13.4.1 / §8.5.13.4.2） */

import type { BomDiffLineInput } from "./bomDiff.js";
import { buildBomDiffTree, findBestChildMatch, type BomTreeNode } from "./bomDiff.js";
import type { ImportDuplicatePolicy } from "./partsTrackerCsvFormat.js";
import type { PartLineStatus, PartSourceType } from "./partsTracker.js";

export function buildImportLineKey(
  partNumber: string,
  revision: string | null,
  assemblyPath: string | null
): string {
  return `${partNumber.trim().toLowerCase()}|${(revision ?? "").toLowerCase()}|${(assemblyPath ?? "").toLowerCase()}`;
}

export interface ProcurementSnapshot {
  sourceType: PartSourceType;
  supplierId: number | null;
  status: PartLineStatus;
  isArranged: number;
  arrangedAt: string | null;
  arrangedByUserNameId: number | null;
  arrangedByUsername: string | null;
  leadTimeDays: number;
  requiredDate: string;
  orderByDate: string | null;
  procurementLeadTimeId: number | null;
  isHidden: number;
  hiddenAt: string | null;
  hiddenByUsername: string | null;
  hiddenReason: string | null;
  orderedAt: string | null;
}

export interface ExistingImportLineSnapshot {
  id: number;
  partNumber: string;
  partName: string;
  quantity: number;
  revision: string | null;
  assemblyPath: string | null;
  bomLevel: number;
  parentAssemblyPartNumber: string | null;
  sortOrder: number;
  note: string | null;
  procurement: ProcurementSnapshot;
}

export interface CsvImportMergeRow {
  partNumber: string;
  partName: string;
  quantity: number;
  revision: string | null;
  assemblyLevel: number;
  parentAssemblyPartNumber: string | null;
  assemblyPath: string | null;
  note: string | null;
  csvSortOrder: number;
}

export type ImportMergeAction = "update" | "insert" | "keep" | "skip";

export interface ImportMergePlanItem {
  action: ImportMergeAction;
  sortOrder: number;
  lineKey: string;
  existingId?: number;
  partNumber: string;
  partName: string;
  quantity: number;
  revision: string | null;
  bomLevel: number;
  assemblyPath: string | null;
  parentAssemblyPartNumber: string | null;
  note: string | null;
  procurementRestore?: ProcurementSnapshot;
}

export interface ImportMergePlan {
  items: ImportMergePlanItem[];
  preservedProcurementCount: number;
  orderMergeApplied: boolean;
}

interface MergedTreeNode {
  action: ImportMergeAction;
  lineKey: string;
  existing?: ExistingImportLineSnapshot;
  csv?: CsvImportMergeRow;
  children: MergedTreeNode[];
}

function toDiffLineFromExisting(row: ExistingImportLineSnapshot): BomDiffLineInput {
  return {
    partNumber: row.partNumber,
    partName: row.partName,
    quantity: row.quantity,
    revision: row.revision,
    assemblyPath: row.assemblyPath,
    bomLevel: row.bomLevel,
    parentAssemblyPartNumber: row.parentAssemblyPartNumber,
    sortOrder: row.sortOrder,
  };
}

function toDiffLineFromCsv(row: CsvImportMergeRow): BomDiffLineInput {
  return {
    partNumber: row.partNumber,
    partName: row.partName,
    quantity: row.quantity,
    revision: row.revision,
    assemblyPath: row.assemblyPath,
    bomLevel: row.assemblyLevel,
    parentAssemblyPartNumber: row.parentAssemblyPartNumber,
    sortOrder: row.csvSortOrder,
  };
}

function mergeNote(csvNote: string | null | undefined, existingNote: string | null): string | null {
  const csv = csvNote?.toString().trim() || null;
  if (csv) return csv;
  return existingNote;
}

function bomFromCsv(csv: CsvImportMergeRow, lineKey: string): Omit<ImportMergePlanItem, "action" | "sortOrder" | "existingId" | "procurementRestore"> {
  return {
    lineKey,
    partNumber: csv.partNumber.trim(),
    partName: csv.partName.trim() || csv.partNumber.trim(),
    quantity: Math.max(0, Number(csv.quantity ?? 1)),
    revision: csv.revision,
    bomLevel: Math.max(0, Math.floor(Number(csv.assemblyLevel ?? 0))),
    assemblyPath: csv.assemblyPath?.trim() || csv.partNumber.trim(),
    parentAssemblyPartNumber: csv.parentAssemblyPartNumber?.trim() || null,
    note: csv.note?.toString().trim() || null,
  };
}

function bomFromExisting(
  existing: ExistingImportLineSnapshot,
  lineKey: string
): Omit<ImportMergePlanItem, "action" | "sortOrder" | "existingId" | "procurementRestore"> {
  return {
    lineKey,
    partNumber: existing.partNumber,
    partName: existing.partName,
    quantity: existing.quantity,
    revision: existing.revision,
    bomLevel: existing.bomLevel,
    assemblyPath: existing.assemblyPath,
    parentAssemblyPartNumber: existing.parentAssemblyPartNumber,
    note: existing.note,
  };
}

function mergeTreeChildren(
  baseChildren: BomTreeNode[],
  csvChildren: BomTreeNode[],
  existingByKey: Map<string, ExistingImportLineSnapshot>,
  csvByKey: Map<string, CsvImportMergeRow>,
  policy: ImportDuplicatePolicy
): MergedTreeNode[] {
  const matchedCsv = new Set<BomTreeNode>();
  const merged: MergedTreeNode[] = [];

  for (let i = 0; i < baseChildren.length; i++) {
    const baseChild = baseChildren[i]!;
    const csvChild = findBestChildMatch(baseChild, i, csvChildren, matchedCsv);
    const baseKey = buildImportLineKey(
      baseChild.line.partNumber,
      baseChild.line.revision,
      baseChild.line.assemblyPath
    );
    const existing = existingByKey.get(baseKey);

    if (csvChild && existing) {
      matchedCsv.add(csvChild);
      const csvKey = buildImportLineKey(
        csvChild.line.partNumber,
        csvChild.line.revision,
        csvChild.line.assemblyPath
      );
      const csv = csvByKey.get(csvKey);
      const action: ImportMergeAction = policy === "appendOnly" ? "skip" : "update";
      merged.push({
        action,
        lineKey: baseKey,
        existing,
        csv,
        children: mergeTreeChildren(
          baseChild.children,
          csvChild.children,
          existingByKey,
          csvByKey,
          policy
        ),
      });
      continue;
    }

    if (existing && policy !== "replaceAll") {
      merged.push({
        action: "keep",
        lineKey: baseKey,
        existing,
        children: mergeTreeChildren(baseChild.children, [], existingByKey, csvByKey, policy),
      });
    }
  }

  for (const csvChild of csvChildren) {
    if (matchedCsv.has(csvChild)) continue;
    const csvKey = buildImportLineKey(
      csvChild.line.partNumber,
      csvChild.line.revision,
      csvChild.line.assemblyPath
    );
    const csv = csvByKey.get(csvKey);
    if (!csv) continue;
    merged.push({
      action: "insert",
      lineKey: csvKey,
      csv,
      children: mergeTreeChildren([], csvChild.children, existingByKey, csvByKey, policy),
    });
  }

  return merged;
}

function flattenMergedTree(nodes: MergedTreeNode[], out: MergedTreeNode[]): void {
  for (const node of nodes) {
    out.push(node);
    flattenMergedTree(node.children, out);
  }
}

function planFromCsvTreeOnly(
  csvRows: CsvImportMergeRow[],
  procurementByKey: Map<string, ProcurementSnapshot>
): ImportMergePlanItem[] {
  const csvByKey = new Map<string, CsvImportMergeRow>();
  for (const row of csvRows) {
    const path = row.assemblyPath?.trim() || row.partNumber.trim();
    const key = buildImportLineKey(row.partNumber, row.revision, path);
    csvByKey.set(key, row);
  }
  const tree = buildBomDiffTree(csvRows.map(toDiffLineFromCsv));
  const ordered: Array<{ lineKey: string; csv: CsvImportMergeRow }> = [];

  function walkCsv(nodes: BomTreeNode[]): void {
    for (const n of nodes) {
      const k = buildImportLineKey(n.line.partNumber, n.line.revision, n.line.assemblyPath);
      const csv = csvByKey.get(k);
      if (csv) ordered.push({ lineKey: k, csv });
      walkCsv(n.children);
    }
  }
  walkCsv(tree.children);

  return ordered.map((node, idx) => {
    const bom = bomFromCsv(node.csv, node.lineKey);
    return {
      action: "insert" as const,
      sortOrder: (idx + 1) * 10,
      ...bom,
      procurementRestore: procurementByKey.get(node.lineKey),
    };
  });
}

function planFirstImport(csvRows: CsvImportMergeRow[]): ImportMergePlan {
  const sorted = [...csvRows].sort((a, b) => a.csvSortOrder - b.csvSortOrder);
  const items = sorted.map((row, idx) => {
    const path = row.assemblyPath?.trim() || row.partNumber.trim();
    const key = buildImportLineKey(row.partNumber, row.revision, path);
    return {
      action: "insert" as const,
      sortOrder: (idx + 1) * 10,
      ...bomFromCsv(row, key),
    };
  });
  return { items, preservedProcurementCount: 0, orderMergeApplied: false };
}

export function planImportMerge(
  existing: ExistingImportLineSnapshot[],
  csvRows: CsvImportMergeRow[],
  policy: ImportDuplicatePolicy,
  procurementByKey: Map<string, ProcurementSnapshot> = new Map()
): ImportMergePlan {
  if (csvRows.length === 0) {
    return { items: [], preservedProcurementCount: 0, orderMergeApplied: false };
  }

  if (existing.length === 0) {
    return planFirstImport(csvRows);
  }

  if (policy === "replaceAll") {
    const items = planFromCsvTreeOnly(csvRows, procurementByKey);
    const preservedProcurementCount = items.filter((i) => i.procurementRestore != null).length;
    return { items, preservedProcurementCount, orderMergeApplied: true };
  }

  const existingByKey = new Map<string, ExistingImportLineSnapshot>();
  for (const row of existing) {
    const key = buildImportLineKey(row.partNumber, row.revision, row.assemblyPath);
    existingByKey.set(key, row);
  }

  const csvByKey = new Map<string, CsvImportMergeRow>();
  for (const row of csvRows) {
    const path = row.assemblyPath?.trim() || row.partNumber.trim();
    const key = buildImportLineKey(row.partNumber, row.revision, path);
    csvByKey.set(key, row);
  }

  const treeBase = buildBomDiffTree(existing.map(toDiffLineFromExisting));
  const treeCsv = buildBomDiffTree(csvRows.map(toDiffLineFromCsv));
  const mergedRoots = mergeTreeChildren(
    treeBase.children,
    treeCsv.children,
    existingByKey,
    csvByKey,
    policy
  );

  const flat: MergedTreeNode[] = [];
  flattenMergedTree(mergedRoots, flat);

  if (policy === "appendOnly") {
    const maxSort = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0);
    let newIdx = 0;
    const items: ImportMergePlanItem[] = [];
    let preservedProcurementCount = 0;

    for (const node of flat) {
      if (node.action === "insert" && node.csv) {
        newIdx += 1;
        const bom = bomFromCsv(node.csv, node.lineKey);
        items.push({
          action: "insert",
          sortOrder: maxSort + newIdx * 10,
          ...bom,
        });
        continue;
      }
      if (node.existing) {
        if (node.existing.procurement.sourceType !== "unset" || node.existing.procurement.supplierId != null) {
          preservedProcurementCount += 1;
        }
        items.push({
          action: "skip",
          sortOrder: node.existing.sortOrder,
          existingId: node.existing.id,
          ...bomFromExisting(node.existing, node.lineKey),
        });
      }
    }

    return { items, preservedProcurementCount, orderMergeApplied: false };
  }

  // updateOnRevision: baseline DFS renumber
  let preservedProcurementCount = 0;
  const items: ImportMergePlanItem[] = flat.map((node, idx) => {
    const sortOrder = (idx + 1) * 10;
    if (node.action === "insert" && node.csv) {
      return {
        action: "insert" as const,
        sortOrder,
        ...bomFromCsv(node.csv, node.lineKey),
        procurementRestore: procurementByKey.get(node.lineKey),
      };
    }
    if (node.action === "update" && node.existing && node.csv) {
      preservedProcurementCount += 1;
      const bom = bomFromCsv(node.csv, node.lineKey);
      return {
        action: "update" as const,
        sortOrder,
        existingId: node.existing.id,
        ...bom,
        note: mergeNote(node.csv.note, node.existing.note),
      };
    }
    if (node.action === "keep" && node.existing) {
      preservedProcurementCount += 1;
      return {
        action: "keep" as const,
        sortOrder,
        existingId: node.existing.id,
        ...bomFromExisting(node.existing, node.lineKey),
      };
    }
    throw new Error(`未対応のマージノード: ${node.action}`);
  });

  return { items, preservedProcurementCount, orderMergeApplied: true };
}

export function estimateImportMerge(
  existing: ExistingImportLineSnapshot[],
  csvRows: CsvImportMergeRow[],
  policy: ImportDuplicatePolicy
): { preservedProcurementCount: number; orderMergeApplied: boolean; isReimport: boolean } {
  const procurementByKey = new Map(
    existing.map((row) => [
      buildImportLineKey(row.partNumber, row.revision, row.assemblyPath),
      row.procurement,
    ])
  );
  const plan = planImportMerge(existing, csvRows, policy, procurementByKey);
  return {
    preservedProcurementCount: plan.preservedProcurementCount,
    orderMergeApplied: plan.orderMergeApplied,
    isReimport: existing.length > 0,
  };
}

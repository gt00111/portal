/** BOM Rev 差分（5-F・製品 Rev A vs Rev B / 案件 vs 案件 / 案件 vs 前 Rev） */

export type BomDiffChangeKind = "added" | "removed" | "quantityChanged" | "revisionChanged" | "unchanged";

export const BOM_DIFF_CHANGE_LABELS: Record<BomDiffChangeKind, string> = {
  added: "追加",
  removed: "削除",
  quantityChanged: "数量変更",
  revisionChanged: "Rev 上がり",
  unchanged: "変更なし",
};

export interface BomDiffSideSnapshot {
  partNumber: string;
  partName: string;
  quantity: number;
  revision: string | null;
  assemblyPath: string | null;
}

export interface BomDiffEntry {
  kind: BomDiffChangeKind;
  partNumber: string;
  partName: string;
  assemblyPath: string | null;
  /** マッチング キー（part_number + 任意 assembly_path） */
  matchKey: string;
  a: BomDiffSideSnapshot | null;
  b: BomDiffSideSnapshot | null;
}

export interface BomDiffSummary {
  addedCount: number;
  removedCount: number;
  quantityChangedCount: number;
  revisionChangedCount: number;
  unchangedCount: number;
  totalChanges: number;
}

export interface BomDiffResult {
  scope: "productRev" | "project" | "currentVsPrev";
  aLabel: string;
  bLabel: string;
  summary: BomDiffSummary;
  entries: BomDiffEntry[];
  summaryText: string;
}

export interface BomDiffProductRevInput {
  productBomIdA: number;
  productBomIdB: number;
  matchByAssemblyPath?: boolean;
}

export interface BomDiffProjectInput {
  seisanProjectIdA: string;
  seisanProjectIdB: string;
  matchByAssemblyPath?: boolean;
}

export interface BomDiffCurrentVsPrevInput {
  seisanProjectId: string;
}

interface RawLine {
  partNumber: string;
  partName: string;
  quantity: number;
  revision: string | null;
  assemblyPath: string | null;
}

function snapshot(line: RawLine): BomDiffSideSnapshot {
  return {
    partNumber: line.partNumber,
    partName: line.partName,
    quantity: line.quantity,
    revision: line.revision,
    assemblyPath: line.assemblyPath,
  };
}

function matchKeyFor(line: RawLine, matchByAssemblyPath: boolean): string {
  const path = matchByAssemblyPath && line.assemblyPath ? line.assemblyPath : "";
  return `${line.partNumber.trim().toLowerCase()}|${path.toLowerCase()}`;
}

/** マッチング・差分判定の純粋関数（main/repo と renderer/preview の両方から呼べる） */
export function computeBomDiff(
  linesA: RawLine[],
  linesB: RawLine[],
  options: { matchByAssemblyPath?: boolean } = {}
): { summary: BomDiffSummary; entries: BomDiffEntry[] } {
  const matchByAssemblyPath = options.matchByAssemblyPath ?? false;
  const mapA = new Map<string, RawLine>();
  for (const l of linesA) mapA.set(matchKeyFor(l, matchByAssemblyPath), l);
  const mapB = new Map<string, RawLine>();
  for (const l of linesB) mapB.set(matchKeyFor(l, matchByAssemblyPath), l);

  const allKeys = new Set<string>([...mapA.keys(), ...mapB.keys()]);
  const entries: BomDiffEntry[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let quantityChangedCount = 0;
  let revisionChangedCount = 0;
  let unchangedCount = 0;

  for (const key of allKeys) {
    const a = mapA.get(key) ?? null;
    const b = mapB.get(key) ?? null;

    let kind: BomDiffChangeKind = "unchanged";
    if (a && !b) {
      kind = "removed";
      removedCount++;
    } else if (!a && b) {
      kind = "added";
      addedCount++;
    } else if (a && b) {
      const qDiff = a.quantity !== b.quantity;
      const revDiff = (a.revision ?? "") !== (b.revision ?? "");
      if (qDiff && revDiff) {
        kind = "quantityChanged";
        quantityChangedCount++;
      } else if (qDiff) {
        kind = "quantityChanged";
        quantityChangedCount++;
      } else if (revDiff) {
        kind = "revisionChanged";
        revisionChangedCount++;
      } else {
        kind = "unchanged";
        unchangedCount++;
      }
    }

    const sample = b ?? a;
    if (!sample) continue;
    entries.push({
      kind,
      partNumber: sample.partNumber,
      partName: sample.partName,
      assemblyPath: sample.assemblyPath,
      matchKey: key,
      a: a ? snapshot(a) : null,
      b: b ? snapshot(b) : null,
    });
  }

  const order: Record<BomDiffChangeKind, number> = {
    added: 0,
    removed: 1,
    quantityChanged: 2,
    revisionChanged: 3,
    unchanged: 4,
  };
  entries.sort((x, y) => {
    const d = order[x.kind] - order[y.kind];
    if (d !== 0) return d;
    return x.partNumber.localeCompare(y.partNumber);
  });

  const totalChanges = addedCount + removedCount + quantityChangedCount + revisionChangedCount;
  return {
    summary: {
      addedCount,
      removedCount,
      quantityChangedCount,
      revisionChangedCount,
      unchangedCount,
      totalChanges,
    },
    entries,
  };
}

export function buildDiffSummaryText(
  aLabel: string,
  bLabel: string,
  summary: BomDiffSummary
): string {
  return `${aLabel} → ${bLabel}: 追加 ${summary.addedCount} / 削除 ${summary.removedCount} / 数量変更 ${summary.quantityChangedCount} / 部品 Rev 上がり ${summary.revisionChangedCount}`;
}

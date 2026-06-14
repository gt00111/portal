/** BOM Rev 差分（5-F・製品 Rev / 案件間 / 案件 vs 最新 Rev） */

export type BomDiffChangeKind = "added" | "removed" | "quantityChanged" | "revisionChanged" | "unchanged";

export type BomDiffMatchAlgorithm = "tree" | "flat";

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
  /** マッチング キー（品番 + 構造パス） */
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
  /** 既定は tree（基準ツリー DFS・品番優先マッチ） */
  matchAlgorithm: BomDiffMatchAlgorithm;
}

export interface BomDiffLineInput {
  partNumber: string;
  partName: string;
  quantity: number;
  revision: string | null;
  assemblyPath: string | null;
  bomLevel?: number;
  parentAssemblyPartNumber?: string | null;
  sortOrder?: number;
}

export interface BomDiffProductRevInput {
  productBomIdA: number;
  productBomIdB: number;
}

export interface BomDiffProjectInput {
  seisanProjectIdA: string;
  seisanProjectIdB: string;
}

export interface BomDiffCurrentVsPrevInput {
  seisanProjectId: string;
}

interface BomDiffTreeLine extends BomDiffLineInput {
  resolvedPath: string;
}

interface BomTreeNode {
  line: BomDiffTreeLine;
  children: BomTreeNode[];
  path: string;
}

export type { BomTreeNode };

interface TreeDiffState {
  entries: BomDiffEntry[];
  addedCount: number;
  removedCount: number;
  quantityChangedCount: number;
  revisionChangedCount: number;
  unchangedCount: number;
}

function snapshot(line: BomDiffLineInput): BomDiffSideSnapshot {
  return {
    partNumber: line.partNumber,
    partName: line.partName,
    quantity: line.quantity,
    revision: line.revision,
    assemblyPath: line.assemblyPath,
  };
}

function normalizePartNumber(partNumber: string): string {
  return partNumber.trim().toLowerCase();
}

function classifyPair(a: BomDiffLineInput, b: BomDiffLineInput): BomDiffChangeKind {
  const qDiff = a.quantity !== b.quantity;
  const revDiff = (a.revision ?? "") !== (b.revision ?? "");
  if (qDiff) return "quantityChanged";
  if (revDiff) return "revisionChanged";
  return "unchanged";
}

function pushEntry(
  state: TreeDiffState,
  kind: BomDiffChangeKind,
  a: BomDiffLineInput | null,
  b: BomDiffLineInput | null,
  matchKey: string
): void {
  const sample = b ?? a;
  if (!sample) return;
  state.entries.push({
    kind,
    partNumber: sample.partNumber,
    partName: sample.partName,
    assemblyPath: sample.assemblyPath,
    matchKey,
    a: a ? snapshot(a) : null,
    b: b ? snapshot(b) : null,
  });
  switch (kind) {
    case "added":
      state.addedCount += 1;
      break;
    case "removed":
      state.removedCount += 1;
      break;
    case "quantityChanged":
      state.quantityChangedCount += 1;
      break;
    case "revisionChanged":
      state.revisionChangedCount += 1;
      break;
    case "unchanged":
      state.unchangedCount += 1;
      break;
  }
}

function resolveLinePaths(lines: BomDiffLineInput[]): BomDiffTreeLine[] {
  const sorted = [...lines].sort((a, b) => {
    const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (so !== 0) return so;
    return a.partNumber.localeCompare(b.partNumber, "ja");
  });

  const pathByPartNumber = new Map<string, string>();
  const out: BomDiffTreeLine[] = [];

  for (const line of sorted) {
    let path = line.assemblyPath?.trim().replace(/\\/g, "/") ?? "";
    if (!path) {
      const parent = line.parentAssemblyPartNumber?.trim();
      if (parent) {
        const parentPath = pathByPartNumber.get(normalizePartNumber(parent));
        path = parentPath ? `${parentPath}/${line.partNumber.trim()}` : line.partNumber.trim();
      } else if ((line.bomLevel ?? 0) > 0 && pathByPartNumber.size > 0) {
        path = line.partNumber.trim();
      } else {
        path = line.partNumber.trim();
      }
    }
    const resolved: BomDiffTreeLine = { ...line, resolvedPath: path };
    out.push(resolved);
    pathByPartNumber.set(normalizePartNumber(line.partNumber), path);
  }

  return out;
}

function sortTreeChildren(node: { children: BomTreeNode[] }): void {
  node.children.sort((a, b) => {
    const so = (a.line.sortOrder ?? 0) - (b.line.sortOrder ?? 0);
    if (so !== 0) return so;
    return a.line.partNumber.localeCompare(b.line.partNumber, "ja");
  });
  for (const child of node.children) sortTreeChildren(child);
}

/** 基準側（A）の `sort_order` / `assembly_path` から BOM ツリーを構築 */
export function buildBomDiffTree(lines: BomDiffLineInput[]): BomTreeNode {
  const resolved = resolveLinePaths(lines);
  const pathMap = new Map<string, BomDiffTreeLine>();
  for (const line of resolved) {
    pathMap.set(line.resolvedPath, line);
  }

  const root: BomTreeNode = {
    line: {
      partNumber: "__root__",
      partName: "",
      quantity: 0,
      revision: null,
      assemblyPath: null,
      resolvedPath: "",
    },
    children: [],
    path: "",
  };
  const pathToNode = new Map<string, BomTreeNode>();

  const paths = [...pathMap.keys()].sort((a, b) => {
    const depth = a.split("/").length - b.split("/").length;
    if (depth !== 0) return depth;
    return (pathMap.get(a)!.sortOrder ?? 0) - (pathMap.get(b)!.sortOrder ?? 0);
  });

  for (const path of paths) {
    const line = pathMap.get(path)!;
    const node: BomTreeNode = { line, children: [], path };
    pathToNode.set(path, node);

    const slash = path.lastIndexOf("/");
    if (slash === -1) {
      root.children.push(node);
      continue;
    }
    const parentPath = path.slice(0, slash);
    const parent = pathToNode.get(parentPath);
    if (parent) parent.children.push(node);
    else root.children.push(node);
  }

  sortTreeChildren(root);
  return root;
}

export function findBestChildMatch(
  childA: BomTreeNode,
  indexA: number,
  childrenB: BomTreeNode[],
  matchedB: Set<BomTreeNode>
): BomTreeNode | null {
  const pnA = normalizePartNumber(childA.line.partNumber);
  const available = childrenB.filter((c) => !matchedB.has(c));
  const matches = available.filter((c) => normalizePartNumber(c.line.partNumber) === pnA);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;

  let best = matches[0]!;
  let bestScore = Infinity;
  for (const candidate of matches) {
    const indexB = childrenB.indexOf(candidate);
    const score = Math.abs(indexA - indexB);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function emitRemovedSubtree(node: BomTreeNode, state: TreeDiffState): void {
  pushEntry(state, "removed", node.line, null, node.line.resolvedPath);
  for (const child of node.children) emitRemovedSubtree(child, state);
}

function emitAddedSubtree(node: BomTreeNode, state: TreeDiffState): void {
  pushEntry(state, "added", null, node.line, node.line.resolvedPath);
  for (const child of node.children) emitAddedSubtree(child, state);
}

function diffTreeChildren(childrenA: BomTreeNode[], childrenB: BomTreeNode[], state: TreeDiffState): void {
  const matchedB = new Set<BomTreeNode>();

  for (let i = 0; i < childrenA.length; i++) {
    const childA = childrenA[i]!;
    const childB = findBestChildMatch(childA, i, childrenB, matchedB);
    if (childB) {
      matchedB.add(childB);
      const kind = classifyPair(childA.line, childB.line);
      pushEntry(state, kind, childA.line, childB.line, childA.line.resolvedPath);
      diffTreeChildren(childA.children, childB.children, state);
      continue;
    }
    emitRemovedSubtree(childA, state);
  }

  for (const childB of childrenB) {
    if (!matchedB.has(childB)) emitAddedSubtree(childB, state);
  }
}

/** 基準（A）ツリーを DFS し、品番優先で B と突き合わせる */
export function computeTreeBomDiff(
  linesA: BomDiffLineInput[],
  linesB: BomDiffLineInput[]
): { summary: BomDiffSummary; entries: BomDiffEntry[] } {
  const treeA = buildBomDiffTree(linesA);
  const treeB = buildBomDiffTree(linesB);
  const state: TreeDiffState = {
    entries: [],
    addedCount: 0,
    removedCount: 0,
    quantityChangedCount: 0,
    revisionChangedCount: 0,
    unchangedCount: 0,
  };

  diffTreeChildren(treeA.children, treeB.children, state);

  const totalChanges =
    state.addedCount + state.removedCount + state.quantityChangedCount + state.revisionChangedCount;

  return {
    summary: {
      addedCount: state.addedCount,
      removedCount: state.removedCount,
      quantityChangedCount: state.quantityChangedCount,
      revisionChangedCount: state.revisionChangedCount,
      unchangedCount: state.unchangedCount,
      totalChanges,
    },
    entries: state.entries,
  };
}

function matchKeyForFlat(line: BomDiffLineInput, matchByAssemblyPath: boolean): string {
  const path = matchByAssemblyPath && line.assemblyPath ? line.assemblyPath : "";
  return `${line.partNumber.trim().toLowerCase()}|${path.toLowerCase()}`;
}

/** 従来のフラット照合（テスト・後方互換用） */
export function computeFlatBomDiff(
  linesA: BomDiffLineInput[],
  linesB: BomDiffLineInput[],
  options: { matchByAssemblyPath?: boolean } = {}
): { summary: BomDiffSummary; entries: BomDiffEntry[] } {
  const matchByAssemblyPath = options.matchByAssemblyPath ?? false;
  const mapA = new Map<string, BomDiffLineInput>();
  for (const l of linesA) mapA.set(matchKeyForFlat(l, matchByAssemblyPath), l);
  const mapB = new Map<string, BomDiffLineInput>();
  for (const l of linesB) mapB.set(matchKeyForFlat(l, matchByAssemblyPath), l);

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
      kind = classifyPair(a, b);
      if (kind === "quantityChanged") quantityChangedCount++;
      else if (kind === "revisionChanged") revisionChangedCount++;
      else unchangedCount++;
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
    return x.partNumber.localeCompare(y.partNumber, "ja");
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

/** 既定: 基準（A）ツリー走査＋品番優先マッチ */
export function computeBomDiff(
  linesA: BomDiffLineInput[],
  linesB: BomDiffLineInput[]
): { summary: BomDiffSummary; entries: BomDiffEntry[]; matchAlgorithm: BomDiffMatchAlgorithm } {
  const { summary, entries } = computeTreeBomDiff(linesA, linesB);
  return { summary, entries, matchAlgorithm: "tree" };
}

export function buildDiffSummaryText(
  aLabel: string,
  bLabel: string,
  summary: BomDiffSummary
): string {
  return `${aLabel} → ${bLabel}: 追加 ${summary.addedCount} / 削除 ${summary.removedCount} / 数量変更 ${summary.quantityChangedCount} / 部品 Rev 上がり ${summary.revisionChangedCount}`;
}

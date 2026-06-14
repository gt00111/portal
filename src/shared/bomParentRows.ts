/** 部材管理: 親品番行（サブ組立）の判定・行スタイル（§8.5.19） */

export interface BomAssemblyRow {
  partNumber: string;
  assemblyPath?: string | null;
  parentAssemblyPartNumber?: string | null;
}

/** `assembly_path` から、子を 1 件以上持つ親 path の集合を構築 */
export function collectParentAssemblyPaths(
  rows: Array<{ assemblyPath?: string | null }>
): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const path = row.assemblyPath?.trim();
    if (!path) continue;
    const idx = path.lastIndexOf("/");
    if (idx > 0) out.add(path.slice(0, idx));
  }
  return out;
}

/** 他行の `parent_assembly_part_number` として参照されている品番 */
export function collectReferencedParentPartNumbers(
  rows: Array<{ parentAssemblyPartNumber?: string | null }>
): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const parent = row.parentAssemblyPartNumber?.trim();
    if (parent) out.add(parent);
  }
  return out;
}

export interface BomParentRowContext {
  parentAssemblyPaths: Set<string>;
  referencedParentPartNumbers: Set<string>;
}

export function buildBomParentRowContext(rows: BomAssemblyRow[]): BomParentRowContext {
  return {
    parentAssemblyPaths: collectParentAssemblyPaths(rows),
    referencedParentPartNumbers: collectReferencedParentPartNumbers(rows),
  };
}

/** 子を持つ親品番行か（表示行集合ベース） */
export function isBomParentAssemblyRow(
  row: BomAssemblyRow,
  ctx: BomParentRowContext
): boolean {
  const partNumber = row.partNumber.trim();
  const path = row.assemblyPath?.trim() ?? "";
  if (path.length > 0 && ctx.parentAssemblyPaths.has(path)) return true;
  if (partNumber && ctx.referencedParentPartNumbers.has(partNumber)) return true;
  return false;
}

/** 行背景: 非表示 > 遅延（未完了案件）> 入荷済 > 手配済（§8.5.19.4） */
export function bomTreeRowSurfaceClass(options: {
  isHidden?: boolean;
  isDelayed?: boolean;
  isReceived?: boolean;
  isArranged?: boolean;
  /** 案件完了時は遅延ハイライトを抑制（§8.5.21） */
  suppressRiskHighlight?: boolean;
}): string {
  if (options.isHidden) return "bg-bg-elevated/50 text-fg-muted";
  if (!options.suppressRiskHighlight && options.isDelayed) {
    return "border-l-2 border-l-state-danger bg-state-danger/[0.03]";
  }
  if (options.isReceived) {
    return "border-l-2 border-l-lime-500 bg-lime-400/20";
  }
  if (options.isArranged) return "bg-state-success/[0.06]";
  return "";
}

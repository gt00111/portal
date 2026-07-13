/** 自社発行図面・顧客図面の Rev グループ・大小比較・現行版判定（§8.4.6） */

export interface RevGroupRowCore {
  customer_name: string | null;
  model: string | null;
  product_name: string | null;
  revision: string | null;
  is_obsolete: number;
  /**
   * トップアセンブリ品番（REQ-DL-004）。部品単位登録では
   * 同一部品品番が複数アセンブリに存在しうるため、Rev グループキーに含める。
   * 顧客図面・旧データでは null（従来どおりの挙動）。
   */
  assembly_number?: string | null;
}

export interface RevGroupRow extends RevGroupRowCore {
  id: number;
}

export type RevGroupRowWithId<TId> = RevGroupRowCore & { id: TId };

export function revGroupKey(
  customerName: string | null | undefined,
  model: string | null | undefined,
  productName: string | null | undefined,
  assemblyNumber?: string | null | undefined
): string {
  return [
    customerName?.trim() ?? "",
    model?.trim() ?? "",
    productName?.trim() ?? "",
    assemblyNumber?.trim() ?? "",
  ].join("\0");
}

export function revGroupKeyFromRow(row: RevGroupRowCore): string {
  return revGroupKey(row.customer_name, row.model, row.product_name, row.assembly_number);
}

/** 昇順（小→大）。整数文字列は数値比較、それ以外は localeCompare。 */
export function compareRevision(a: string | null | undefined, b: string | null | undefined): number {
  const sa = (a ?? "").trim();
  const sb = (b ?? "").trim();
  if (sa === sb) return 0;
  if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
    return Number(sa) - Number(sb);
  }
  return sa.localeCompare(sb, "ja", { sensitivity: "base" });
}

export function compareRevisionDesc(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  return compareRevision(b, a);
}

export function sortByRevisionDesc<T extends { revision: string | null }>(rows: T[]): T[] {
  return [...rows].sort((x, y) => compareRevisionDesc(x.revision, y.revision));
}

function groupRowsByRevKey<T extends RevGroupRowCore>(rows: T[]): Map<string, T[]> {
  const byGroup = new Map<string, T[]>();
  for (const row of rows) {
    const key = revGroupKeyFromRow(row);
    const list = byGroup.get(key) ?? [];
    list.push(row);
    byGroup.set(key, list);
  }
  return byGroup;
}

/** グループ内の最大 Rev（is_obsolete=0 の行のみ）。該当なしは null。 */
export function findMaxRevisionInGroup(rows: RevGroupRowCore[]): string | null {
  const active = rows.filter((r) => r.is_obsolete !== 1);
  if (active.length === 0) return null;
  let bestRev = active[0]!.revision;
  for (let i = 1; i < active.length; i++) {
    const r = active[i]!;
    if (compareRevision(r.revision, bestRev) > 0) {
      bestRev = r.revision;
    }
  }
  return bestRev;
}

/** 全行からグループキー → 現行 Rev の Map を構築する（顧客図面の複数ファイル対応）。 */
export function buildMaxRevisionByGroup<T extends RevGroupRowCore>(rows: T[]): Map<string, string | null> {
  const result = new Map<string, string | null>();
  for (const [key, list] of groupRowsByRevKey(rows)) {
    result.set(key, findMaxRevisionInGroup(list));
  }
  return result;
}

/** 現行 Rev に該当する行か（同一案件の複数ファイルもすべて true）。 */
export function isCurrentRevisionRow(row: RevGroupRowCore, maxRevByGroup: Map<string, string | null>): boolean {
  if (row.is_obsolete === 1) return false;
  const maxRev = maxRevByGroup.get(revGroupKeyFromRow(row));
  if (maxRev == null) return false;
  return compareRevision(row.revision, maxRev) === 0;
}

/** グループ内の現行版 id（最大 Rev かつ is_obsolete=0）。該当なしは undefined。 */
export function findCurrentDrawingIdInGroup(rows: RevGroupRow[]): number | undefined {
  const active = rows.filter((r) => r.is_obsolete !== 1);
  if (active.length === 0) return undefined;
  let best = active[0]!;
  for (let i = 1; i < active.length; i++) {
    const r = active[i]!;
    if (compareRevision(r.revision, best.revision) > 0) {
      best = r;
    }
  }
  return best.id;
}

/** 全 work 行からグループキー → 現行版 id の Map を構築する。 */
export function buildCurrentDrawingIdMap(rows: RevGroupRow[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const [key, list] of groupRowsByRevKey(rows)) {
    const currentId = findCurrentDrawingIdInGroup(list);
    if (currentId != null) {
      result.set(key, currentId);
    }
  }
  return result;
}

export function isCurrentDrawing(row: RevGroupRow, currentIdMap: Map<string, number>): boolean {
  const key = revGroupKeyFromRow(row);
  const currentId = currentIdMap.get(key);
  return currentId === row.id && row.is_obsolete !== 1;
}

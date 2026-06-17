/** 自社発行図面の Rev グループ・大小比較・現行版判定（§8.4.6） */

export interface RevGroupRow {
  id: number;
  customer_name: string | null;
  model: string | null;
  product_name: string | null;
  revision: string | null;
  is_obsolete: number;
}

export function revGroupKey(
  customerName: string | null | undefined,
  model: string | null | undefined,
  productName: string | null | undefined
): string {
  return `${customerName?.trim() ?? ""}\0${model?.trim() ?? ""}\0${productName?.trim() ?? ""}`;
}

export function revGroupKeyFromRow(row: RevGroupRow): string {
  return revGroupKey(row.customer_name, row.model, row.product_name);
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
  const byGroup = new Map<string, RevGroupRow[]>();
  for (const row of rows) {
    const key = revGroupKeyFromRow(row);
    const list = byGroup.get(key) ?? [];
    list.push(row);
    byGroup.set(key, list);
  }
  const result = new Map<string, number>();
  for (const [key, list] of byGroup) {
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

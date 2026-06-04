/** BOM 部品一覧: 親子ツリーを維持したまま兄弟ノードのみソート */

export type BomTreeSortKey =
  | "importOrder"
  | "partNumber"
  | "revision"
  | "quantity"
  | "material";

export type BomTreeSortDirection = "asc" | "desc";

export interface BomTreeSortableRow {
  partNumber: string;
  parentAssemblyPartNumber: string | null;
  bomLevel: number;
  assemblyPath: string | null;
  revision: string | null;
  quantity: number;
  note: string | null;
  sortOrder: number;
}

function parentPathOf(assemblyPath: string): string | null {
  const idx = assemblyPath.lastIndexOf("/");
  if (idx <= 0) return null;
  return assemblyPath.slice(0, idx);
}

function compareRows(
  a: BomTreeSortableRow,
  b: BomTreeSortableRow,
  key: BomTreeSortKey,
  dir: number
): number {
  const tie = (a.sortOrder - b.sortOrder) * dir;
  switch (key) {
    case "partNumber":
      return dir * a.partNumber.localeCompare(b.partNumber, "ja") || tie;
    case "revision": {
      const ra = a.revision ?? "";
      const rb = b.revision ?? "";
      if (ra === "-" && rb !== "-") return dir;
      if (rb === "-" && ra !== "-") return -dir;
      return dir * ra.localeCompare(rb, "ja") || tie;
    }
    case "quantity":
      return dir * (a.quantity - b.quantity) || tie;
    case "material": {
      const ma = extractMaterial(a.note);
      const mb = extractMaterial(b.note);
      return dir * ma.localeCompare(mb, "ja") || tie;
    }
    case "importOrder":
    default:
      return tie;
  }
}

function extractMaterial(note: string | null): string {
  if (!note) return "";
  const m = note.match(/^材質:\s*(.+)$/);
  return m ? m[1].trim() : note.trim();
}

/**
 * 深さ優先で走査し、各親の直下の子だけをソートする。
 * assembly_path が無い行は sort_order 順のフラットリスト末尾に付与。
 */
export function sortBomTreeRows<T extends BomTreeSortableRow>(
  rows: T[],
  key: BomTreeSortKey,
  direction: BomTreeSortDirection
): T[] {
  const dir = direction === "asc" ? 1 : -1;
  const withPath = rows.filter((r) => r.assemblyPath && r.assemblyPath.trim());
  const withoutPath = rows.filter((r) => !r.assemblyPath?.trim());

  const childrenByParent = new Map<string, T[]>();
  for (const r of withPath) {
    const path = r.assemblyPath!.trim();
    const parentKey = parentPathOf(path) ?? "__root__";
    const list = childrenByParent.get(parentKey) ?? [];
    list.push(r);
    childrenByParent.set(parentKey, list);
  }

  const out: T[] = [];
  const visit = (parentKey: string): void => {
    const kids = childrenByParent.get(parentKey) ?? [];
    kids.sort((a, b) => compareRows(a, b, key, dir));
    for (const k of kids) {
      out.push(k);
      if (k.assemblyPath) visit(k.assemblyPath.trim());
    }
  };
  visit("__root__");

  const sortedOrphans = [...withoutPath].sort((a, b) => compareRows(a, b, key, dir));
  return [...out, ...sortedOrphans];
}

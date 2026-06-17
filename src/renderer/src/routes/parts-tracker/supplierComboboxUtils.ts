import type { MasterRow } from "@shared/master.js";

export const SUPPLIER_COMBOBOX_MAX_RESULTS = 10;

export function supplierLabel(s: MasterRow): string {
  return `${s.code} : ${s.name}`;
}

export function normalizeSupplierQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** 大きいほど優先（0 = 非マッチ） */
function matchTier(s: MasterRow, normalizedQuery: string): number {
  if (!normalizedQuery) return 1;
  const code = s.code.trim().toLowerCase();
  const name = s.name.trim().toLowerCase();
  if (code === normalizedQuery) return 100;
  if (code.startsWith(normalizedQuery)) return 80;
  if (name.startsWith(normalizedQuery)) return 70;
  if (code.includes(normalizedQuery)) return 50;
  if (name.includes(normalizedQuery)) return 40;
  return 0;
}

export function filterSuppliers(
  suppliers: MasterRow[],
  query: string,
  limit = SUPPLIER_COMBOBOX_MAX_RESULTS
): MasterRow[] {
  const q = normalizeSupplierQuery(query);
  return suppliers
    .map((s) => ({ s, tier: matchTier(s, q) }))
    .filter((row) => (q ? row.tier > 0 : true))
    .sort((a, b) => {
      if (b.tier !== a.tier) return b.tier - a.tier;
      return a.s.code.localeCompare(b.s.code, "ja");
    })
    .slice(0, limit)
    .map((row) => row.s);
}

export function findSupplierById(
  suppliers: MasterRow[],
  supplierId: number | null | undefined
): MasterRow | undefined {
  if (supplierId == null) return undefined;
  return suppliers.find((s) => s.id === supplierId);
}

export const MASTER_TABLES = [
  "m_customers",
  "m_models",
  "m_part_numbers",
  "m_component_names",
  "m_group_names",
  "m_user_names",
  "m_suppliers",
  "m_categories",
] as const;

export type MasterTable = (typeof MASTER_TABLES)[number];

export const MASTER_TABLE_LABELS: Record<MasterTable, string> = {
  m_customers: "客先",
  m_models: "機種",
  m_part_numbers: "図面番号(品番)",
  m_component_names: "部品名称",
  m_group_names: "グループ名",
  m_user_names: "ユーザー",
  m_suppliers: "商社",
  m_categories: "カテゴリ",
};

/** scope を持つマスタ（scope 単位で値を分離する） */
export const SCOPED_MASTER_TABLES = ["m_categories"] as const;
export type ScopedMasterTable = (typeof SCOPED_MASTER_TABLES)[number];

export function isScopedMasterTable(table: MasterTable): table is ScopedMasterTable {
  return (SCOPED_MASTER_TABLES as readonly string[]).includes(table);
}

/** カテゴリの scope（用途別の値の集合） */
export const CATEGORY_SCOPES = [
  "drawing-library/work",
  "drawing-library/customer",
] as const;
export type CategoryScope = (typeof CATEGORY_SCOPES)[number];

export const CATEGORY_SCOPE_LABELS: Record<CategoryScope, string> = {
  "drawing-library/work": "図面ライブラリ：自社発行",
  "drawing-library/customer": "図面ライブラリ：顧客図面",
};

export function isCategoryScope(value: unknown): value is CategoryScope {
  return typeof value === "string" && (CATEGORY_SCOPES as readonly string[]).includes(value);
}

export interface MasterRow {
  id: number;
  code: string;
  name: string;
  note: string | null;
  isActive: boolean;
  /** 値が scope を持つ場合のみ設定される（例：m_categories） */
  scope?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MasterUpsertInput {
  code: string;
  name: string;
  note?: string | null;
  isActive?: boolean;
  /** scope を持つマスタは必須（例：m_categories） */
  scope?: string | null;
}

export interface MasterListParams {
  table: string;
  /** scope を持つマスタの絞り込み（指定しない場合は全件） */
  scope?: string | null;
}

export function isMasterTable(value: unknown): value is MasterTable {
  return typeof value === "string" && (MASTER_TABLES as readonly string[]).includes(value);
}

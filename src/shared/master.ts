export const MASTER_TABLES = [
  "m_customers",
  "m_models",
  "m_part_numbers",
  "m_component_names",
  "m_group_names",
  "m_user_names",
] as const;

export type MasterTable = (typeof MASTER_TABLES)[number];

export const MASTER_TABLE_LABELS: Record<MasterTable, string> = {
  m_customers: "客先",
  m_models: "機種",
  m_part_numbers: "図面番号(品番)",
  m_component_names: "部品名称",
  m_group_names: "グループ名",
  m_user_names: "担当者",
};

export interface MasterRow {
  id: number;
  code: string;
  name: string;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MasterUpsertInput {
  code: string;
  name: string;
  note?: string | null;
  isActive?: boolean;
}

export function isMasterTable(value: unknown): value is MasterTable {
  return typeof value === "string" && (MASTER_TABLES as readonly string[]).includes(value);
}

import { getDb } from "@main/db/connection.js";
import { getSeisanDb } from "@main/db/seisanConnection.js";

export interface SeisanMasterItem {
  id: number;
  name: string;
}

export function listCustomers(): SeisanMasterItem[] {
  return getDb()
    .prepare("SELECT id, name FROM m_customers WHERE isActive = 1 ORDER BY name COLLATE NOCASE")
    .all() as SeisanMasterItem[];
}

/** 中央 DB は flat。customerId は無視し、全機種を返す（UI 互換のため引数は残す）。 */
export function listModels(_customerId: number): SeisanMasterItem[] {
  return getDb()
    .prepare("SELECT id, name FROM m_models WHERE isActive = 1 ORDER BY name COLLATE NOCASE")
    .all() as SeisanMasterItem[];
}

/** modelId は無視し、図面番号(品番)マスタを全件返す。 */
export function listPartNumbers(_modelId: number): SeisanMasterItem[] {
  return getDb()
    .prepare("SELECT id, name FROM m_part_numbers WHERE isActive = 1 ORDER BY name COLLATE NOCASE")
    .all() as SeisanMasterItem[];
}

/** partNumberId は無視し、全部品名称を返す。 */
export function listComponentNames(_partNumberId: number): SeisanMasterItem[] {
  return getDb()
    .prepare("SELECT id, name FROM m_component_names WHERE isActive = 1 ORDER BY name COLLATE NOCASE")
    .all() as SeisanMasterItem[];
}

export function listAllModels(): SeisanMasterItem[] {
  return listModels(0);
}

export function listAllPartNumbers(): SeisanMasterItem[] {
  return listPartNumbers(0);
}

export function listAllComponentNames(): SeisanMasterItem[] {
  return listComponentNames(0);
}

export function listGroupNames(): SeisanMasterItem[] {
  return getDb()
    .prepare("SELECT id, name FROM m_group_names WHERE isActive = 1 ORDER BY name COLLATE NOCASE")
    .all() as SeisanMasterItem[];
}

export function listUserNames(): SeisanMasterItem[] {
  return getDb()
    .prepare("SELECT id, name FROM m_user_names WHERE isActive = 1 ORDER BY name COLLATE NOCASE")
    .all() as SeisanMasterItem[];
}

export function distinctCompaniesFromProjects(): string[] {
  const rows = getSeisanDb()
    .prepare(
      "SELECT DISTINCT company_id AS name FROM projects WHERE company_id IS NOT NULL ORDER BY company_id"
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function distinctGroupsFromProjects(): string[] {
  const rows = getSeisanDb()
    .prepare(
      `SELECT DISTINCT group_id AS name FROM projects WHERE group_id IS NOT NULL AND group_id != '' ORDER BY group_id`
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

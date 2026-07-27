import type { MachineOption, ToolOption } from "@shared/sheetMetalSupport.js";

import { getDb } from "@main/db/connection.js";

/**
 * 中央ポータル DB（master 系）への読み取り専用参照。
 * master「モジュール」は import せず、共有 DB 接続レイヤと @shared のみを利用する。
 * 板金製造支援では機械（`m_machines`）・金型（`m_upper_tools`/`m_lower_tools`）・
 * ユーザー名（`m_user_names`）を参照する。
 */

export function listMachines(): MachineOption[] {
  const rows = getDb()
    .prepare(
      `SELECT id, code, name
       FROM m_machines
       WHERE isActive = 1
       ORDER BY code COLLATE NOCASE ASC`
    )
    .all() as { id: number; code: string; name: string }[];
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
}

function listToolsFrom(table: "m_upper_tools" | "m_lower_tools"): ToolOption[] {
  const rows = getDb()
    .prepare(
      `SELECT id, code, name
       FROM ${table}
       WHERE isActive = 1
       ORDER BY code COLLATE NOCASE ASC`
    )
    .all() as { id: number; code: string; name: string }[];
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
}

export function listUpperTools(): ToolOption[] {
  return listToolsFrom("m_upper_tools");
}

export function listLowerTools(): ToolOption[] {
  return listToolsFrom("m_lower_tools");
}

function buildNameMapFrom(table: string): Map<number, string> {
  const rows = getDb().prepare(`SELECT id, name FROM ${table}`).all() as {
    id: number;
    name: string;
  }[];
  const map = new Map<number, string>();
  for (const r of rows) {
    map.set(r.id, r.name);
  }
  return map;
}

export function buildUpperToolNameMap(): Map<number, string> {
  return buildNameMapFrom("m_upper_tools");
}

export function buildLowerToolNameMap(): Map<number, string> {
  return buildNameMapFrom("m_lower_tools");
}

/** 機械 ID → 表示名の Map（無効化済みも解決できるよう全件） */
export function buildMachineNameMap(): Map<number, string> {
  return buildNameMapFrom("m_machines");
}

/** ユーザー名 ID（`m_user_names.id`）→ 表示名の Map */
export function buildUserNameMap(): Map<number, string> {
  return buildNameMapFrom("m_user_names");
}

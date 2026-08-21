import type { MachineOption, ToolHolderOption, ToolOption } from "@shared/sheetMetalSupport.js";
import { isHolderType, isPunchType } from "@shared/sheetMetalSupport.js";

import { getDb } from "@main/db/connection.js";

/**
 * 中央ポータル DB（master 系）への読み取り専用参照。
 * master「モジュール」は import せず、共有 DB 接続レイヤと @shared のみを利用する。
 * 板金製造支援では機械（`m_machines`）・金型（`m_upper_tools`/`m_lower_tools`）・
 * ホルダー（`m_tool_holders`）・ユーザー名（`m_user_names`）を参照する。
 */

/** SQLite の REAL は未入力で null になるため、数値以外は null に正規化する */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** 未入力の TEXT は空文字と null が混在しうるため、null に正規化する */
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** 対応表（レコード ID → 機械 ID）を読む。行が無いレコードは全機械で共用。 */
function loadMachineLinks(linkTable: string, column: string): Map<number, number[]> {
  const rows = getDb()
    .prepare(`SELECT ${column} AS ownerId, machineId FROM ${linkTable}`)
    .all() as { ownerId: number; machineId: number }[];
  const map = new Map<number, number[]>();
  for (const row of rows) {
    const list = map.get(row.ownerId) ?? [];
    list.push(row.machineId);
    map.set(row.ownerId, list);
  }
  return map;
}

function queryMachines(activeOnly: boolean): MachineOption[] {
  const rows = getDb()
    .prepare(
      `SELECT id, code, name, pressCapacity, tableLength, openHeight, strokeLength
       FROM m_machines
       ${activeOnly ? "WHERE isActive = 1" : ""}
       ORDER BY code COLLATE NOCASE ASC`
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    code: r.code as string,
    name: r.name as string,
    pressCapacity: num(r.pressCapacity),
    tableLength: num(r.tableLength),
    openHeight: num(r.openHeight),
    strokeLength: num(r.strokeLength),
  }));
}

export function listMachines(): MachineOption[] {
  return queryMachines(true);
}

/** 金型 ID → 取り付けられる機械 ID の一覧（対応表に行が無い金型は共用） */
function loadToolMachineLinks(
  table: "m_upper_tools" | "m_lower_tools"
): Map<number, number[]> {
  return table === "m_lower_tools"
    ? loadMachineLinks("m_lower_tool_machines", "lowerToolId")
    : loadMachineLinks("m_upper_tool_machines", "upperToolId");
}

function queryTools(
  table: "m_upper_tools" | "m_lower_tools",
  activeOnly: boolean
): ToolOption[] {
  const dimensions =
    table === "m_lower_tools"
      ? `vWidth, dieAngle, shoulderRadius,
         NULL AS tipRadius, NULL AS tipAngle, NULL AS punchType,
         NULL AS bodyOffset, NULL AS reliefHeight, NULL AS reliefDepth`
      : `NULL AS vWidth, NULL AS dieAngle, NULL AS shoulderRadius,
         tipRadius, tipAngle, punchType, bodyOffset, reliefHeight, reliefDepth`;
  const rows = getDb()
    .prepare(
      `SELECT id, code, name, ${dimensions}, toolHeight, maxLoad, mountStandard
       FROM ${table}
       ${activeOnly ? "WHERE isActive = 1" : ""}
       ORDER BY code COLLATE NOCASE ASC`
    )
    .all() as Record<string, unknown>[];
  const links = loadToolMachineLinks(table);
  return rows.map((r) => ({
    id: r.id as number,
    code: r.code as string,
    name: r.name as string,
    vWidth: num(r.vWidth),
    dieAngle: num(r.dieAngle),
    shoulderRadius: num(r.shoulderRadius),
    tipRadius: num(r.tipRadius),
    tipAngle: num(r.tipAngle),
    toolHeight: num(r.toolHeight),
    maxLoad: num(r.maxLoad),
    machineIds: links.get(r.id as number) ?? [],
    punchType: isPunchType(r.punchType) ? r.punchType : null,
    bodyOffset: num(r.bodyOffset),
    reliefHeight: num(r.reliefHeight),
    reliefDepth: num(r.reliefDepth),
    mountStandard: text(r.mountStandard),
  }));
}

function queryToolHolders(activeOnly: boolean): ToolHolderOption[] {
  const rows = getDb()
    .prepare(
      `SELECT id, code, name, holderType, toolHeight, maxLoad, topOffset, maxStack, mountStandard
       FROM m_tool_holders
       ${activeOnly ? "WHERE isActive = 1" : ""}
       ORDER BY code COLLATE NOCASE ASC`
    )
    .all() as Record<string, unknown>[];
  const links = loadMachineLinks("m_tool_holder_machines", "holderId");
  return rows.map((r) => ({
    id: r.id as number,
    code: r.code as string,
    name: r.name as string,
    holderType: isHolderType(r.holderType) ? r.holderType : null,
    toolHeight: num(r.toolHeight),
    maxLoad: num(r.maxLoad),
    topOffset: num(r.topOffset),
    maxStack: num(r.maxStack),
    mountStandard: text(r.mountStandard),
    machineIds: links.get(r.id as number) ?? [],
  }));
}

export function listUpperTools(): ToolOption[] {
  return queryTools("m_upper_tools", true);
}

export function listLowerTools(): ToolOption[] {
  return queryTools("m_lower_tools", true);
}

export function listToolHolders(): ToolHolderOption[] {
  return queryToolHolders(true);
}

/** ホルダー ID → 寸法付きホルダーの Map（無効化済みも解決できるよう全件） */
export function buildToolHolderMap(): Map<number, ToolHolderOption> {
  return new Map(queryToolHolders(false).map((h) => [h.id, h]));
}

/** 上型 ID → 寸法付き金型の Map（無効化済みも解決できるよう全件） */
export function buildUpperToolMap(): Map<number, ToolOption> {
  return new Map(queryTools("m_upper_tools", false).map((t) => [t.id, t]));
}

/** 下型 ID → 寸法付き金型の Map（無効化済みも解決できるよう全件） */
export function buildLowerToolMap(): Map<number, ToolOption> {
  return new Map(queryTools("m_lower_tools", false).map((t) => [t.id, t]));
}

/** 機械 ID → 能力付き機械の Map（無効化済みも解決できるよう全件） */
export function buildMachineMap(): Map<number, MachineOption> {
  return new Map(queryMachines(false).map((m) => [m.id, m]));
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

export function buildToolHolderNameMap(): Map<number, string> {
  return buildNameMapFrom("m_tool_holders");
}

/** 機械 ID → 表示名の Map（無効化済みも解決できるよう全件） */
export function buildMachineNameMap(): Map<number, string> {
  return buildNameMapFrom("m_machines");
}

/** ユーザー名 ID（`m_user_names.id`）→ 表示名の Map */
export function buildUserNameMap(): Map<number, string> {
  return buildNameMapFrom("m_user_names");
}

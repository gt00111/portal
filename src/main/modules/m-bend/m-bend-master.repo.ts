import {
  isMachineLinkedMasterTable,
  isNumberField,
  MACHINE_LINK_TABLES,
  masterExtraFields,
  type MasterExtraValues,
  type MasterRow,
  type MasterUpsertInput,
} from "@shared/master.js";
import { getDb } from "@main/db/connection.js";
import { getMBendDb } from "@main/db/mBendConnection.js";
import type { MachineOption, ToolHolderOption, ToolOption } from "@shared/sheetMetalSupport.js";
import { isHolderType, isPunchType } from "@shared/sheetMetalSupport.js";

export const MBEND_MASTER_TABLES = ["m_machines", "m_upper_tools", "m_lower_tools", "m_tool_holders"] as const;
type MBendMasterTable = (typeof MBEND_MASTER_TABLES)[number];

function table(value: string): MBendMasterTable {
  if (!(MBEND_MASTER_TABLES as readonly string[]).includes(value)) throw new Error("M-BEND対象外のマスターです。");
  return value as MBendMasterTable;
}
function columns(t: MBendMasterTable): string[] { return masterExtraFields(t).map((f) => f.key); }
function links(t: MBendMasterTable): { table: string; column: string } | null {
  return isMachineLinkedMasterTable(t) ? MACHINE_LINK_TABLES[t] : null;
}
function machineLinks(t: MBendMasterTable): Map<number, number[]> {
  const result = new Map<number, number[]>();
  const link = links(t); if (!link) return result;
  const rows = getMBendDb().prepare(`SELECT ${link.column} ownerId, machineId FROM ${link.table}`).all() as Array<{ ownerId: number; machineId: number }>;
  for (const row of rows) result.set(row.ownerId, [...(result.get(row.ownerId) ?? []), row.machineId]);
  return result;
}
function toRow(raw: Record<string, unknown>, t: MBendMasterTable, machineIds: number[] = []): MasterRow {
  const extra: MasterExtraValues = {};
  for (const field of masterExtraFields(t)) {
    const value = raw[field.key];
    extra[field.key] = isNumberField(field)
      ? typeof value === "number" ? value : null
      : typeof value === "string" && value ? value : null;
  }
  return { id: Number(raw.id), code: String(raw.code), name: String(raw.name), note: typeof raw.note === "string" ? raw.note : null, isActive: raw.isActive === 1, createdAt: String(raw.createdAt), updatedAt: String(raw.updatedAt), extra, machineIds };
}
export function list(tInput: string): MasterRow[] {
  const t = table(tInput); const extras = columns(t); const map = machineLinks(t);
  const rows = getMBendDb().prepare(`SELECT id, code, name, note, ${extras.length ? `${extras.join(", ")},` : ""} isActive, createdAt, updatedAt FROM ${t} ORDER BY code COLLATE NOCASE`).all() as Array<Record<string, unknown>>;
  return rows.map((row) => toRow(row, t, map.get(Number(row.id)) ?? []));
}
function values(t: MBendMasterTable, input: MasterUpsertInput): Array<string | number | null> {
  const fields = masterExtraFields(t);
  return fields.map((field) => {
    const raw = input.extra?.[field.key];
    if (raw == null || raw === "") return null;
    return isNumberField(field) ? Number(raw) : raw;
  });
}
function replaceLinks(t: MBendMasterTable, id: number, machineIds: readonly number[] = []): void {
  const link = links(t); if (!link) return; const db = getMBendDb();
  db.prepare(`DELETE FROM ${link.table} WHERE ${link.column} = ?`).run(id);
  const insert = db.prepare(`INSERT INTO ${link.table} (${link.column}, machineId) VALUES (?, ?)`);
  for (const machineId of [...new Set(machineIds)]) insert.run(id, machineId);
}
export function create(tInput: string, input: MasterUpsertInput): MasterRow {
  const t = table(tInput); const extras = columns(t); const cols = ["code", "name", "note", ...extras, "isActive"];
  const info = getMBendDb().prepare(`INSERT INTO ${t} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(input.code.trim(), input.name.trim(), input.note ?? null, ...values(t, input), input.isActive === false ? 0 : 1);
  replaceLinks(t, Number(info.lastInsertRowid), input.machineIds);
  return list(t).find((r) => r.id === Number(info.lastInsertRowid))!;
}
export function update(tInput: string, id: number, input: MasterUpsertInput): MasterRow {
  const t = table(tInput); const extras = columns(t); const cols = ["code", "name", "note", ...extras, "isActive"];
  getMBendDb().prepare(`UPDATE ${t} SET ${cols.map((c) => `${c}=?`).join(",")}, updatedAt=datetime('now') WHERE id=?`).run(input.code.trim(), input.name.trim(), input.note ?? null, ...values(t, input), input.isActive === false ? 0 : 1, id);
  replaceLinks(t, id, input.machineIds);
  const row = list(t).find((r) => r.id === id); if (!row) throw new Error("更新対象がありません。"); return row;
}
export function remove(tInput: string, id: number): void { getMBendDb().prepare(`DELETE FROM ${table(tInput)} WHERE id=?`).run(id); }

function numberValue(row: MasterRow, key: string): number | null {
  const value = row.extra?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function textValue(row: MasterRow, key: string): string | null {
  const value = row.extra?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
export function listMachinesForCam(): MachineOption[] {
  return list("m_machines").filter((r) => r.isActive).map((r) => ({
    id: r.id, code: r.code, name: r.name,
    pressCapacity: numberValue(r, "pressCapacity"), tableLength: numberValue(r, "tableLength"),
    openHeight: numberValue(r, "openHeight"), strokeLength: numberValue(r, "strokeLength"),
  }));
}
function listToolsForCam(t: "m_upper_tools" | "m_lower_tools"): ToolOption[] {
  return list(t).filter((r) => r.isActive).map((r) => {
    const punchType = textValue(r, "punchType");
    return {
      id: r.id, code: r.code, name: r.name,
      vWidth: numberValue(r, "vWidth"), dieAngle: numberValue(r, "dieAngle"),
      shoulderRadius: numberValue(r, "shoulderRadius"), tipRadius: numberValue(r, "tipRadius"),
      tipAngle: numberValue(r, "tipAngle"), toolHeight: numberValue(r, "toolHeight"),
      maxLoad: numberValue(r, "maxLoad"), machineIds: r.machineIds ?? [],
      punchType: isPunchType(punchType) ? punchType : null,
      bodyOffset: numberValue(r, "bodyOffset"), reliefHeight: numberValue(r, "reliefHeight"),
      reliefDepth: numberValue(r, "reliefDepth"), mountStandard: textValue(r, "mountStandard"),
    };
  });
}
export function listUpperToolsForCam(): ToolOption[] { return listToolsForCam("m_upper_tools"); }
export function listLowerToolsForCam(): ToolOption[] { return listToolsForCam("m_lower_tools"); }
export function listToolHoldersForCam(): ToolHolderOption[] {
  return list("m_tool_holders").filter((r) => r.isActive).map((r) => {
    const holderType = textValue(r, "holderType");
    return {
      id: r.id, code: r.code, name: r.name,
      holderType: isHolderType(holderType) ? holderType : null,
      toolHeight: numberValue(r, "toolHeight"), maxLoad: numberValue(r, "maxLoad"),
      topOffset: numberValue(r, "topOffset"), maxStack: numberValue(r, "maxStack"),
      mountStandard: textValue(r, "mountStandard"), machineIds: r.machineIds ?? [],
    };
  });
}

export function importFromPortalMaster(): { machines: number; upperTools: number; lowerTools: number; holders: number } {
  const source = getDb(); const target = getMBendDb();
  const previous = target.prepare("SELECT id FROM migration_log WHERE source = 'portal-master' LIMIT 1").get();
  if (previous) throw new Error("共通マスターからの初回取り込みは完了しています。以後はM-BEND画面で編集してください。");
  const mapping: Array<{ t: MBendMasterTable; link?: { table: string; column: string } }> = [
    { t: "m_machines" }, { t: "m_upper_tools", link: MACHINE_LINK_TABLES.m_upper_tools },
    { t: "m_lower_tools", link: MACHINE_LINK_TABLES.m_lower_tools }, { t: "m_tool_holders", link: MACHINE_LINK_TABLES.m_tool_holders },
  ];
  const counts: Record<string, number> = {};
  target.transaction(() => {
    const machineIdBySource = new Map<number, number>();
    for (const entry of mapping) {
      const extras = columns(entry.t); const sourceRows = source.prepare(`SELECT id, code, name, note, ${extras.length ? `${extras.join(",")},` : ""} isActive FROM ${entry.t}`).all() as Array<Record<string, unknown>>;
      for (const row of sourceRows) {
        const cols = ["code", "name", "note", ...extras, "isActive"];
        target.prepare(`INSERT INTO ${entry.t} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")}) ON CONFLICT(code) DO UPDATE SET name=excluded.name, note=excluded.note, ${extras.map((c) => `${c}=excluded.${c}`).join(",")}${extras.length ? "," : ""} isActive=excluded.isActive, updatedAt=datetime('now')`).run(row.code, row.name, row.note ?? null, ...extras.map((c) => row[c] ?? null), row.isActive);
        if (entry.t === "m_machines") {
          const inserted = target.prepare("SELECT id FROM m_machines WHERE code=?").get(row.code) as { id: number };
          machineIdBySource.set(Number(row.id), inserted.id);
        }
      }
      counts[entry.t] = sourceRows.length;
      if (entry.link) {
        target.prepare(`DELETE FROM ${entry.link.table}`).run();
        const sourceLinks = source.prepare(`SELECT ${entry.link.column} ownerId, machineId FROM ${entry.link.table}`).all() as Array<{ ownerId: number; machineId: number }>;
        for (const link of sourceLinks) {
          const ownerCode = source.prepare(`SELECT code FROM ${entry.t} WHERE id=?`).get(link.ownerId) as { code: string } | undefined;
          const owner = ownerCode ? target.prepare(`SELECT id FROM ${entry.t} WHERE code=?`).get(ownerCode.code) as { id: number } | undefined : undefined;
          const machineId = machineIdBySource.get(link.machineId);
          if (owner && machineId) target.prepare(`INSERT OR IGNORE INTO ${entry.link.table} (${entry.link.column},machineId) VALUES (?,?)`).run(owner.id, machineId);
        }
      }
    }
    target.prepare("INSERT INTO migration_log (source, importedAt, detail) VALUES ('portal-master', datetime('now'), ?)").run(JSON.stringify(counts));
  })();
  return { machines: counts.m_machines ?? 0, upperTools: counts.m_upper_tools ?? 0, lowerTools: counts.m_lower_tools ?? 0, holders: counts.m_tool_holders ?? 0 };
}

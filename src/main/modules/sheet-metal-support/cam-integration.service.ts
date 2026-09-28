import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  SheetMetalCamMasterExport,
  SheetMetalCamLaunchResult,
  SheetMetalCamResult,
  SheetMetalCamStatus,
} from "@shared/sheetMetalCam.js";

import { getDataRoot } from "@main/db/dataRoot.js";
import { getSheetMetalSupportDb } from "@main/db/sheetMetalSupportConnection.js";
import { getSetting, putSetting } from "@main/modules/settings/settings.repo.js";
import { exportGeometry } from "@main/modules/m-bend/m-bend-geometry.service.js";

import {
  listLowerToolsForCam,
  listMachinesForCam,
  listToolHoldersForCam,
  listUpperToolsForCam,
} from "@main/modules/m-bend/m-bend-master.repo.js";

const MBEND_ROOT_KEY = "sheetMetalCam.mbendRoot";
const IMPORT_ROOT_KEY = "sheetMetalCam.importRoot";
const EXPORTED_AT_KEY = "sheetMetalCam.masterExportedAt";

function bridgeRoot(): string {
  return path.join(getDataRoot(), "integrations", "m-bend");
}

/** 品番フォルダーを選んだ場合は、品番一覧を持つ1階層上をimportRootにする。 */
function normalizeImportRoot(value: string): string {
  const root = path.resolve(value);
  return existsSync(path.join(root, "bend.json")) && existsSync(path.join(root, "flat.dxf"))
    ? path.dirname(root)
    : root;
}

function ensureConfigured(): { mbendRoot: string; importRoot: string } {
  const mbendRoot = getSetting(MBEND_ROOT_KEY);
  const savedImportRoot = getSetting(IMPORT_ROOT_KEY);
  const importRoot = savedImportRoot ? normalizeImportRoot(savedImportRoot) : null;
  if (!mbendRoot || !existsSync(path.join(mbendRoot, "MBend.sln"))) {
    throw new Error("M-BENDのフォルダーを設定してください（MBend.sln があるフォルダー）。");
  }
  if (!importRoot || !existsSync(importRoot)) {
    throw new Error("CadLink出力フォルダーを設定してください。");
  }
  return { mbendRoot, importRoot };
}

export function getCamStatus(): SheetMetalCamStatus {
  const mbendRoot = getSetting(MBEND_ROOT_KEY);
  const savedImportRoot = getSetting(IMPORT_ROOT_KEY);
  const importRoot = savedImportRoot ? normalizeImportRoot(savedImportRoot) : null;
  return {
    mbendRoot,
    importRoot,
    bridgeRoot: bridgeRoot(),
    configured:
      Boolean(mbendRoot && existsSync(path.join(mbendRoot, "MBend.sln"))) &&
      Boolean(importRoot && existsSync(importRoot)),
    masterExportedAt: getSetting(EXPORTED_AT_KEY),
  };
}

export function setMbendRoot(value: string): void {
  const root = path.resolve(value);
  if (!existsSync(path.join(root, "MBend.sln"))) {
    throw new Error("選択したフォルダーに MBend.sln がありません。");
  }
  putSetting(MBEND_ROOT_KEY, root);
}

export function setImportRoot(value: string): void {
  const root = normalizeImportRoot(value);
  if (!existsSync(root)) throw new Error("選択したフォルダーが見つかりません。");
  putSetting(IMPORT_ROOT_KEY, root);
}

function compatibleMachineCodes(machineIds: number[], machineCodeById: Map<number, string>): string[] {
  return machineIds.map((id) => machineCodeById.get(id)).filter((v): v is string => Boolean(v));
}

export function exportCamMasters(): SheetMetalCamMasterExport {
  const { importRoot } = ensureConfigured();
  const root = bridgeRoot();
  const toolsRoot = path.join(root, "tools");
  const outputDir = path.join(root, "results");
  mkdirSync(toolsRoot, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  const machines = listMachinesForCam();
  const uppers = listUpperToolsForCam();
  const lowers = listLowerToolsForCam();
  const holders = listToolHoldersForCam();
  const machineCodeById = new Map(machines.map((m) => [m.id, m.code]));

  const machineJson = machines.map((m) => ({
    id: m.code,
    name: m.name,
    manufacturer: null,
    tableLengthMm: m.tableLength ?? 0,
    openHeightMm: m.openHeight ?? 0,
    pressCapacityKn: m.pressCapacity ?? null,
    strokeLengthMm: m.strokeLength ?? null,
    upJoint: null,
    downJoint: null,
    compatibleHolderIds: holders
      .filter((h) => h.machineIds.length === 0 || h.machineIds.includes(m.id))
      .map((h) => h.code),
  }));
  const upperJson = uppers.map((t) => ({
    geometry: exportGeometry({ table: "m_upper_tools", id: t.id }),
    id: t.code,
    name: t.name,
    tipRadiusMm: t.tipRadius ?? 0,
    angleDeg: t.tipAngle ?? 0,
    heightMm: t.toolHeight ?? 0,
    upJoint: t.mountStandard,
    hemming: false,
    punchType: t.punchType,
    bodyOffsetMm: t.bodyOffset,
    reliefHeightMm: t.reliefHeight,
    reliefDepthMm: t.reliefDepth,
    maxLoadKnPerM: t.maxLoad,
    compatibleMachineIds: compatibleMachineCodes(t.machineIds, machineCodeById),
  }));
  const lowerJson = lowers.map((t) => ({
    geometry: exportGeometry({ table: "m_lower_tools", id: t.id }),
    id: t.code,
    name: t.name,
    vWidthMm: t.vWidth ?? 0,
    angleDeg: t.dieAngle,
    shoulderRadiusMm: t.shoulderRadius,
    heightMm: t.toolHeight,
    maxLoadKnPerM: t.maxLoad,
    upJoint: t.mountStandard,
    downJoint: t.mountStandard,
    compatibleMachineIds: compatibleMachineCodes(t.machineIds, machineCodeById),
  }));

  const setups: Array<Record<string, unknown>> = [];
  for (const machine of machines) {
    const compatibleUppers = uppers.filter(
      (t) => t.machineIds.length === 0 || t.machineIds.includes(machine.id)
    );
    const compatibleLowers = lowers.filter(
      (t) => t.machineIds.length === 0 || t.machineIds.includes(machine.id)
    );
    for (const upper of compatibleUppers) {
      for (const lower of compatibleLowers) {
        setups.push({
          id: `${machine.code}__${upper.code}__${lower.code}`,
          name: `${machine.name} / ${upper.name} / ${lower.name}`,
          machineId: machine.code,
          upperPunchId: upper.code,
          lowerToolId: lower.code,
          upJoint: upper.mountStandard,
          downJoint: lower.mountStandard,
          notes: "portal master generated",
        });
      }
    }
  }

  const writeJson = (name: string, value: unknown): void => {
    writeFileSync(path.join(toolsRoot, name), JSON.stringify(value, null, 2), "utf8");
  };
  writeJson("machines.json", { machines: machineJson });
  writeJson("upper-punches.json", { upperPunches: upperJson });
  writeJson("default-dies.json", { lowerTools: lowerJson });
  writeJson("setups.json", { setups });
  writeJson("tool-geometry.json", {
    schemaVersion: 1,
    simulationReady: false,
    upperTools: upperJson.map((t) => ({ id: t.id, geometry: t.geometry })),
    lowerTools: lowerJson.map((t) => ({ id: t.id, geometry: t.geometry })),
    holders: holders.map((t) => ({ id: t.code, geometry: exportGeometry({ table: "m_tool_holders", id: t.id }) })),
  });

  const configPath = path.join(root, "mbend.config.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        importRoot,
        outputDir,
        logLevel: "info",
        toolMasterPath: path.join(toolsRoot, "default-dies.json"),
        toolsDirectory: toolsRoot,
      },
      null,
      2
    ),
    "utf8"
  );
  const exportedAt = new Date().toISOString();
  putSetting(EXPORTED_AT_KEY, exportedAt);
  const warnings: string[] = [];
  if (machines.length === 0) warnings.push("有効な機械マスターがありません。");
  if (uppers.length === 0) warnings.push("有効な上型マスターがありません。");
  if (lowers.length === 0) warnings.push("有効な下型マスターがありません。");
  return {
    bridgeRoot: root,
    configPath,
    exportedAt,
    counts: { machines: machines.length, upperTools: uppers.length, lowerTools: lowers.length, setups: setups.length },
    warnings,
  };
}

export async function launchMbend(): Promise<SheetMetalCamLaunchResult> {
  const { mbendRoot } = ensureConfigured();
  exportCamMasters();
  const executable = [
    path.join(mbendRoot, "src", "MBend.App", "bin", "Debug", "net8.0-windows", "MBend.App.exe"),
    path.join(mbendRoot, "src", "MBend.App", "bin", "Release", "net8.0-windows", "MBend.App.exe"),
  ].find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error("M-BENDの実行ファイルがありません。M-BENDを一度ビルドしてください。");
  }
  const logsRoot = path.join(bridgeRoot(), "logs");
  mkdirSync(logsRoot, { recursive: true });
  const logPath = path.join(logsRoot, "mbend-launch.log");
  writeFileSync(logPath, `\n[${new Date().toISOString()}] launch ${executable}\n`, {
    encoding: "utf8",
    flag: "a",
  });
  const child = spawn(executable, [], {
    cwd: bridgeRoot(),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  const outcome = await new Promise<{ error?: Error; exitCode?: number | null }>((resolve) => {
    let settled = false;
    const finish = (value: { error?: Error; exitCode?: number | null }): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", (error) => finish({ error }));
    child.once("exit", (exitCode) => finish({ exitCode }));
    setTimeout(() => finish({}), 2500);
  });
  if (outcome.error) {
    throw new Error(`M-BENDを起動できませんでした: ${outcome.error.message}\nログ: ${logPath}`);
  }
  if (outcome.exitCode != null) {
    const logTail = existsSync(logPath) ? readFileSync(logPath, "utf8").slice(-1200).trim() : "";
    throw new Error(
      `M-BENDが起動直後に終了しました（終了コード ${outcome.exitCode}）。${
        logTail ? `\n${logTail}` : ""
      }\nログ: ${logPath}`
    );
  }
  child.unref();
  if (child.pid == null) throw new Error(`M-BENDのプロセスIDを取得できませんでした。ログ: ${logPath}`);
  return { launched: true, processId: child.pid, logPath };
}

function readJson(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildCamConditions(
  tools: Record<string, unknown> | null,
  sequence: Record<string, unknown> | null
): Pick<SheetMetalCamResult, "machineName" | "upperToolName" | "lowerToolName" | "materialLabel" | "thicknessMm" | "recommendedVWidthMm" | "bends"> {
  const sequenceRows = Array.isArray(sequence?.bends) ? sequence.bends : [];
  const sequenceById = new Map<string, number>();
  for (const item of sequenceRows) {
    const row = record(item);
    if (row && typeof row.id === "string" && typeof row.sequence === "number") sequenceById.set(row.id, row.sequence);
  }
  const toolRows = Array.isArray(tools?.bends) ? tools.bends : [];
  return {
    machineName: nullableString(tools?.selectedMachineName),
    upperToolName: nullableString(tools?.selectedUpperToolName),
    lowerToolName: nullableString(tools?.selectedLowerToolName),
    materialLabel: nullableString(tools?.materialLabel),
    thicknessMm: nullableNumber(tools?.thicknessMm),
    recommendedVWidthMm: nullableNumber(tools?.recommendedVWidthMm),
    bends: toolRows.map((item) => {
      const row = record(item) ?? {};
      const bendId = nullableString(row.bendId) ?? "-";
      return {
        sequence: nullableNumber(row.sequence) ?? sequenceById.get(bendId) ?? null,
        bendId,
        angleDeg: nullableNumber(row.angleDeg),
        innerRadiusMm: nullableNumber(row.innerRadiusMm),
        upperToolName: nullableString(row.selectedUpperToolName) ?? nullableString(tools?.selectedUpperToolName),
        lowerToolName: nullableString(row.selectedToolName) ?? nullableString(tools?.selectedLowerToolName),
        status: nullableString(row.status),
        reason: nullableString(row.message),
      };
    }).sort((a, b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER)),
  };
}

export function importCamResult(partNumberInput: string): SheetMetalCamResult {
  const partNumber = partNumberInput.trim();
  if (!partNumber) throw new Error("品番を指定してください。");
  if (partNumber !== path.basename(partNumber) || /[\\/]/.test(partNumber)) {
    throw new Error("品番にフォルダ区切り文字は使用できません。");
  }
  const outputDir = path.join(bridgeRoot(), "results");
  const simulationPath = path.join(outputDir, `${partNumber}.simulation.json`);
  const toolsPath = path.join(outputDir, `${partNumber}.tools.json`);
  const sequencePath = path.join(outputDir, `${partNumber}.sequence.json`);
  const simulation = readJson(simulationPath);
  if (!simulation) throw new Error(`M-BENDの解析結果が見つかりません: ${partNumber}`);
  const tools = readJson(toolsPath);
  const sequence = readJson(sequencePath);
  const collisions = Array.isArray(simulation.collisions) ? simulation.collisions : [];
  const warnings = Array.isArray(simulation.warnings) ? simulation.warnings : [];
  const conditions = buildCamConditions(tools, sequence);
  const result: SheetMetalCamResult = {
    partNumber,
    status: "imported",
    level: typeof simulation.level === "string" ? simulation.level : null,
    summary: typeof simulation.summary === "string" ? simulation.summary : null,
    simulatedAt: typeof simulation.simulatedAt === "string" ? simulation.simulatedAt : null,
    collisionCount: collisions.length,
    warningCount: warnings.length,
    importedAt: new Date().toISOString(),
    sourceFiles: [simulationPath, ...(tools ? [toolsPath] : []), ...(sequence ? [sequencePath] : [])],
    ...conditions,
  };
  const detail = { simulation, tools, sequence };
  getSheetMetalSupportDb()
    .prepare(
      `INSERT INTO cam_results
       (part_number, status, level, summary, simulated_at, collision_count, warning_count,
        source_files, result_detail, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      result.partNumber,
      result.status,
      result.level,
      result.summary,
      result.simulatedAt,
      result.collisionCount,
      result.warningCount,
      JSON.stringify(result.sourceFiles),
      JSON.stringify(detail),
      result.importedAt
    );
  return result;
}

export function getLatestCamResult(partNumberInput: string): SheetMetalCamResult | null {
  const row = getSheetMetalSupportDb()
    .prepare(
      `SELECT part_number, status, level, summary, simulated_at, collision_count,
              warning_count, source_files, result_detail, imported_at
       FROM cam_results WHERE part_number = ? ORDER BY id DESC LIMIT 1`
    )
    .get(partNumberInput.trim()) as Record<string, unknown> | undefined;
  if (!row) return null;
  const detail = record(JSON.parse(String(row.result_detail))) ?? {};
  const conditions = buildCamConditions(record(detail.tools), record(detail.sequence));
  return {
    partNumber: String(row.part_number),
    status: String(row.status),
    level: typeof row.level === "string" ? row.level : null,
    summary: typeof row.summary === "string" ? row.summary : null,
    simulatedAt: typeof row.simulated_at === "string" ? row.simulated_at : null,
    collisionCount: Number(row.collision_count ?? 0),
    warningCount: Number(row.warning_count ?? 0),
    importedAt: String(row.imported_at),
    sourceFiles: Array.isArray(JSON.parse(String(row.source_files)))
      ? (JSON.parse(String(row.source_files)) as string[])
      : [],
    ...conditions,
  };
}

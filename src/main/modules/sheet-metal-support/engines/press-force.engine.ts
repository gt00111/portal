import type {
  MachineOption,
  ModelAnalysis,
  PressForceCheck,
  ProcessConditionBend,
  ToolOption,
} from "@shared/sheetMetalSupport.js";

import { calcBendForcePerMeter } from "./process-condition.engine.js";
import { resolveVWidth, round1 } from "./tool-selection.engine.js";

/**
 * 必要加圧力エンジン。
 * 曲げ荷重（kN/m）× 曲げ線長さ から必要加圧力を求め、機械マスタの加圧能力と比較する。
 * 荷重は V 幅が小さいほど・曲げ線が長いほど大きくなるため、
 * 「選択された最小 V 幅 × 最長の曲げ線 × 能力が最も低い機械」で評価する。
 */

/** 能力に対する使用率がこの値を超えたら余裕不足として警告する */
const CAUTION_RATIO = 0.8;

export interface PressForceInput {
  tensileStrength: number;
  thickness: number | null;
  bends: readonly ProcessConditionBend[];
  /** 推奨 V 幅（下型が未選定のときの代替） */
  recommendedVWidth: number | null;
  lowerToolMap: Map<number, ToolOption>;
  machineMap: Map<number, MachineOption>;
  analysis: ModelAnalysis | null;
}

interface GoverningTool {
  vWidth: number | null;
  fromMaster: boolean;
  maxLoad: number | null;
}

/** 選択済み下型のうち、もっとも荷重が大きくなる（V 幅が最小の）ものを採用する */
function governingTool(input: PressForceInput): GoverningTool {
  let vWidth: number | null = null;
  let fromMaster = false;
  let maxLoad: number | null = null;

  for (const bend of input.bends) {
    if (bend.lowerToolId == null) continue;
    const tool = input.lowerToolMap.get(bend.lowerToolId);
    if (!tool) continue;
    const resolved = resolveVWidth(tool);
    if (resolved.value != null && (vWidth == null || resolved.value < vWidth)) {
      vWidth = resolved.value;
      fromMaster = resolved.fromMaster;
    }
    if (tool.maxLoad != null && (maxLoad == null || tool.maxLoad < maxLoad)) {
      maxLoad = tool.maxLoad;
    }
  }

  if (vWidth == null) {
    return { vWidth: input.recommendedVWidth, fromMaster: false, maxLoad };
  }
  return { vWidth, fromMaster, maxLoad };
}

/** 加工条件で選択された機械のうち、加圧能力が最も低いものを採用する */
function governingMachine(input: PressForceInput): MachineOption | null {
  let worst: MachineOption | null = null;
  for (const bend of input.bends) {
    if (bend.machineId == null) continue;
    const machine = input.machineMap.get(bend.machineId);
    if (!machine || machine.pressCapacity == null) continue;
    if (!worst || machine.pressCapacity < (worst.pressCapacity ?? Infinity)) {
      worst = machine;
    }
  }
  return worst;
}

/** 形状解析からもっとも長い曲げ線の長さ（mm）を取る */
function longestBendLength(analysis: ModelAnalysis | null): number | null {
  if (!analysis || analysis.bends.length === 0) return null;
  let longest: number | null = null;
  for (const bend of analysis.bends) {
    if (!Number.isFinite(bend.lengthMm)) continue;
    if (longest == null || bend.lengthMm > longest) longest = bend.lengthMm;
  }
  return longest;
}

export function evaluatePressForce(input: PressForceInput): PressForceCheck {
  const tool = governingTool(input);
  const forcePerMeter = calcBendForcePerMeter(
    input.tensileStrength,
    input.thickness,
    tool.vWidth
  );
  const bendLengthMm = longestBendLength(input.analysis);
  const machine = governingMachine(input);

  const base = {
    vWidth: tool.vWidth,
    vWidthFromMaster: tool.fromMaster,
    forcePerMeter,
    bendLengthMm,
    machineName: machine ? machine.name : null,
    machineCapacity: machine?.pressCapacity ?? null,
    toolMaxLoad: tool.maxLoad,
  };

  if (forcePerMeter == null) {
    return {
      ...base,
      level: "unknown",
      requiredForce: null,
      usageRatio: null,
      message: "板厚または V 幅が不明なため曲げ荷重を算出できません。",
    };
  }

  if (bendLengthMm == null) {
    return {
      ...base,
      level: "unknown",
      requiredForce: null,
      usageRatio: null,
      message: `曲げ荷重は ${forcePerMeter} kN/m です。曲げ線の長さが不明なため必要加圧力は算出できません（3Dモデルを登録して形状解析を実行してください）。`,
    };
  }

  const requiredForce = round1((forcePerMeter * bendLengthMm) / 1000);
  const toolOverload = tool.maxLoad != null && forcePerMeter > tool.maxLoad;

  if (machine == null || machine.pressCapacity == null) {
    return {
      ...base,
      level: toolOverload ? "over" : "unknown",
      requiredForce,
      usageRatio: null,
      message: toolOverload
        ? `曲げ荷重 ${forcePerMeter} kN/m が金型の耐圧 ${tool.maxLoad} kN/m を超えています。`
        : `曲げ長さ ${bendLengthMm} mm では必要加圧力は ${requiredForce} kN です。機械の加圧能力が未登録のため能力判定はできません（機械マスタに加圧能力を登録してください）。`,
    };
  }

  const capacity = machine.pressCapacity;
  const usageRatio = Math.round((requiredForce / capacity) * 100) / 100;
  const detail = `曲げ長さ ${bendLengthMm} mm・V 幅 ${tool.vWidth} mm で必要加圧力 ${requiredForce} kN（${machine.name} の能力 ${capacity} kN の ${Math.round(usageRatio * 100)}%）`;

  if (usageRatio > 1 || toolOverload) {
    const reason = toolOverload
      ? `${detail}。さらに曲げ荷重 ${forcePerMeter} kN/m が金型の耐圧 ${tool.maxLoad} kN/m を超えています`
      : detail;
    return { ...base, level: "over", requiredForce, usageRatio, message: `${reason}。` };
  }

  if (usageRatio >= CAUTION_RATIO) {
    return {
      ...base,
      level: "caution",
      requiredForce,
      usageRatio,
      message: `${detail}。能力の余裕が少ないため、V 幅を大きくするか能力の大きい機械を検討してください。`,
    };
  }

  return { ...base, level: "ok", requiredForce, usageRatio, message: `${detail}。` };
}

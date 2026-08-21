import type { ToolOption } from "@shared/sheetMetalSupport.js";
import { isToolUsableOnMachine } from "@shared/sheetMetalSupport.js";

import type { MaterialSpec } from "./materials.js";

/**
 * 金型選定エンジン。
 * 板厚と材質から推奨ダイ V 幅・推奨内側曲げ R・最小フランジ長を算出し、
 * 金型マスタ（下型）の V 幅と突き合わせて候補を提示する。
 */

/** 実務で流通する標準ダイ V 幅（mm） */
const STANDARD_V_WIDTHS: readonly number[] = [
  4, 5, 6, 8, 10, 12, 14, 16, 20, 25, 30, 35, 40, 50, 60, 80, 100,
];

/** 板厚に対する V 幅倍率（薄板 6t / 中板 8t / 厚板 10t） */
function vWidthFactor(thickness: number): number {
  if (thickness <= 3) return 6;
  if (thickness <= 8) return 8;
  return 10;
}

function snapToStandard(value: number): number {
  let nearest = STANDARD_V_WIDTHS[0];
  let minDiff = Math.abs(value - nearest);
  for (const candidate of STANDARD_V_WIDTHS) {
    const diff = Math.abs(value - candidate);
    if (diff < minDiff) {
      nearest = candidate;
      minDiff = diff;
    }
  }
  return nearest;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 推奨ダイ V 幅（mm）。板厚が不明なら null。 */
export function recommendVWidth(thickness: number | null): number | null {
  if (thickness == null || thickness <= 0) return null;
  return snapToStandard(thickness * vWidthFactor(thickness));
}

/** 推奨内側曲げ R（mm）。V 幅 × 材質係数。 */
export function recommendInnerRadius(vWidth: number | null, spec: MaterialSpec): number | null {
  if (vWidth == null) return null;
  return round1(vWidth * spec.vRadiusFactor);
}

/** 最小フランジ長（mm）。ダイ肩に乗るための目安 0.7V。 */
export function minFlangeLength(vWidth: number | null): number | null {
  if (vWidth == null) return null;
  return round1(vWidth * 0.7);
}

/** 材質と板厚から決まる最小内側曲げ R（mm）。これを下回ると割れの恐れがある。 */
export function minInnerRadius(thickness: number | null, spec: MaterialSpec): number | null {
  if (thickness == null || thickness <= 0) return null;
  return round1(thickness * spec.minBendRadiusFactor);
}

/** 金型の名称・コードから V 幅（mm）を読み取る（例: "V12", "12V", "ダイ V-16"）。 */
function parseVWidthFromText(tool: ToolOption): number | null {
  for (const text of [tool.code, tool.name]) {
    if (!text) continue;
    const prefixed = text.match(/V\s*[-_]?\s*(\d+(?:\.\d+)?)/i);
    if (prefixed) return Number(prefixed[1]);
    const suffixed = text.match(/(\d+(?:\.\d+)?)\s*V\b/i);
    if (suffixed) return Number(suffixed[1]);
  }
  return null;
}

/** 下型の V 幅（mm）とその出典。マスタ登録値を優先し、未登録なら名称から推定する。 */
export function resolveVWidth(tool: ToolOption): {
  value: number | null;
  fromMaster: boolean;
} {
  if (tool.vWidth != null && tool.vWidth > 0) {
    return { value: tool.vWidth, fromMaster: true };
  }
  return { value: parseVWidthFromText(tool), fromMaster: false };
}

/** 下型の V 幅（mm）。マスタ未登録の場合は名称からの推定値。 */
export function extractVWidth(tool: ToolOption): number | null {
  return resolveVWidth(tool).value;
}

/**
 * 推奨 V 幅に最も近い下型マスタを返す（V 幅が分からない金型が無ければ null）。
 * 差が同じ場合はマスタに V 幅が登録されている金型を優先する。
 * 機械を指定した場合は、その機械に取り付けられる金型だけを候補にする。
 */
export function suggestLowerTool(
  vWidth: number | null,
  lowerTools: readonly ToolOption[],
  machineId: number | null = null
): ToolOption | null {
  if (vWidth == null) return null;
  let best: ToolOption | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  let bestFromMaster = false;
  for (const tool of lowerTools) {
    if (!isToolUsableOnMachine(tool, machineId)) continue;
    const { value, fromMaster } = resolveVWidth(tool);
    if (value == null) continue;
    const diff = Math.abs(value - vWidth);
    if (diff < bestDiff || (diff === bestDiff && fromMaster && !bestFromMaster)) {
      best = tool;
      bestDiff = diff;
      bestFromMaster = fromMaster;
    }
  }
  return best;
}

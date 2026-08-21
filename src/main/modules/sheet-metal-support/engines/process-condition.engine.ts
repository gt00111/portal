import type { ProcessConditionBend, ToolOption } from "@shared/sheetMetalSupport.js";

import type { MaterialSpec } from "./materials.js";
import {
  minFlangeLength,
  recommendInnerRadius,
  recommendVWidth,
  round1,
  suggestLowerTool,
} from "./tool-selection.engine.js";

/**
 * 加工条件生成エンジン。
 * 曲げ 1 ステップごとに推奨 V 幅・推奨内 R・最小フランジ長・曲げ荷重を算出する。
 */

export interface ConditionContext {
  thickness: number | null;
  spec: MaterialSpec;
  lowerTools: readonly ToolOption[];
}

export interface GeneratedBendCondition {
  bendSequence: number;
  recommendedVWidth: number | null;
  recommendedInnerRadius: number | null;
  minFlangeLength: number | null;
  bendForcePerMeter: number | null;
  suggestedLowerToolName: string | null;
}

/**
 * 曲げ荷重（kN / 曲げ長さ 1m あたり）。
 * P = 1.33 × 引張強さ × 板厚² / ダイ V 幅（曲げ長さ 1000mm 換算）
 */
export function calcBendForcePerMeter(
  tensileStrength: number,
  thickness: number | null,
  vWidth: number | null
): number | null {
  if (thickness == null || thickness <= 0) return null;
  if (vWidth == null || vWidth <= 0) return null;
  return round1((1.33 * tensileStrength * thickness * thickness) / vWidth);
}

export function generateBendCondition(
  bend: ProcessConditionBend,
  ctx: ConditionContext
): GeneratedBendCondition {
  const vWidth = recommendVWidth(ctx.thickness);
  const suggested = suggestLowerTool(vWidth, ctx.lowerTools, bend.machineId);
  return {
    bendSequence: bend.bendSequence,
    recommendedVWidth: vWidth,
    recommendedInnerRadius: recommendInnerRadius(vWidth, ctx.spec),
    minFlangeLength: minFlangeLength(vWidth),
    bendForcePerMeter: calcBendForcePerMeter(ctx.spec.tensileStrength, ctx.thickness, vWidth),
    suggestedLowerToolName: suggested ? suggested.name : null,
  };
}

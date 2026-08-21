import type {
  BendSequencePlan,
  MachineOption,
  ModelAnalysis,
  OpeningHeightCheck,
  ProcessConditionBend,
  StackHeightByBend,
  StackHeightCheck,
  ToolHolderOption,
  ToolOption,
  ToolStack,
} from "@shared/sheetMetalSupport.js";

import { round1 } from "./geometry.js";

/**
 * 金型スタック（中間板・ダイホルダー＋パンチ／ダイ）の高さ・耐圧をまとめる。
 * 開口高さ判定と必要加圧力の耐圧ボトルネックに使う。
 */

/** ワークを抜くために、立ち上がり高さに足す余裕（mm） */
const EXTRACT_CLEARANCE_MM = 10;
/** 残り開口がフランジ＋この倍率未満なら余裕不足 */
const CAUTION_FLANGE_FACTOR = 1.5;

export interface StackLoadLimit {
  maxLoad: number | null;
  name: string | null;
}

export interface OpeningHeightInput {
  stack: ToolStack;
  bends: readonly ProcessConditionBend[];
  holderMap: Map<number, ToolHolderOption>;
  upperToolMap: Map<number, ToolOption>;
  lowerToolMap: Map<number, ToolOption>;
  machineMap: Map<number, MachineOption>;
  analysis: ModelAnalysis | null;
  plan: BendSequencePlan | null;
}

interface HeightPart {
  name: string;
  height: number | null;
}

function holderParts(
  items: readonly { holderId: number }[],
  holderMap: Map<number, ToolHolderOption>
): HeightPart[] {
  return items.map((item) => {
    const holder = holderMap.get(item.holderId);
    return {
      name: holder?.name ?? `ホルダー#${item.holderId}`,
      height: holder?.toolHeight ?? null,
    };
  });
}

function sumKnown(parts: readonly HeightPart[]): number {
  return parts.reduce((sum, part) => sum + (part.height ?? 0), 0);
}

function missingNames(parts: readonly HeightPart[]): string[] {
  return parts.filter((part) => part.height == null).map((part) => part.name);
}

/** スタックと選択金型のうち、耐圧がもっとも低いものを返す */
export function stackMaxLoad(
  stack: ToolStack,
  bends: readonly ProcessConditionBend[],
  holderMap: Map<number, ToolHolderOption>,
  upperToolMap: Map<number, ToolOption>,
  lowerToolMap: Map<number, ToolOption>
): StackLoadLimit {
  const candidates: { name: string; maxLoad: number }[] = [];
  const push = (name: string, maxLoad: number | null): void => {
    if (maxLoad == null) return;
    candidates.push({ name, maxLoad });
  };

  for (const item of [...stack.upper, ...stack.lower]) {
    const holder = holderMap.get(item.holderId);
    if (holder) push(holder.name, holder.maxLoad);
  }
  for (const bend of bends) {
    if (bend.upperToolId != null) {
      const tool = upperToolMap.get(bend.upperToolId);
      if (tool) push(tool.name, tool.maxLoad);
    }
    if (bend.lowerToolId != null) {
      const tool = lowerToolMap.get(bend.lowerToolId);
      if (tool) push(tool.name, tool.maxLoad);
    }
  }

  if (candidates.length === 0) return { maxLoad: null, name: null };
  let worst = candidates[0];
  for (const candidate of candidates) {
    if (candidate.maxLoad < worst.maxLoad) worst = candidate;
  }
  return { maxLoad: worst.maxLoad, name: worst.name };
}

/** 形状解析・推奨曲げ順から、もっとも高い立ち上がり（mm）を取る */
function maxFlangeHeight(
  analysis: ModelAnalysis | null,
  plan: BendSequencePlan | null
): number | null {
  let tallest: number | null = null;
  const consider = (value: number | null | undefined): void => {
    if (value == null || !Number.isFinite(value)) return;
    if (tallest == null || value > tallest) tallest = value;
  };
  if (plan) {
    for (const step of plan.steps) consider(step.flangeLengthMm);
  }
  if (tallest == null && analysis?.boundingBox) {
    const { min, max } = analysis.boundingBox;
    consider(max[0] - min[0]);
    consider(max[1] - min[1]);
    consider(max[2] - min[2]);
  }
  return tallest == null ? null : round1(tallest);
}

function governingMachine(
  bends: readonly ProcessConditionBend[],
  machineMap: Map<number, MachineOption>
): MachineOption | null {
  let worst: MachineOption | null = null;
  for (const bend of bends) {
    if (bend.machineId == null) continue;
    const machine = machineMap.get(bend.machineId);
    if (!machine || machine.openHeight == null) continue;
    if (!worst || machine.openHeight < (worst.openHeight ?? Infinity)) {
      worst = machine;
    }
  }
  return worst;
}

/**
 * 開口高さ判定。
 * 機械の開口 −（中間板＋パンチ＋ダイホルダー＋ダイ）が、立ち上がり＋抜き代を下回ると抜けない。
 */
export function evaluateOpeningHeight(input: OpeningHeightInput): OpeningHeightCheck {
  const upperHolders = holderParts(input.stack.upper, input.holderMap);
  const lowerHolders = holderParts(input.stack.lower, input.holderMap);

  let maxUpper = sumKnown(upperHolders);
  let maxLower = sumKnown(lowerHolders);
  const missing = new Set<string>([
    ...missingNames(upperHolders),
    ...missingNames(lowerHolders),
  ]);

  const bends = input.bends.length > 0 ? input.bends : [null];
  for (const bend of bends) {
    const punch =
      bend?.upperToolId != null ? input.upperToolMap.get(bend.upperToolId) : undefined;
    const die =
      bend?.lowerToolId != null ? input.lowerToolMap.get(bend.lowerToolId) : undefined;
    if (bend?.upperToolId != null && !punch) missing.add(`上型#${bend.upperToolId}`);
    if (bend?.lowerToolId != null && !die) missing.add(`下型#${bend.lowerToolId}`);
    if (punch && punch.toolHeight == null) missing.add(punch.name);
    if (die && die.toolHeight == null) missing.add(die.name);

    const upper = sumKnown(upperHolders) + (punch?.toolHeight ?? 0);
    const lower = sumKnown(lowerHolders) + (die?.toolHeight ?? 0);
    if (upper > maxUpper) maxUpper = upper;
    if (lower > maxLower) maxLower = lower;
  }

  const combined = round1(maxUpper + maxLower);
  const missingList = [...missing];
  const machine = governingMachine(input.bends, input.machineMap);
  const flange = maxFlangeHeight(input.analysis, input.plan);
  const openHeight = machine?.openHeight ?? null;
  const remaining = openHeight != null ? round1(openHeight - combined) : null;
  const strokeLength = machine?.strokeLength ?? null;

  const base = {
    upperHeight: round1(maxUpper),
    lowerHeight: round1(maxLower),
    combinedHeight: combined,
    openHeight,
    remaining,
    maxFlangeHeight: flange,
    strokeLength,
    machineName: machine ? machine.name : null,
    missingHeights: missingList,
  };

  if (openHeight == null) {
    return {
      ...base,
      level: "unknown",
      message:
        combined > 0
          ? `金型・ホルダーの合計高さは ${combined}mm です。機械マスタに開口高さを登録すると、ワークが抜けるかを判定できます。`
          : "機械マスタに開口高さを登録すると、金型スタックが開口に収まるかを判定できます。",
    };
  }

  if (combined > openHeight) {
    const extras = missingList.length > 0 ? `（未登録の型高さ ${missingList.join("・")} は含めていません）` : "";
    return {
      ...base,
      level: "over",
      message: `${machine?.name ?? "機械"} の開口 ${openHeight}mm に対し、金型・ホルダーの合計が ${combined}mm あり収まりません${extras}。中間板・ホルダーの段数を減らすか、型高さの低い金型を検討してください。`,
    };
  }

  if (flange != null && remaining != null && remaining < flange + EXTRACT_CLEARANCE_MM) {
    return {
      ...base,
      level: "over",
      message: `開口の残り ${remaining}mm では、立ち上がり約 ${flange}mm のワークを抜けません（抜き代 ${EXTRACT_CLEARANCE_MM}mm を含む）。ホルダーの段数を減らすか、開口の大きい機械を検討してください。`,
    };
  }

  if (
    strokeLength != null &&
    flange != null &&
    strokeLength < flange + EXTRACT_CLEARANCE_MM
  ) {
    return {
      ...base,
      level: "caution",
      message: `ストローク ${strokeLength}mm が立ち上がり約 ${flange}mm に対して短く、ラム上昇だけではワークを抜けない恐れがあります。`,
    };
  }

  if (flange != null && remaining != null && remaining < flange * CAUTION_FLANGE_FACTOR + EXTRACT_CLEARANCE_MM) {
    return {
      ...base,
      level: "caution",
      message: `開口の残り ${remaining}mm に対し立ち上がり約 ${flange}mm で、抜きの余裕が少ないです。`,
    };
  }

  if (missingList.length > 0) {
    return {
      ...base,
      level: "unknown",
      message: `判明している合計は ${combined}mm（開口 ${openHeight}mm・残り ${remaining}mm）です。型高さが未登録のため確定できません（${missingList.join("・")}）。`,
    };
  }

  if (remaining != null) {
    const flangeNote = flange != null ? `立ち上がり約 ${flange}mm に対し、` : "";
    return {
      ...base,
      level: "ok",
      message: `${machine?.name ?? "機械"} の開口 ${openHeight}mm、金型合計 ${combined}mm、残り ${remaining}mm。${flangeNote}ワークは抜けます。`,
    };
  }

  return {
    ...base,
    level: "unknown",
    message: "開口高さを判定できませんでした。",
  };
}

export interface StackHeightInput {
  stack: ToolStack;
  bends: readonly ProcessConditionBend[];
  holderMap: Map<number, ToolHolderOption>;
  upperToolMap: Map<number, ToolOption>;
  lowerToolMap: Map<number, ToolOption>;
}

function bendStackHeights(
  stack: ToolStack,
  bend: ProcessConditionBend | null,
  holderMap: Map<number, ToolHolderOption>,
  upperToolMap: Map<number, ToolOption>,
  lowerToolMap: Map<number, ToolOption>
): { upper: number | null; lower: number | null; missing: string[] } {
  const upperHolders = holderParts(stack.upper, holderMap);
  const lowerHolders = holderParts(stack.lower, holderMap);
  const missing = new Set<string>([
    ...missingNames(upperHolders),
    ...missingNames(lowerHolders),
  ]);

  const punch =
    bend?.upperToolId != null ? upperToolMap.get(bend.upperToolId) : undefined;
  const die =
    bend?.lowerToolId != null ? lowerToolMap.get(bend.lowerToolId) : undefined;
  if (bend?.upperToolId != null && !punch) missing.add(`上型#${bend.upperToolId}`);
  if (bend?.lowerToolId != null && !die) missing.add(`下型#${bend.lowerToolId}`);
  if (punch && punch.toolHeight == null) missing.add(punch.name);
  if (die && die.toolHeight == null) missing.add(die.name);

  const upperComplete = missingNames(upperHolders).length === 0 && (bend?.upperToolId == null || punch?.toolHeight != null);
  const lowerComplete = missingNames(lowerHolders).length === 0 && (bend?.lowerToolId == null || die?.toolHeight != null);

  const upper = upperComplete
    ? round1(sumKnown(upperHolders) + (punch?.toolHeight ?? 0))
    : null;
  const lower = lowerComplete
    ? round1(sumKnown(lowerHolders) + (die?.toolHeight ?? 0))
    : null;

  return { upper, lower, missing: [...missing] };
}

/** 工程ごとの金型スタック合計高さと、工程間の段替え要否を評価する */
export function evaluateStackHeights(input: StackHeightInput): StackHeightCheck {
  const bends = input.bends.length > 0 ? input.bends : [null];
  const byBend: StackHeightByBend[] = [];
  const allMissing = new Set<string>();
  const combinedHeights: number[] = [];

  for (const bend of bends) {
    const { upper, lower, missing } = bendStackHeights(
      input.stack,
      bend,
      input.holderMap,
      input.upperToolMap,
      input.lowerToolMap
    );
    for (const name of missing) allMissing.add(name);
    const combined =
      upper != null && lower != null ? round1(upper + lower) : null;
    if (combined != null) combinedHeights.push(combined);
    byBend.push({
      bendSequence: bend?.bendSequence ?? 0,
      upperHeight: upper,
      lowerHeight: lower,
      combinedHeight: combined,
    });
  }

  const missingList = [...allMissing];
  if (combinedHeights.length <= 1) {
    const only = byBend[0];
    return {
      level: missingList.length > 0 ? "unknown" : "ok",
      byBend,
      spread: 0,
      missingHeights: missingList,
      message:
        missingList.length > 0
          ? `金型合計高さは判明分 ${only?.combinedHeight ?? "—"}mm です。型高さ未登録（${missingList.join("・")}）のため工程間の段替え要否は確定できません。`
          : byBend.length <= 1
            ? `金型スタック合計は ${only?.combinedHeight ?? "—"}mm です。`
            : "工程間の金型合計高さに差はありません。",
    };
  }

  const min = Math.min(...combinedHeights);
  const max = Math.max(...combinedHeights);
  const spread = round1(max - min);

  if (spread > 0) {
    const detail = byBend
      .filter((row) => row.combinedHeight != null)
      .map((row) => `No.${row.bendSequence} ${row.combinedHeight}mm`)
      .join("・");
    return {
      level: "change",
      byBend,
      spread,
      missingHeights: missingList,
      message: `工程間で金型合計高さが ${spread}mm 異なります（${detail}）。段替えまたは中間板で高さを揃える必要があります。`,
    };
  }

  return {
    level: missingList.length > 0 ? "unknown" : "ok",
    byBend,
    spread: 0,
    missingHeights: missingList,
    message:
      missingList.length > 0
        ? `工程間の合計高さに差はありませんが、型高さ未登録（${missingList.join("・")}）があります。`
        : "工程間の金型合計高さは揃っています。",
  };
}

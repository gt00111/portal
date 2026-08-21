import type { BendSequencePlan, ToolOption } from "@shared/sheetMetalSupport.js";
import { isToolUsableOnMachine } from "@shared/sheetMetalSupport.js";

import type { ScoreInput } from "./process-score.engine.js";
import { minInnerRadius, suggestLowerTool } from "./tool-selection.engine.js";

/**
 * 改善案生成エンジン。
 * 加工性評価と同じ入力を再評価し、指摘に対する具体的な対処を文章化する。
 * 「点数と理由」に対する「次の行動」を必ず 1 対 1 で返せるようにする。
 */

const BEND_COUNT_WARN = 6;
const THICKNESS_HEAVY = 6;
const THICKNESS_THIN = 0.5;
const SHARP_ANGLE_DEG = 30;

function formatSequences(sequences: readonly number[]): string {
  return sequences.map((s) => `No.${s}`).join("・");
}

export interface RecommendContext extends ScoreInput {
  lowerTools: readonly ToolOption[];
  plan: BendSequencePlan | null;
}

/** 形状解析・干渉判定に基づく改善案 */
function geometryItems(ctx: RecommendContext): string[] {
  const items: string[] = [];
  const analysis = ctx.analysis;
  if (!analysis) {
    items.push(
      "「シミュレーション」タブで STEP モデルを登録すると、曲げ線検出・曲げ順の自動生成・干渉判定が有効になります。"
    );
    return items;
  }

  if (
    analysis.thickness != null &&
    ctx.thickness != null &&
    Math.abs(analysis.thickness - ctx.thickness) > 0.2
  ) {
    items.push(
      `形状から推定した板厚は ${analysis.thickness}mm です。加工条件の板厚 ${ctx.thickness}mm が正しいか確認してください。`
    );
  }
  if (ctx.bends.length === 0 && analysis.bends.length > 0) {
    items.push(
      `形状から曲げを ${analysis.bends.length} 箇所検出しました。推奨曲げ順を参考に「加工条件」タブへ登録してください。`
    );
  } else if (ctx.bends.length > 0 && analysis.bends.length !== ctx.bends.length) {
    items.push(
      `加工条件の曲げ順（${ctx.bends.length} 箇所）を、形状の検出結果（${analysis.bends.length} 箇所）と突き合わせてください。`
    );
  }

  const errors = ctx.interference?.items.filter((item) => item.severity === "error") ?? [];
  if (errors.length > 0) {
    items.push(
      `干渉の恐れがある工程が ${errors.length} 件あります。推奨曲げ順の入れ替え、または金型・機械の変更を検討してください。`
    );
  }
  return items;
}

/** 機械専用の金型を別の機械で選んでいる場合の改善案 */
function toolCompatibilityItems(ctx: RecommendContext): string[] {
  const items: string[] = [];
  for (const bend of ctx.bends) {
    if (bend.machineId == null) continue;
    const machineName = ctx.machineMap.get(bend.machineId)?.name ?? "選択した機械";
    const lower = bend.lowerToolId != null ? ctx.lowerToolMap.get(bend.lowerToolId) : undefined;
    if (lower && !isToolUsableOnMachine(lower, bend.machineId)) {
      const vWidth = ctx.generated.get(bend.bendSequence)?.recommendedVWidth ?? null;
      const alternative = suggestLowerTool(vWidth, ctx.lowerTools, bend.machineId);
      items.push(
        alternative
          ? `曲げ No.${bend.bendSequence} の下型「${lower.name}」は ${machineName} に付きません。「${alternative.name}」への変更、または機械の変更を検討してください。`
          : `曲げ No.${bend.bendSequence} の下型「${lower.name}」は ${machineName} に付きません。${machineName} に付く下型が金型マスタに登録されていないため、金型マスタの対応機械を確認してください。`
      );
    }
    const upper = bend.upperToolId != null ? ctx.upperToolMap.get(bend.upperToolId) : undefined;
    if (upper && !isToolUsableOnMachine(upper, bend.machineId)) {
      items.push(
        `曲げ No.${bend.bendSequence} の上型「${upper.name}」は ${machineName} に付きません。${machineName} に対応する上型へ変更してください。`
      );
    }
  }
  return items;
}

/** 必要加圧力に基づく改善案 */
function pressForceItems(ctx: RecommendContext): string[] {
  const press = ctx.pressForce;
  if (!press) return [];
  const items: string[] = [];

  if (press.level === "over") {
    if (press.machineCapacity != null && press.requiredForce != null) {
      items.push(
        `必要加圧力 ${press.requiredForce}kN が機械「${press.machineName}」の加圧能力 ${press.machineCapacity}kN を超えます。V 幅を 1 段大きくする・曲げ長さを分割する・能力の大きい機械へ変更する、のいずれかを検討してください。`
      );
    }
    if (press.toolMaxLoad != null && press.forcePerMeter != null && press.forcePerMeter > press.toolMaxLoad) {
      items.push(
        `曲げ荷重 ${press.forcePerMeter}kN/m が金型の耐圧 ${press.toolMaxLoad}kN/m を超えます。耐圧の高い金型へ変更してください。`
      );
    }
  } else if (press.level === "caution" && press.requiredForce != null) {
    items.push(
      `必要加圧力 ${press.requiredForce}kN は機械「${press.machineName}」の能力に対して余裕が少ないため、V 幅を大きくして荷重を下げることを検討してください。`
    );
  } else if (press.level === "unknown") {
    if (press.requiredForce != null && press.machineCapacity == null) {
      items.push(
        "機械マスタに加圧能力（kN）を登録すると、必要加圧力が機械の能力内かどうかを自動判定できます。"
      );
    } else if (press.bendLengthMm == null && ctx.analysis != null) {
      items.push(
        "形状から曲げ線の長さを取得できませんでした。STEP モデルを再登録して形状解析をやり直してください。"
      );
    }
  }

  if (press.vWidth != null && !press.vWidthFromMaster && ctx.bends.some((b) => b.lowerToolId != null)) {
    items.push(
      "下型マスタに V 幅（mm）を登録すると、金型選定と曲げ荷重の計算精度が上がります（現在は名称・推奨値から推定しています）。"
    );
  }
  return items;
}

export function recommend(ctx: RecommendContext): string[] {
  const items: string[] = [];

  if (ctx.thickness == null || ctx.thickness <= 0) {
    items.push("「加工条件」タブで板厚を入力すると、金型選定と曲げ荷重を算出できます。");
  }
  if (!ctx.materialResolved) {
    items.push(
      "材質を SPCC・SPHC・SUS304・A5052 などの規格表記で入力すると、材質固有の引張強さで再計算されます。"
    );
  }
  if (ctx.bends.length === 0) {
    items.push("「加工条件」タブで曲げ順を登録すると、工程ごとの判定が可能になります。");
    return [...items, ...geometryItems(ctx)];
  }
  if (ctx.bends.length > BEND_COUNT_WARN) {
    items.push(
      `曲げ回数が ${ctx.bends.length} 回あります。形状の一体化や抜き形状の見直しで曲げ回数の削減を検討してください。`
    );
  }

  const minR = minInnerRadius(ctx.thickness, ctx.spec);
  const radiusShortage: number[] = [];
  const radiusMissing: number[] = [];
  const sharpAngles: number[] = [];
  const lowerMissing: number[] = [];
  const upperMissing: number[] = [];
  const machineMissing: number[] = [];

  for (const bend of ctx.bends) {
    const seq = bend.bendSequence;
    if (bend.bendRadius == null) radiusMissing.push(seq);
    else if (minR != null && bend.bendRadius < minR) radiusShortage.push(seq);
    if (bend.angle != null && bend.angle < SHARP_ANGLE_DEG) sharpAngles.push(seq);
    if (bend.lowerToolId == null) lowerMissing.push(seq);
    if (bend.upperToolId == null) upperMissing.push(seq);
    if (bend.machineId == null) machineMissing.push(seq);
  }

  if (radiusShortage.length > 0 && minR != null) {
    items.push(
      `曲げ ${formatSequences(radiusShortage)} の曲げ R を ${minR}mm 以上に変更してください（${ctx.spec.label} の最小曲げ R）。`
    );
  }
  if (radiusMissing.length > 0) {
    const recommended = ctx.generated.get(radiusMissing[0])?.recommendedInnerRadius;
    const hint = recommended != null ? `（推奨 ${recommended}mm）` : "";
    items.push(`曲げ ${formatSequences(radiusMissing)} の曲げ R を入力してください${hint}。`);
  }
  if (sharpAngles.length > 0) {
    items.push(
      `曲げ ${formatSequences(sharpAngles)} は鋭角です。専用金型の使用、または二段曲げへの分割を検討してください。`
    );
  }
  if (lowerMissing.length > 0) {
    const vWidth = ctx.generated.get(lowerMissing[0])?.recommendedVWidth ?? null;
    const machineId = ctx.bends.find((b) => b.bendSequence === lowerMissing[0])?.machineId ?? null;
    const suggested = suggestLowerTool(vWidth, ctx.lowerTools, machineId);
    const hint =
      vWidth == null
        ? ""
        : suggested
          ? `（推奨 V 幅 ${vWidth}mm・候補「${suggested.name}」）`
          : `（推奨 V 幅 ${vWidth}mm。該当する下型が金型マスタに未登録です）`;
    items.push(`曲げ ${formatSequences(lowerMissing)} の下型を選定してください${hint}。`);
  }
  if (upperMissing.length > 0) {
    items.push(`曲げ ${formatSequences(upperMissing)} の上型を選定してください。`);
  }
  if (machineMissing.length > 0) {
    items.push(
      `曲げ ${formatSequences(machineMissing)} の使用機械を選定すると、機械別の加工履歴と突き合わせできます。`
    );
  }

  const maxForce = Math.max(
    0,
    ...[...ctx.generated.values()].map((g) => g.bendForcePerMeter ?? 0)
  );
  const pressEvaluated = ctx.pressForce?.requiredForce != null;
  if (!pressEvaluated && ctx.thickness != null && ctx.thickness >= THICKNESS_HEAVY && maxForce > 0) {
    items.push(
      `厚板のため曲げ荷重が最大 ${maxForce}kN/m になります。曲げ長さを掛けた必要トン数を満たす機械を選定してください。`
    );
  }
  if (ctx.thickness != null && ctx.thickness > 0 && ctx.thickness <= THICKNESS_THIN) {
    items.push(
      "薄板のため、バックゲージ位置と押さえ圧の見直しにより曲げ寸法のばらつきを抑えてください。"
    );
  }

  items.push(...toolCompatibilityItems(ctx));
  items.push(...pressForceItems(ctx));
  items.push(...geometryItems(ctx));

  if (items.length === 0) {
    items.push("現在の加工条件で問題は検出されませんでした。");
  }
  return items;
}

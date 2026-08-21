import type {
  BendSequencePlan,
  InterferenceCheck,
  InterferenceItem,
  ModelAnalysis,
  ToolHolderOption,
} from "@shared/sheetMetalSupport.js";

import {
  checkDieClearance,
  describeDieHit,
  findHolderWithLessOffset,
  hasDieClearanceDimensions,
  type DieStackProfile,
} from "./die-profile.js";

import { axisDistance, isParallel, round1 } from "./geometry.js";
import {
  checkClearance,
  describeHit,
  findPunchWithRelief,
  hasClearanceDimensions,
  type PunchProfile,
} from "./punch-profile.js";

/**
 * 干渉判定エンジン。
 *
 * 3D の厳密な衝突計算ではなく、形状解析で得た曲げ線の寸法関係と
 * パンチ断面の近似から、現場で問題になりやすい以下を検出する。
 * 1. ダイに乗らないフランジ（最小フランジ長を下回る）
 * 2. 先に曲げた立ち上がりがパンチに当たる（型式・逃げ寸法で判定）
 * 3. 曲げ線どうしが近すぎて、立ち上がりがダイに干渉する
 * 4. 立ち上がりが高く、ラム・機械フレームと干渉する恐れ
 */

/** ラム側との干渉を注意喚起する立ち上がり高さ（mm） */
const TALL_FLANGE_MM = 150;
/** 立ち上がりとみなす曲げ角度（度） */
const UPRIGHT_ANGLE_DEG = 60;
/** 下向きフランジとみなす曲げ角度（度）。鈍角曲げでテーブル側へ倒れる */
const DOWNWARD_ANGLE_DEG = 100;

export interface InterferenceContext {
  /** 金型選定エンジンが算出した最小フランジ長（mm） */
  minFlangeLength: number | null;
  /** 推奨ダイ V 幅（mm） */
  recommendedVWidth: number | null;
  /** 加工順ごとに選択されたパンチ（未選定の順は含まない） */
  punchByOrder: Map<number, PunchProfile>;
  /** 代替パンチを提案するための候補（その機械に付くものだけ） */
  punchCandidates: readonly PunchProfile[];
  /** 下型スタック（ダイホルダー）の干渉判定用 */
  dieProfile: DieStackProfile;
  /** 張り出しの小さいダイホルダー候補 */
  holderCandidates: readonly ToolHolderOption[];
  /** 現在積んでいるホルダー ID（代替案の除外用） */
  stackedHolderIds: readonly number[];
}

export function evaluateInterference(
  plan: BendSequencePlan,
  analysis: ModelAnalysis,
  ctx: InterferenceContext
): InterferenceCheck {
  if (plan.steps.length === 0) {
    return {
      level: "unknown",
      summary: "曲げ部を検出できないため、干渉判定を実施できませんでした。",
      items: [],
    };
  }

  const items: InterferenceItem[] = [];
  const bendByIndex = new Map(analysis.bends.map((bend) => [bend.index, bend]));
  /** パンチ寸法が未登録で判定を見送った回数 */
  let skippedForMissingDimensions = 0;
  /** パンチ断面での当たり判定を実施できた回数 */
  let concreteChecks = 0;
  /** ダイホルダー張り出しでの当たり判定を実施できた回数 */
  let dieChecks = 0;
  let skippedDieForMissingDimensions = 0;

  for (const step of plan.steps) {
    if (ctx.minFlangeLength != null && step.flangeLengthMm != null) {
      if (step.flangeLengthMm < ctx.minFlangeLength) {
        items.push({
          order: step.order,
          severity: "error",
          message: `推定フランジ長 ${step.flangeLengthMm}mm が最小フランジ長 ${ctx.minFlangeLength}mm を下回るため、ダイに乗らず加工できない恐れがあります。`,
        });
      } else if (step.flangeLengthMm < ctx.minFlangeLength * 1.3) {
        items.push({
          order: step.order,
          severity: "warn",
          message: `推定フランジ長 ${step.flangeLengthMm}mm が最小フランジ長 ${ctx.minFlangeLength}mm に近く、位置決めの余裕がありません。`,
        });
      }
    }

    // 先に曲げた立ち上がりが、この工程でパンチ・ダイに干渉しないか
    const current = bendByIndex.get(step.detectedIndex);
    if (!current) continue;
    const punch = ctx.punchByOrder.get(step.order);

    for (const earlier of plan.steps) {
      if (earlier.order >= step.order) continue;
      const other = bendByIndex.get(earlier.detectedIndex);
      if (!other) continue;
      if (earlier.angleDeg < UPRIGHT_ANGLE_DEG && earlier.angleDeg < DOWNWARD_ANGLE_DEG) continue;
      // 平行でない曲げ線どうしは交差しうるため、線間距離では干渉を判断できない
      if (!isParallel(current, other)) continue;

      const distance = round1(axisDistance(current, other));
      const height = earlier.flangeLengthMm;

      // パンチ断面での当たり判定（寸法が登録されている場合のみ）
      if (punch && height != null) {
        if (!hasClearanceDimensions(punch)) {
          skippedForMissingDimensions += 1;
        } else {
          concreteChecks += 1;
          const result = checkClearance(punch, distance, height);
          if (result.verdict === "hit-tip" || result.verdict === "hit-body") {
            const alternative = findPunchWithRelief(
              ctx.punchCandidates,
              distance,
              height,
              punch.toolId
            );
            const remedy = alternative
              ? `逃げのある「${alternative.toolName}」に変更すれば加工できます。`
              : "この立ち上がりを逃がせるパンチが金型マスタに見つかりません。曲げ順の入れ替えか、逃げのあるパンチの手配を検討してください。";
            items.push({
              order: step.order,
              severity: "error",
              message: `曲げ ${other.index} の立ち上がりが干渉します。${describeHit(punch, result, distance, height)}${remedy}`,
            });
          } else if (result.insideRelief && result.marginMm != null && result.marginMm < 3) {
            items.push({
              order: step.order,
              severity: "warn",
              message: `曲げ ${other.index} の立ち上がり ${round1(height)}mm はパンチ「${punch.toolName}」の逃げにぎりぎり収まっています（余裕 ${result.marginMm}mm）。板厚や曲げ R のばらつきで当たる恐れがあります。`,
            });
          }
        }
      }

      // ダイホルダー上面張り出しでの当たり判定
      const extent = height;
      const downward = earlier.angleDeg >= DOWNWARD_ANGLE_DEG;
      const upright = earlier.angleDeg >= UPRIGHT_ANGLE_DEG;
      if (extent != null && (upright || downward)) {
        if (!hasDieClearanceDimensions(ctx.dieProfile)) {
          skippedDieForMissingDimensions += 1;
        } else {
          dieChecks += 1;
          const dieResult = checkDieClearance(ctx.dieProfile, distance, extent);
          if (dieResult.verdict === "hit") {
            const alternative = findHolderWithLessOffset(
              ctx.holderCandidates,
              distance,
              ctx.stackedHolderIds
            );
            const remedy = alternative
              ? `張り出しの小さい「${alternative.name}」（${alternative.topOffset}mm）への変更、またはダイホルダーの段数を見直してください。`
              : "テーブル干渉を逃がすには、張り出しの小さいダイホルダーへの変更か、曲げ順の入れ替えを検討してください。";
            items.push({
              order: step.order,
              severity: "error",
              message: `曲げ ${other.index} のフランジがダイホルダーと干渉します。${describeDieHit(ctx.dieProfile, dieResult, distance, extent, downward)}${remedy}`,
            });
          } else if (dieResult.marginMm != null && dieResult.marginMm < 3) {
            items.push({
              order: step.order,
              severity: "warn",
              message: `曲げ ${other.index} のフランジはダイホルダー（${ctx.dieProfile.label}）の張り出し ${dieResult.requiredDistanceMm}mm にぎりぎりです（余裕 ${dieResult.marginMm}mm）。`,
            });
          }
        }
      }

      // ダイ側（V 溝に乗るか）は最小フランジ長で判定する
      const limit = ctx.minFlangeLength ?? ctx.recommendedVWidth;
      if (limit != null && distance < limit) {
        items.push({
          order: step.order,
          severity: "error",
          message: `先に曲げた曲げ ${other.index} との間隔が ${distance}mm しかなく（必要 ${round1(limit)}mm）、立ち上がりがダイと干渉します。曲げ順の入れ替えを検討してください。`,
        });
      } else if (
        height != null &&
        height >= TALL_FLANGE_MM &&
        limit != null &&
        distance < limit * 3
      ) {
        items.push({
          order: step.order,
          severity: "warn",
          message: `曲げ ${other.index} の立ち上がり約 ${height}mm が近接（${distance}mm）しており、ラムや機械フレームとの干渉に注意が必要です。`,
        });
      }
    }
  }

  // パンチ断面で判定できなかった場合のみ、箱曲げ形状として注意喚起する
  if (concreteChecks === 0) {
    const directions: number[] = [];
    for (const bend of analysis.bends) {
      const known = directions.some((index) => {
        const reference = analysis.bends.find((b) => b.index === index);
        return reference ? isParallel(reference, bend) : false;
      });
      if (!known) directions.push(bend.index);
    }
    if (directions.length >= 2 && analysis.bends.length >= 4) {
      items.push({
        order: plan.steps[plan.steps.length - 1].order,
        severity: "warn",
        message: `曲げ方向が ${directions.length} 種類あり曲げ数も多いため、箱曲げとして逃げのある金型（グースネック等）が必要になる可能性があります。`,
      });
    }
  }

  // パンチ未選定・寸法未登録で当たり判定ができなかった場合はその旨を伝える
  if (ctx.punchByOrder.size === 0 && plan.steps.length > 1) {
    items.push({
      order: plan.steps[0].order,
      severity: "info",
      message:
        "上型が未選定のため、パンチとの当たり判定を実施していません。加工条件で上型を選ぶと、逃げ寸法から干渉を判定します。",
    });
  } else if (skippedForMissingDimensions > 0) {
    items.push({
      order: plan.steps[0].order,
      severity: "info",
      message:
        "選択したパンチの本体張り出しが未登録のため、当たり判定を実施していません。金型マスタに型式・本体張り出し・逃げ寸法を登録してください。",
    });
  }

  if (ctx.dieProfile.topOffset == null && ctx.stackedHolderIds.length > 0) {
    items.push({
      order: plan.steps[0].order,
      severity: "info",
      message:
        "ダイホルダーの上面張り出しが未登録のため、ホルダーとの干渉判定を実施していません。ホルダーマスタに上面張り出しを登録してください。",
    });
  } else if (skippedDieForMissingDimensions > 0 && dieChecks === 0) {
    items.push({
      order: plan.steps[0].order,
      severity: "info",
      message:
        "ダイホルダーの上面張り出しが未登録のため、ホルダーとの当たり判定を実施していません。",
    });
  }

  const hasError = items.some((item) => item.severity === "error");
  const hasWarn = items.some((item) => item.severity === "warn");
  const level = hasError ? "risk" : hasWarn ? "caution" : "none";
  const summary = hasError
    ? `干渉の恐れがあります（要確認 ${items.filter((i) => i.severity === "error").length} 件）`
    : hasWarn
      ? `注意が必要な箇所があります（${items.filter((i) => i.severity === "warn").length} 件）`
      : "検出した曲げ線の寸法関係では干渉は見つかりませんでした。";

  return { level, summary, items };
}

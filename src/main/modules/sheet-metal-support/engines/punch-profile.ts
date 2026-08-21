import type { PunchType, ToolOption } from "@shared/sheetMetalSupport.js";
import { PUNCH_TYPE_LABELS } from "@shared/sheetMetalSupport.js";

import { round1 } from "./geometry.js";

/**
 * パンチ（上型）断面の近似モデル。
 *
 * 実際の断面形状は持たず、次の 2 つで近似する。
 *   1. 実体の張り出し：剣先 R の円弧から先端角度のテーパへ続き、本体張り出しで打ち切る。
 *      低いフランジは剣先の太さだけ、高いフランジは本体の張り出し分だけ避ける必要がある。
 *   2. 逃げ（グースネック）：高さ reliefHeight 以下・剣先中心から reliefDepth 以内は空いている。
 *
 * 立ち上がったフランジは「実体を避けている」か「逃げに収まっている」かのどちらかであれば
 * 干渉しない。逃げの中は剣先が細く逃げていることを前提に、空いているものとして扱う。
 *
 * 寸法はすべて剣先の中心を原点とした片側の距離で扱う。
 * パンチは左右対称とは限らない（グースネックは片側だけ逃げている）ため、
 * 全幅ではなくフランジが立つ側の張り出しを基準にする。
 */
export interface PunchProfile {
  toolId: number;
  toolName: string;
  type: PunchType | null;
  /** 先端角度（度） */
  tipAngleDeg: number | null;
  /** 先端 R（mm） */
  tipRadius: number;
  /** 剣先中心から本体面までの片側の張り出し（mm） */
  bodyOffset: number | null;
  /** 逃げ高さ（mm）。逃げの無い型式は 0 */
  reliefHeight: number;
  /** 逃げ奥行き（mm）。逃げの無い型式は 0 */
  reliefDepth: number;
}

export function toPunchProfile(tool: ToolOption): PunchProfile {
  return {
    toolId: tool.id,
    toolName: tool.name,
    type: tool.punchType,
    tipAngleDeg: tool.tipAngle,
    tipRadius: tool.tipRadius ?? 0,
    bodyOffset: tool.bodyOffset,
    reliefHeight: tool.reliefHeight ?? 0,
    reliefDepth: tool.reliefDepth ?? 0,
  };
}

/** 判定に必要な寸法が揃っているか（本体張り出しが無いと当たり判定ができない） */
export function hasClearanceDimensions(profile: PunchProfile): boolean {
  return profile.bodyOffset != null;
}

/**
 * 高さ h においてパンチ実体が張り出す距離（剣先中心から）。
 *
 * 剣先は半径 R の円弧で、両側のフランクに接してからテーパへ移る。
 * 接点は高さ `R(1 - cos α)`・張り出し `R sin α`（α は先端角度の半分）で、
 * それより下は円弧、上はテーパが続き、本体張り出しで打ち切られる。
 * ラジアス型のように R が大きい型は根元が太くなるため、R を無視すると判定が甘くなる。
 *
 * 先端角度が未登録の場合はテーパを評価できないため、常に本体張り出しとみなす。
 */
function solidOffset(profile: PunchProfile, height: number): number {
  const body = profile.bodyOffset ?? 0;
  if (profile.tipAngleDeg == null || profile.tipAngleDeg <= 0) return body;
  if (height <= 0) return 0;

  const halfAngle = (profile.tipAngleDeg / 2) * (Math.PI / 180);
  const radius = profile.tipRadius;
  const arcTopHeight = radius * (1 - Math.cos(halfAngle));

  const offset =
    height <= arcTopHeight
      ? Math.sqrt(Math.max(0, 2 * radius * height - height * height))
      : radius * Math.sin(halfAngle) + (height - arcTopHeight) * Math.tan(halfAngle);

  return Math.min(offset, body);
}

export type ClearanceVerdict = "clear" | "hit-tip" | "hit-body" | "unknown";

export interface ClearanceResult {
  verdict: ClearanceVerdict;
  /** 逃げ空間に収まっているか */
  insideRelief: boolean;
  /** 実体を避けるために必要な曲げ線からの距離（mm）。判定不能なら null */
  requiredDistanceMm: number | null;
  /** 余裕（mm）。負なら不足 */
  marginMm: number | null;
}

/**
 * 先に曲げたフランジがパンチに当たるかを判定する。
 *
 * @param distanceMm 加工中の曲げ線から、立ち上がったフランジまでの水平距離
 * @param heightMm   立ち上がったフランジの高さ
 */
export function checkClearance(
  profile: PunchProfile,
  distanceMm: number,
  heightMm: number
): ClearanceResult {
  if (profile.bodyOffset == null) {
    return { verdict: "unknown", insideRelief: false, requiredDistanceMm: null, marginMm: null };
  }

  const required = solidOffset(profile, heightMm);

  // 実体を避けているならそのまま通る
  if (distanceMm >= required) {
    return {
      verdict: "clear",
      insideRelief: false,
      requiredDistanceMm: round1(required),
      marginMm: round1(distanceMm - required),
    };
  }

  // 実体に重なる位置でも、逃げに収まっていれば通る
  if (distanceMm <= profile.reliefDepth && heightMm <= profile.reliefHeight) {
    return {
      verdict: "clear",
      insideRelief: true,
      requiredDistanceMm: round1(required),
      marginMm: round1(
        Math.min(profile.reliefHeight - heightMm, profile.reliefDepth - distanceMm)
      ),
    };
  }

  // 本体の張り出しまで届いていなければ剣先、届いていれば本体に当たっている
  const hitBody = profile.bodyOffset > 0 && required >= profile.bodyOffset;
  return {
    verdict: hitBody ? "hit-body" : "hit-tip",
    insideRelief: false,
    requiredDistanceMm: round1(required),
    marginMm: round1(distanceMm - required),
  };
}

/** 干渉の理由を現場向けの文章にする */
export function describeHit(
  profile: PunchProfile,
  result: ClearanceResult,
  distanceMm: number,
  heightMm: number
): string {
  const typeLabel = profile.type ? PUNCH_TYPE_LABELS[profile.type] : "型式未登録";
  const shape = `立ち上がり ${round1(heightMm)}mm・曲げ線からの距離 ${round1(distanceMm)}mm`;

  if (result.verdict === "hit-tip") {
    const radiusNote = profile.tipRadius > 0 ? `先端R ${round1(profile.tipRadius)}mm を含めて` : "";
    return `パンチ「${profile.toolName}」（${typeLabel}）の剣先に当たります（${shape}。${radiusNote}この高さでは剣先が ${result.requiredDistanceMm}mm まで張り出すため、それ以上離す必要があります）。`;
  }
  if (profile.reliefHeight > 0 || profile.reliefDepth > 0) {
    const cause =
      heightMm > profile.reliefHeight
        ? `立ち上がりが逃げ高さ ${round1(profile.reliefHeight)}mm を超えています`
        : `曲げ線からの距離が逃げ奥行き ${round1(profile.reliefDepth)}mm を超えており、逃げの外でパンチ本体に当たります`;
    return `パンチ「${profile.toolName}」（${typeLabel}）の逃げに収まりません（${shape}。${cause}）。`;
  }
  return `パンチ「${profile.toolName}」（${typeLabel}）は逃げが無いため本体に当たります（${shape}。本体の張り出しを避けるには ${result.requiredDistanceMm}mm 以上の距離が必要です）。`;
}

/**
 * 指定した立ち上がりを逃がせるパンチを候補から探す。
 * 逃げ空間に収まるもののうち、逃げ高さに最も余裕のあるものを返す。
 */
export function findPunchWithRelief(
  candidates: readonly PunchProfile[],
  distanceMm: number,
  heightMm: number,
  excludeToolId: number | null
): PunchProfile | null {
  let best: PunchProfile | null = null;
  let bestMargin = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.toolId === excludeToolId) continue;
    const result = checkClearance(candidate, distanceMm, heightMm);
    if (result.verdict !== "clear") continue;
    const margin = result.insideRelief
      ? candidate.reliefHeight - heightMm
      : (result.marginMm ?? 0);
    if (margin > bestMargin) {
      bestMargin = margin;
      best = candidate;
    }
  }
  return best;
}

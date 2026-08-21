import type { ToolHolderOption, ToolStackItem } from "@shared/sheetMetalSupport.js";

import { round1 } from "./geometry.js";

/**
 * 下型スタック（ダイホルダー）の上面張り出し近似モデル。
 *
 * パンチ断面ほど複雑にはせず、ダイ中心から見たホルダー上面の片側張り出し（topOffset）で
 * 先に曲げたフランジ（立ち上がり・下向き）がホルダー側面に当たるかを判定する。
 * 複数段積みの場合は、もっとも張り出す段の topOffset を採用する。
 */

export interface DieStackProfile {
  /** 表示用（積んだホルダー名を連結） */
  label: string;
  /** ダイ中心からホルダー上面までの最大片側張り出し（mm） */
  topOffset: number | null;
  /** ホルダー段の合計型高さ（mm）。未登録があれば null */
  stackHeight: number | null;
}

export type DieClearanceVerdict = "clear" | "hit" | "unknown";

export interface DieClearanceResult {
  verdict: DieClearanceVerdict;
  requiredDistanceMm: number | null;
  marginMm: number | null;
}

export function buildDieStackProfile(
  lowerStack: readonly ToolStackItem[],
  holderMap: Map<number, ToolHolderOption>
): DieStackProfile {
  const names: string[] = [];
  let topOffset: number | null = null;
  let stackHeight = 0;
  let heightKnown = true;

  for (const item of lowerStack) {
    const holder = holderMap.get(item.holderId);
    const name = holder?.name ?? `ホルダー#${item.holderId}`;
    names.push(name);
    if (holder?.topOffset != null) {
      topOffset = topOffset == null ? holder.topOffset : Math.max(topOffset, holder.topOffset);
    }
    if (holder?.toolHeight == null) heightKnown = false;
    else stackHeight += holder.toolHeight;
  }

  return {
    label: names.length > 0 ? names.join(" → ") : "ダイホルダー未設定",
    topOffset,
    stackHeight: heightKnown && lowerStack.length > 0 ? round1(stackHeight) : null,
  };
}

export function hasDieClearanceDimensions(profile: DieStackProfile): boolean {
  return profile.topOffset != null;
}

/**
 * 先に曲げたフランジがダイホルダー上面の張り出しに当たるか。
 *
 * @param distanceMm 加工中の曲げ線から、先の曲げ線（フランジ根元）までの水平距離
 * @param extentMm   フランジの立ち上がり／下向きの有効長（mm）
 */
export function checkDieClearance(
  profile: DieStackProfile,
  distanceMm: number,
  extentMm: number
): DieClearanceResult {
  if (profile.topOffset == null) {
    return { verdict: "unknown", requiredDistanceMm: null, marginMm: null };
  }
  if (extentMm <= 0) {
    return {
      verdict: "clear",
      requiredDistanceMm: round1(profile.topOffset),
      marginMm: round1(distanceMm - profile.topOffset),
    };
  }

  const required = profile.topOffset;
  const margin = distanceMm - required;
  return {
    verdict: margin >= 0 ? "clear" : "hit",
    requiredDistanceMm: round1(required),
    marginMm: round1(margin),
  };
}

export function describeDieHit(
  profile: DieStackProfile,
  result: DieClearanceResult,
  distanceMm: number,
  extentMm: number,
  downward: boolean
): string {
  const direction = downward ? "下向き" : "立ち上がり";
  return `ダイホルダー（${profile.label}）の上面張り出し ${result.requiredDistanceMm}mm に${direction} ${round1(extentMm)}mm のフランジが当たります（曲げ線間 ${round1(distanceMm)}mm・${result.requiredDistanceMm}mm 以上必要）。`;
}

/** 張り出しが小さいホルダーを候補から探す（干渉を逃がす用途） */
export function findHolderWithLessOffset(
  candidates: readonly ToolHolderOption[],
  requiredDistanceMm: number,
  excludeIds: readonly number[]
): ToolHolderOption | null {
  let best: ToolHolderOption | null = null;
  let bestOffset = Number.POSITIVE_INFINITY;
  for (const holder of candidates) {
    if (excludeIds.includes(holder.id)) continue;
    if (holder.topOffset == null) continue;
    if (holder.topOffset > requiredDistanceMm) continue;
    if (holder.topOffset < bestOffset) {
      bestOffset = holder.topOffset;
      best = holder;
    }
  }
  return best;
}

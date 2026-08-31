import type { ModelAnalysis, ProcessConditionBend } from "@shared/sheetMetalSupport.js";

/** 3D 曲げ線ハイライト用（再生ステップと検出曲げ No. の対応） */
export interface BendPlaybackHighlight {
  completed: number[];
  active: number | null;
}

const RADIUS_MATCH_TOLERANCE = 0.3;
const ANGLE_MATCH_TOLERANCE = 1;

function matchDetectedIndex(
  bend: ProcessConditionBend,
  analysis: ModelAnalysis,
  used: Set<number>
): number | null {
  if (bend.detectedBendIndex != null && !used.has(bend.detectedBendIndex)) {
    used.add(bend.detectedBendIndex);
    return bend.detectedBendIndex;
  }
  const match = analysis.bends.find((candidate) => {
    if (used.has(candidate.index)) return false;
    if (
      bend.bendRadius != null &&
      Math.abs(candidate.innerRadius - bend.bendRadius) > RADIUS_MATCH_TOLERANCE
    ) {
      return false;
    }
    if (bend.angle != null && Math.abs(candidate.angleDeg - bend.angle) > ANGLE_MATCH_TOLERANCE) {
      return false;
    }
    return true;
  });
  if (!match) return null;
  used.add(match.index);
  return match.index;
}

/** 加工条件の曲げ順と形状解析から、再生ステップに応じた曲げ線ハイライトを作る */
export function buildPlaybackHighlight(
  stepIndex: number,
  bends: readonly ProcessConditionBend[],
  analysis: ModelAnalysis | null
): BendPlaybackHighlight | null {
  if (!analysis || stepIndex <= 0 || bends.length === 0) return null;

  const used = new Set<number>();
  const resolved: number[] = [];
  for (const bend of bends) {
    const index = matchDetectedIndex(bend, analysis, used);
    resolved.push(index ?? -1);
  }

  const completed = resolved.slice(0, stepIndex - 1).filter((index) => index >= 0);
  const activeRaw = resolved[stepIndex - 1];
  return {
    completed,
    active: activeRaw != null && activeRaw >= 0 ? activeRaw : null,
  };
}

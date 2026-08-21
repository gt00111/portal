import type {
  BendSequencePlan,
  DetectedBend,
  ModelAnalysis,
  PlannedBendStep,
} from "@shared/sheetMetalSupport.js";

import { estimateFlangeLength, isParallel } from "./geometry.js";

/**
 * 曲げ順自動生成エンジン。
 *
 * 形状解析で得た曲げ線から、以下のルールで加工順を組み立てる。
 * 1. フランジが短い曲げを先に曲げる（後工程で立ち上がりに阻まれないため）
 * 2. 同一軸方向・同一半径の曲げはまとめる（金型交換と段取り替えの削減）
 * 3. 判断根拠を必ずステップごとの理由として残す
 *
 * 展開形状や実際の干渉計算は行わないため、あくまで「たたき台」として提示する。
 */

/** 同一半径とみなす差（mm） */
const SAME_RADIUS_TOLERANCE = 0.3;

interface Candidate {
  bend: DetectedBend;
  flangeLengthMm: number | null;
}

interface Group {
  members: Candidate[];
  /** グループ内の最短フランジ長（グループの並び順に使用） */
  minFlange: number;
}

function flangeValue(candidate: Candidate): number {
  return candidate.flangeLengthMm ?? Number.POSITIVE_INFINITY;
}

/** 平行かつ半径が近い曲げをまとめる */
function groupBends(candidates: Candidate[]): Group[] {
  const groups: Group[] = [];
  for (const candidate of candidates) {
    const target = groups.find((group) =>
      group.members.some(
        (member) =>
          isParallel(member.bend, candidate.bend) &&
          Math.abs(member.bend.innerRadius - candidate.bend.innerRadius) <= SAME_RADIUS_TOLERANCE
      )
    );
    if (target) {
      target.members.push(candidate);
    } else {
      groups.push({ members: [candidate], minFlange: 0 });
    }
  }
  for (const group of groups) {
    group.members.sort((a, b) => flangeValue(a) - flangeValue(b));
    group.minFlange = flangeValue(group.members[0]);
  }
  groups.sort((a, b) => a.minFlange - b.minFlange);
  return groups;
}

export function planSequence(analysis: ModelAnalysis): BendSequencePlan {
  const candidates: Candidate[] = analysis.bends.map((bend) => ({
    bend,
    flangeLengthMm: estimateFlangeLength(bend, analysis),
  }));

  if (candidates.length === 0) {
    return {
      steps: [],
      notes: ["形状から曲げ部を検出できなかったため、曲げ順を生成できませんでした。"],
    };
  }

  const groups = groupBends(candidates);
  const steps: PlannedBendStep[] = [];

  groups.forEach((group, groupIndex) => {
    group.members.forEach((member, memberIndex) => {
      const flange = member.flangeLengthMm;
      let reason: string;
      if (memberIndex > 0) {
        reason = `曲げ ${steps[steps.length - 1].detectedIndex} と同一方向・内R ${member.bend.innerRadius}mm のため、金型を替えずに続けて加工します。`;
      } else if (groupIndex === 0) {
        reason =
          flange != null
            ? `推定フランジ長 ${flange}mm と最も短いため、立ち上がりが増える前に先に曲げます。`
            : "フランジ長を推定できないため、検出順の先頭として配置します。";
      } else {
        reason =
          flange != null
            ? `曲げ方向が前の工程と異なるため段取りを替えて加工します（推定フランジ長 ${flange}mm）。`
            : "曲げ方向が前の工程と異なるため、段取りを替えて加工します。";
      }

      steps.push({
        order: steps.length + 1,
        detectedIndex: member.bend.index,
        innerRadius: member.bend.innerRadius,
        angleDeg: member.bend.angleDeg,
        lengthMm: member.bend.lengthMm,
        flangeLengthMm: flange,
        reason,
      });
    });
  });

  const notes = [
    "フランジが短い曲げを先に曲げる（内側→外側）順序で生成しています。",
    "同一方向・同一半径の曲げをまとめ、金型交換と段取り替えを減らしています。",
    "フランジ長は外形の境界箱からの推定値です。展開形状は考慮していないため、実機での確認が必要です。",
  ];
  if (groups.length > 1) {
    notes.push(`曲げ方向が ${groups.length} グループあり、その回数だけ段取り替えが発生します。`);
  }

  return { steps, notes };
}

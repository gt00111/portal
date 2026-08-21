import type {
  InterferenceCheck,
  JudgementLevel,
  JudgementReason,
  JudgementSeverity,
  MachineOption,
  ModelAnalysis,
  OpeningHeightCheck,
  PressForceCheck,
  ProcessConditionBend,
  StackHeightCheck,
  ToolOption,
} from "@shared/sheetMetalSupport.js";
import { isToolUsableOnMachine } from "@shared/sheetMetalSupport.js";

import type { MaterialSpec } from "./materials.js";
import type { GeneratedBendCondition } from "./process-condition.engine.js";
import { minInnerRadius } from "./tool-selection.engine.js";

/**
 * 加工性評価エンジン。
 * 100 点満点から減点方式で評価し、減点ごとに理由（対象・重大度・点数）を残す。
 * 判断根拠を必ず説明できるよう、点数と理由は常に対で生成する。
 */

const MAX_SCORE = 100;

/** 曲げ回数の閾値（段取り工数の増加） */
const BEND_COUNT_WARN = 6;
const BEND_COUNT_HEAVY = 10;

/** 板厚の閾値（mm） */
const THICKNESS_HEAVY = 6;
const THICKNESS_THIN = 0.5;

/** 鋭角曲げとみなす角度（度） */
const SHARP_ANGLE_DEG = 30;

/** 形状の推定板厚が入力と一致しているとみなす差（mm） */
const THICKNESS_MATCH_TOLERANCE = 0.2;
/** 検出した曲げ R が登録値と一致しているとみなす差（mm） */
const RADIUS_MATCH_TOLERANCE = 0.3;

export interface ScoreInput {
  material: string | null;
  materialResolved: boolean;
  thickness: number | null;
  spec: MaterialSpec;
  bends: readonly ProcessConditionBend[];
  generated: ReadonlyMap<number, GeneratedBendCondition>;
  /** STEP 形状解析（未登録なら null） */
  analysis: ModelAnalysis | null;
  /** 干渉判定（解析が無ければ null） */
  interference: InterferenceCheck | null;
  /** 必要加圧力と機械能力の突き合わせ */
  pressForce: PressForceCheck | null;
  /** 開口高さと金型スタック合計の突き合わせ */
  openingHeight: OpeningHeightCheck | null;
  /** 工程間の金型スタック高さ差 */
  stackHeight: StackHeightCheck | null;
  /** 選択済み金型・機械の解決用（無効化済みも含む全件） */
  upperToolMap: Map<number, ToolOption>;
  lowerToolMap: Map<number, ToolOption>;
  machineMap: Map<number, MachineOption>;
}

export interface ScoreOutput {
  score: number;
  judgement: JudgementLevel;
  reasons: JudgementReason[];
  issuesByBend: Map<number, string[]>;
}

function toJudgement(score: number): JudgementLevel {
  if (score >= 90) return "good";
  if (score >= 70) return "ok";
  if (score >= 50) return "caution";
  return "difficult";
}

export function evaluate(input: ScoreInput): ScoreOutput {
  const reasons: JudgementReason[] = [];
  const issuesByBend = new Map<number, string[]>();

  const push = (
    category: string,
    message: string,
    severity: JudgementSeverity,
    deduction: number,
    bendSequence: number | null = null
  ): void => {
    reasons.push({ category, message, severity, deduction, bendSequence });
    if (bendSequence != null) {
      const list = issuesByBend.get(bendSequence) ?? [];
      list.push(message);
      issuesByBend.set(bendSequence, list);
    }
  };

  /* -------- 全体条件 -------- */

  if (input.thickness == null || input.thickness <= 0) {
    push(
      "板厚",
      "板厚が未入力のため、金型選定と曲げ荷重を算出できません。",
      "error",
      25
    );
  } else if (input.thickness >= THICKNESS_HEAVY) {
    push(
      "板厚",
      `板厚 ${input.thickness}mm は厚板であり、大型金型と高トン数の機械が必要です。`,
      "warn",
      5
    );
  } else if (input.thickness <= THICKNESS_THIN) {
    push(
      "板厚",
      `板厚 ${input.thickness}mm は薄板であり、曲げ寸法のばらつきが出やすくなります。`,
      "warn",
      5
    );
  }

  if (!input.materialResolved) {
    const label = input.material?.trim();
    push(
      "材質",
      label
        ? `材質「${label}」を既知の材質として解決できないため、軟鋼相当（引張強さ ${input.spec.tensileStrength}N/mm²）で計算しました。`
        : `材質が未入力のため、軟鋼相当（引張強さ ${input.spec.tensileStrength}N/mm²）で計算しました。`,
      "warn",
      5
    );
  }

  const bendCount = input.bends.length;
  if (bendCount === 0) {
    push("曲げ順", "曲げ順が未登録のため、工程単位の評価ができません。", "error", 30);
  } else if (bendCount > BEND_COUNT_HEAVY) {
    push(
      "曲げ順",
      `曲げ回数が ${bendCount} 回と多く、段取り替えと累積誤差の影響が大きくなります。`,
      "warn",
      10
    );
  } else if (bendCount > BEND_COUNT_WARN) {
    push("曲げ順", `曲げ回数が ${bendCount} 回あり、段取り工数が増加します。`, "warn", 5);
  }

  /* -------- 曲げステップごと -------- */

  const minR = minInnerRadius(input.thickness, input.spec);

  for (const bend of input.bends) {
    const seq = bend.bendSequence;
    const generated = input.generated.get(seq);

    if (bend.bendRadius == null) {
      push("曲げR", "曲げ R が未入力です。", "info", 3, seq);
    } else if (minR != null && bend.bendRadius < minR) {
      push(
        "曲げR",
        `曲げ R ${bend.bendRadius}mm が最小曲げ R ${minR}mm を下回るため、割れの恐れがあります。`,
        "error",
        15,
        seq
      );
    }

    if (bend.angle == null) {
      push("角度", "曲げ角度が未入力です。", "info", 3, seq);
    } else if (bend.angle < SHARP_ANGLE_DEG) {
      push(
        "角度",
        `曲げ角度 ${bend.angle}° は鋭角であり、専用金型または二段曲げが必要です。`,
        "warn",
        5,
        seq
      );
    }

    if (bend.lowerToolId == null) {
      const hint =
        generated?.recommendedVWidth != null
          ? `（推奨 V 幅 ${generated.recommendedVWidth}mm）`
          : "";
      push("金型", `下型が未選定です${hint}。`, "warn", 5, seq);
    }
    if (bend.upperToolId == null) {
      push("金型", "上型が未選定です。", "warn", 4, seq);
    }
    if (bend.machineId == null) {
      push("機械", "使用機械が未選定です。", "info", 3, seq);
    }

    // 機械専用の金型を別の機械で選んでいないか
    if (bend.machineId != null) {
      const machineName = input.machineMap.get(bend.machineId)?.name ?? "選択した機械";
      const checks: Array<{ label: string; tool: ToolOption | undefined }> = [
        { label: "上型", tool: bend.upperToolId != null ? input.upperToolMap.get(bend.upperToolId) : undefined },
        { label: "下型", tool: bend.lowerToolId != null ? input.lowerToolMap.get(bend.lowerToolId) : undefined },
      ];
      for (const { label, tool } of checks) {
        if (!tool || isToolUsableOnMachine(tool, bend.machineId)) continue;
        const allowed = tool.machineIds
          .map((id) => input.machineMap.get(id)?.name ?? `#${id}`)
          .join("・");
        push(
          "金型",
          `${label}「${tool.name}」は ${machineName} に取り付けられません（対応機械: ${allowed}）。`,
          "error",
          15,
          seq
        );
      }
    }
  }

  /* -------- 形状（STEP）との突き合わせ -------- */

  if (!input.analysis) {
    push(
      "形状",
      "3Dモデル（STEP）が未登録のため、曲げ線検出と干渉判定は実施していません。",
      "info",
      0
    );
  } else {
    const analysis = input.analysis;

    if (analysis.thickness != null && input.thickness != null) {
      const diff = Math.abs(analysis.thickness - input.thickness);
      if (diff > THICKNESS_MATCH_TOLERANCE) {
        push(
          "形状",
          `形状から推定した板厚 ${analysis.thickness}mm が、加工条件の板厚 ${input.thickness}mm と一致しません。`,
          "warn",
          8
        );
      }
    }

    if (analysis.thicknessSource === "unknown") {
      push(
        "形状",
        "板厚が不明なため、外形コーナーR と曲げの分類を保留しています。検出数が実際より多い可能性があります。",
        "warn",
        5
      );
    }

    const reviewCount = analysis.bends.filter((b) => b.confidence === "review").length;
    if (reviewCount > 0) {
      push(
        "形状",
        `内側と外側の円筒が対で取れなかった箇所が ${reviewCount} 件あります。曲げ以外の R を曲げとして数えている可能性があります。`,
        "info",
        0
      );
    }

    if (bendCount > 0 && analysis.bends.length !== bendCount) {
      push(
        "形状",
        `形状からは曲げを ${analysis.bends.length} 箇所検出しましたが、加工条件の曲げ順は ${bendCount} 箇所です。`,
        "warn",
        8
      );
    }

    const registeredRadii = input.bends
      .map((b) => b.bendRadius)
      .filter((r): r is number => r != null);
    if (registeredRadii.length > 0) {
      const unmatched = analysis.bends.filter(
        (detected) =>
          !registeredRadii.some(
            (radius) => Math.abs(radius - detected.innerRadius) <= RADIUS_MATCH_TOLERANCE
          )
      );
      if (unmatched.length > 0) {
        push(
          "形状",
          `形状の曲げ R（${unmatched.map((b) => `${b.innerRadius}mm`).join("・")}）に対応する登録値がありません。`,
          "warn",
          5
        );
      }
    }
  }

  if (input.interference) {
    if (input.interference.level === "risk") {
      push("干渉", input.interference.summary, "error", 15);
    } else if (input.interference.level === "caution") {
      push("干渉", input.interference.summary, "warn", 5);
    }
  }

  /* -------- 必要加圧力 -------- */

  if (input.pressForce) {
    const press = input.pressForce;
    if (press.level === "over") {
      push("加圧力", press.message, "error", 20);
    } else if (press.level === "caution") {
      push("加圧力", press.message, "warn", 8);
    } else if (press.level === "unknown" && press.requiredForce != null) {
      push("加圧力", press.message, "info", 0);
    }
  }

  if (input.openingHeight) {
    const opening = input.openingHeight;
    if (opening.level === "over") {
      push("開口", opening.message, "error", 20);
    } else if (opening.level === "caution") {
      push("開口", opening.message, "warn", 8);
    } else if (opening.level === "unknown" && opening.combinedHeight != null) {
      push("開口", opening.message, "info", 0);
    }
  }

  if (input.stackHeight) {
    const stack = input.stackHeight;
    if (stack.level === "change") {
      push("段替え", stack.message, "warn", 10);
    } else if (stack.level === "unknown" && stack.byBend.some((row) => row.combinedHeight != null)) {
      push("段替え", stack.message, "info", 0);
    }
  }

  const deducted = reasons.reduce((sum, r) => sum + r.deduction, 0);
  const score = Math.max(0, MAX_SCORE - deducted);

  return { score, judgement: toJudgement(score), reasons, issuesByBend };
}

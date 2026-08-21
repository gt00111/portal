import type {
  BendJudgement,
  BendSequencePlan,
  InterferenceCheck,
  JudgementLevel,
  JudgementReason,
  ModelAnalysis,
  ModelAnalysisRecord,
  OpeningHeightCheck,
  PressForceCheck,
  ProcessCondition,
  ProcessConditionBend,
  SimulationResult,
  StackHeightCheck,
  ToolHolderOption,
  ToolOption,
  ToolStack,
} from "@shared/sheetMetalSupport.js";
import { isToolUsableOnMachine, JUDGEMENT_LABELS } from "@shared/sheetMetalSupport.js";

import { planSequence } from "./engines/bend-sequence.engine.js";
import { evaluateInterference } from "./engines/interference.engine.js";
import { buildDieStackProfile } from "./engines/die-profile.js";
import { lookupMaterial } from "./engines/materials.js";
import { evaluatePressForce } from "./engines/press-force.engine.js";
import { generateBendCondition } from "./engines/process-condition.engine.js";
import { evaluate } from "./engines/process-score.engine.js";
import { toPunchProfile, type PunchProfile } from "./engines/punch-profile.js";
import { recommend } from "./engines/recommendation.engine.js";
import { evaluateOpeningHeight, evaluateStackHeights, stackMaxLoad } from "./engines/tool-stack.js";
import { minFlangeLength, recommendVWidth } from "./engines/tool-selection.engine.js";
import * as masterRef from "./master-ref.repo.js";
import * as modelAnalysisRepo from "./model-analysis.repo.js";
import * as processConditionRepo from "./process-condition.repo.js";
import * as simulationResultRepo from "./simulation-result.repo.js";
import * as simulationRepo from "./simulation.repo.js";

/**
 * 加工判断エンジンの統括（Phase 4）。
 * 金型選定 → 加工条件生成 → 加工性評価 → 改善案生成 の順に各エンジンを呼び出し、
 * 結果・点数・理由・改善案をまとめて `simulation_results` に保存する。
 * 干渉判定は 3D 形状解析が前提のため、本フェーズでは「未評価」を返す。
 */

const INTERFERENCE_NOT_EVALUATED = "未評価（3Dモデルが未登録のため）";

/** result_detail に保存する明細 */
interface StoredDetail {
  bends: BendJudgement[];
  material: string | null;
  materialResolved: boolean;
  tensileStrength: number | null;
  thickness: number | null;
  analysisAvailable: boolean;
  plan: BendSequencePlan | null;
  interference: InterferenceCheck | null;
  pressForce: PressForceCheck | null;
  openingHeight: OpeningHeightCheck | null;
  stackHeight: StackHeightCheck | null;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function resolveConditionNames(condition: ProcessCondition): ProcessCondition {
  const upperMap = masterRef.buildUpperToolNameMap();
  const lowerMap = masterRef.buildLowerToolNameMap();
  const machineMap = masterRef.buildMachineNameMap();
  return {
    ...condition,
    bends: condition.bends.map((b) => ({
      ...b,
      upperToolName: b.upperToolId != null ? upperMap.get(b.upperToolId) ?? null : null,
      lowerToolName: b.lowerToolId != null ? lowerMap.get(b.lowerToolId) ?? null : null,
      machineName: b.machineId != null ? machineMap.get(b.machineId) ?? null : null,
    })),
  };
}

/**
 * 干渉判定に渡すパンチ情報を組み立てる。
 * 加工順ごとに選択された上型を引き当て、代替案の候補は
 * その工程で使う機械に取り付けられるパンチだけに絞る。
 */
function buildPunchContext(
  bends: readonly ProcessConditionBend[],
  upperToolMap: Map<number, ToolOption>
): { punchByOrder: Map<number, PunchProfile>; punchCandidates: PunchProfile[] } {
  const punchByOrder = new Map<number, PunchProfile>();
  for (const bend of bends) {
    if (bend.upperToolId == null) continue;
    const tool = upperToolMap.get(bend.upperToolId);
    if (tool) punchByOrder.set(bend.bendSequence, toPunchProfile(tool));
  }

  // 代替案は、加工条件で使われている機械すべてに付くパンチに限る
  const machineIds = [...new Set(bends.map((b) => b.machineId).filter((id) => id != null))];
  const candidates = masterRef
    .listUpperTools()
    .filter((tool) => machineIds.every((id) => isToolUsableOnMachine(tool, id)))
    .map(toPunchProfile);

  return { punchByOrder, punchCandidates: candidates };
}

/** 干渉判定に渡すダイホルダー情報を組み立てる */
function buildDieContext(
  stack: ToolStack,
  bends: readonly ProcessConditionBend[],
  holderMap: Map<number, ToolHolderOption>
): {
  dieProfile: ReturnType<typeof buildDieStackProfile>;
  holderCandidates: ToolHolderOption[];
  stackedHolderIds: number[];
} {
  const stackedHolderIds = stack.lower.map((item) => item.holderId);
  const machineIds = [...new Set(bends.map((b) => b.machineId).filter((id) => id != null))];
  const holderCandidates = masterRef
    .listToolHolders()
    .filter(
      (holder) =>
        holder.holderType === "dieHolder" &&
        machineIds.every((id) => holder.machineIds.length === 0 || holder.machineIds.includes(id))
    );

  return {
    dieProfile: buildDieStackProfile(stack.lower, holderMap),
    holderCandidates,
    stackedHolderIds,
  };
}

/** 判断エンジンを実行し、結果を保存して返す。 */
export function run(partNumber: string, userNameId: number | null): SimulationResult {
  const pn = partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");

  const stored = processConditionRepo.getByPart(pn);
  if (!stored) {
    throw new Error("加工条件が未登録です。「加工条件」タブで材質・板厚・曲げ順を登録してください。");
  }
  const condition = resolveConditionNames(stored);

  const lowerTools = masterRef.listLowerTools();
  const { spec, resolved } = lookupMaterial(condition.material);
  const bends = [...condition.bends].sort((a, b) => a.bendSequence - b.bendSequence);

  const generated = new Map(
    bends.map((bend) => [
      bend.bendSequence,
      generateBendCondition(bend, { thickness: condition.thickness, spec, lowerTools }),
    ])
  );

  // 選択済みの金型・機械は無効化済みでも解決できるよう全件から引く
  const upperToolMap = masterRef.buildUpperToolMap();
  const lowerToolMap = masterRef.buildLowerToolMap();
  const machineMap = masterRef.buildMachineMap();
  const holderMap = masterRef.buildToolHolderMap();
  const stack = condition.stack ?? { upper: [], lower: [] };
  const loadLimit = stackMaxLoad(stack, bends, holderMap, upperToolMap, lowerToolMap);

  // 形状解析があれば曲げ順を生成し、その順序で干渉を評価する
  const analysis = readAnalysis(pn);
  const plan = analysis ? planSequence(analysis) : null;
  const vWidth = recommendVWidth(condition.thickness);
  const interference =
    analysis && plan
      ? evaluateInterference(plan, analysis, {
          minFlangeLength: minFlangeLength(vWidth),
          recommendedVWidth: vWidth,
          ...buildPunchContext(bends, upperToolMap),
          ...buildDieContext(stack, bends, holderMap),
        })
      : null;

  // 必要加圧力は「選択された金型の V 幅」と「形状から得た曲げ線長さ」で評価する
  const pressForce = evaluatePressForce({
    tensileStrength: spec.tensileStrength,
    thickness: condition.thickness,
    bends,
    recommendedVWidth: vWidth,
    lowerToolMap,
    machineMap,
    analysis,
    stackMaxLoad: loadLimit.maxLoad,
    stackMaxLoadName: loadLimit.name,
  });

  const openingHeight = evaluateOpeningHeight({
    stack,
    bends,
    holderMap,
    upperToolMap,
    lowerToolMap,
    machineMap,
    analysis,
    plan,
  });

  const stackHeight = evaluateStackHeights({
    stack,
    bends,
    holderMap,
    upperToolMap,
    lowerToolMap,
  });

  const scoreInput = {
    material: condition.material,
    materialResolved: resolved,
    thickness: condition.thickness,
    spec,
    bends,
    generated,
    analysis,
    interference,
    pressForce,
    openingHeight,
    stackHeight,
    upperToolMap,
    lowerToolMap,
    machineMap,
  };

  const score = evaluate(scoreInput);
  const recommendations = recommend({ ...scoreInput, lowerTools, plan });

  const bendJudgements: BendJudgement[] = bends.map((bend) => {
    const g = generated.get(bend.bendSequence);
    return {
      bendSequence: bend.bendSequence,
      recommendedVWidth: g?.recommendedVWidth ?? null,
      recommendedInnerRadius: g?.recommendedInnerRadius ?? null,
      minFlangeLength: g?.minFlangeLength ?? null,
      bendForcePerMeter: g?.bendForcePerMeter ?? null,
      lowerToolName: bend.lowerToolName,
      suggestedLowerToolName: g?.suggestedLowerToolName ?? null,
      upperToolName: bend.upperToolName,
      issues: score.issuesByBend.get(bend.bendSequence) ?? [],
    };
  });

  const interferenceSummary = interference ? interference.summary : INTERFERENCE_NOT_EVALUATED;
  const detail: StoredDetail = {
    bends: bendJudgements,
    material: condition.material,
    materialResolved: resolved,
    tensileStrength: spec.tensileStrength,
    thickness: condition.thickness,
    analysisAvailable: analysis != null,
    plan,
    interference,
    pressForce,
    openingHeight,
    stackHeight,
  };

  const simulationId = simulationRepo.ensureSimulation(pn, userNameId);
  const saved = simulationResultRepo.save({
    simulationId,
    judgement: score.judgement,
    processScore: score.score,
    interferenceResult: interferenceSummary,
    reason: JSON.stringify(score.reasons),
    recommendations: JSON.stringify(recommendations),
    resultDetail: JSON.stringify(detail),
    userNameId,
  });

  return {
    id: saved.id,
    partNumber: pn,
    judgement: score.judgement,
    judgementLabel: JUDGEMENT_LABELS[score.judgement],
    processScore: score.score,
    interferenceResult: interferenceSummary,
    reasons: score.reasons,
    recommendations,
    bends: bendJudgements,
    material: condition.material,
    materialResolved: resolved,
    tensileStrength: spec.tensileStrength,
    thickness: condition.thickness,
    analysisAvailable: analysis != null,
    plan,
    interference,
    pressForce,
    openingHeight,
    stackHeight,
    evaluatedAt: saved.updated_at,
    evaluatedByName: resolveUserName(saved.updated_by),
  };
}

/** 保存済みの判定結果を取得する（未実行なら null）。 */
export function getResult(partNumber: string): SimulationResult | null {
  const pn = partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");

  const simulation = simulationRepo.getRawByPart(pn);
  if (!simulation) return null;
  const row = simulationResultRepo.getBySimulation(simulation.id);
  if (!row) return null;

  const judgement = (row.judgement ?? "caution") as JudgementLevel;
  const detail = parseJson<StoredDetail>(row.result_detail, {
    bends: [],
    material: null,
    materialResolved: false,
    tensileStrength: null,
    thickness: null,
    analysisAvailable: false,
    plan: null,
    interference: null,
    pressForce: null,
    openingHeight: null,
    stackHeight: null,
  });

  return {
    id: row.id,
    partNumber: pn,
    judgement,
    judgementLabel: JUDGEMENT_LABELS[judgement] ?? "判定不明",
    processScore: row.process_score ?? 0,
    interferenceResult: row.interference_result,
    reasons: parseJson<JudgementReason[]>(row.reason, []),
    recommendations: parseJson<string[]>(row.recommendations, []),
    bends: detail.bends,
    material: detail.material,
    materialResolved: detail.materialResolved,
    tensileStrength: detail.tensileStrength,
    thickness: detail.thickness,
    analysisAvailable: detail.analysisAvailable ?? false,
    plan: detail.plan ?? null,
    interference: detail.interference ?? null,
    pressForce: detail.pressForce ?? null,
    openingHeight: detail.openingHeight ?? null,
    stackHeight: detail.stackHeight ?? null,
    evaluatedAt: row.updated_at,
    evaluatedByName: resolveUserName(row.updated_by),
  };
}

/* -------------------- 形状解析（STEP） -------------------- */

function readAnalysis(partNumber: string): ModelAnalysis | null {
  const simulation = simulationRepo.getRawByPart(partNumber);
  if (!simulation) return null;
  const row = modelAnalysisRepo.getBySimulation(simulation.id);
  if (!row) return null;
  return parseJson<ModelAnalysis | null>(row.detail, null);
}

/** ビューア側で解析した曲げ線検出結果を保存する。 */
export function saveAnalysis(
  partNumber: string,
  analysis: ModelAnalysis,
  userNameId: number | null
): ModelAnalysisRecord {
  const pn = partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");
  if (!analysis || !Array.isArray(analysis.bends)) {
    throw new Error("形状解析の内容が不正です。");
  }

  const simulationId = simulationRepo.ensureSimulation(pn, userNameId);
  const saved = modelAnalysisRepo.save({
    simulationId,
    partNumber: pn,
    thickness: analysis.thickness,
    bendCount: analysis.bends.length,
    detail: JSON.stringify(analysis),
    userNameId,
  });

  return {
    partNumber: pn,
    analysis,
    analyzedAt: saved.updated_at,
    analyzedByName: resolveUserName(saved.updated_by),
  };
}

export function getAnalysis(partNumber: string): ModelAnalysisRecord | null {
  const pn = partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");
  const simulation = simulationRepo.getRawByPart(pn);
  if (!simulation) return null;
  const row = modelAnalysisRepo.getBySimulation(simulation.id);
  if (!row) return null;
  const analysis = parseJson<ModelAnalysis | null>(row.detail, null);
  if (!analysis) return null;
  return {
    partNumber: pn,
    analysis,
    analyzedAt: row.updated_at,
    analyzedByName: resolveUserName(row.updated_by),
  };
}

function resolveUserName(userNameId: number | null): string | null {
  if (userNameId == null) return null;
  return masterRef.buildUserNameMap().get(userNameId) ?? null;
}

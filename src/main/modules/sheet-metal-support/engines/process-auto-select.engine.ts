import type {
  BendSequencePlan,
  ModelAnalysis,
  ProcessConditionBendInput,
  ToolHolderOption,
  ToolOption,
  ToolStackInput,
} from "@shared/sheetMetalSupport.js";
import { isToolUsableOnMachine } from "@shared/sheetMetalSupport.js";

import { lookupMaterial } from "./materials.js";
import { planSequence } from "./bend-sequence.engine.js";
import { recommendVWidth, suggestLowerTool } from "./tool-selection.engine.js";

/**
 * 形状解析・推奨曲げ順・金型マスタから加工条件のたたき台を自動生成する。
 * 材質は STEP からは取れないため、既存値または呼び出し側の指定を使う。
 */

export interface AutoSelectOptions {
  /** 既存の材質（上書きしない場合に保持） */
  existingMaterial?: string | null;
  /** 材質の明示指定（SPCC 等） */
  material?: string | null;
  /** 使用機械。未指定なら金型が付く最初の機械を探す */
  machineId?: number | null;
  /** true なら既存材質を維持（空なら material / 軟鋼相当） */
  preserveMaterial?: boolean;
}

export interface AutoSelectResult {
  plan: BendSequencePlan;
  material: string | null;
  thickness: number | null;
  bends: ProcessConditionBendInput[];
  stack: ToolStackInput;
  warnings: string[];
}

function pickMachineId(
  preferred: number | null | undefined,
  lowerTools: readonly ToolOption[],
  upperTools: readonly ToolOption[],
  machines: readonly { id: number }[]
): number | null {
  if (preferred != null) return preferred;
  for (const machine of machines) {
    const hasLower = lowerTools.some((tool) => isToolUsableOnMachine(tool, machine.id));
    const hasUpper = upperTools.some((tool) => isToolUsableOnMachine(tool, machine.id));
    if (hasLower && hasUpper) return machine.id;
  }
  return machines[0]?.id ?? null;
}

function suggestUpperTool(
  machineId: number | null,
  upperTools: readonly ToolOption[]
): ToolOption | null {
  const usable = upperTools.filter((tool) => isToolUsableOnMachine(tool, machineId));
  if (usable.length === 0) return null;
  const straight = usable.find((tool) => tool.punchType === "straight");
  return straight ?? usable[0];
}

function suggestDefaultStack(
  machineId: number | null,
  holders: readonly ToolHolderOption[]
): ToolStackInput {
  const usable = holders.filter(
    (holder) =>
      holder.machineIds.length === 0 ||
      (machineId != null && holder.machineIds.includes(machineId))
  );
  const upper = usable.find((h) => h.holderType === "intermediatePlate");
  const lower = usable.find((h) => h.holderType === "dieHolder");
  return {
    upper: upper ? [upper.id] : [],
    lower: lower ? [lower.id] : [],
  };
}

export function buildAutoSelect(
  analysis: ModelAnalysis,
  lowerTools: readonly ToolOption[],
  upperTools: readonly ToolOption[],
  holders: readonly ToolHolderOption[],
  machines: readonly { id: number }[],
  options: AutoSelectOptions = {}
): AutoSelectResult {
  const warnings: string[] = [];
  const plan = planSequence(analysis);

  const thickness =
    analysis.thickness ??
    (analysis.basisThickness != null && analysis.basisThickness > 0
      ? analysis.basisThickness
      : null);
  if (thickness == null) {
    warnings.push("板厚を形状から確定できませんでした。加工条件で板厚を確認してください。");
  } else if (analysis.thicknessSource === "estimated" || analysis.thicknessSource === "unknown") {
    warnings.push(
      `板厚 ${thickness}mm は形状からの推定値です。図面・現物と突き合わせてください。`
    );
  }

  let material: string | null;
  if (options.preserveMaterial && options.existingMaterial?.trim()) {
    material = options.existingMaterial.trim();
  } else if (options.material?.trim()) {
    material = options.material.trim();
  } else if (options.existingMaterial?.trim()) {
    material = options.existingMaterial.trim();
  } else {
    material = "SPCC";
    warnings.push("材質は STEP から取得できないため SPCC 相当で選定しました。必要に応じて変更してください。");
  }

  const { resolved } = lookupMaterial(material);
  if (!resolved) {
    warnings.push(`材質「${material}」を既知の材質として解決できません。引張強さは軟鋼相当で計算されます。`);
  }

  const machineId = pickMachineId(options.machineId, lowerTools, upperTools, machines);
  if (machineId == null) {
    warnings.push("機械マスタが空のため、使用機械を選定できませんでした。");
  }

  const vWidth = recommendVWidth(thickness);
  const defaultLower = suggestLowerTool(vWidth, lowerTools, machineId);
  const defaultUpper = suggestUpperTool(machineId, upperTools);
  if (defaultLower == null) {
    warnings.push("推奨 V 幅に合う下型が金型マスタに見つかりませんでした。");
  }
  if (defaultUpper == null) {
    warnings.push("選択機械に取り付け可能な上型が金型マスタに見つかりませんでした。");
  }

  const bends: ProcessConditionBendInput[] = plan.steps.map((step) => ({
    bendSequence: step.order,
    detectedBendIndex: step.detectedIndex,
    upperToolId: defaultUpper?.id ?? null,
    lowerToolId: defaultLower?.id ?? null,
    machineId,
    angle: step.angleDeg,
    bendRadius: step.innerRadius,
    note: step.reason,
  }));

  if (plan.steps.length === 0) {
    warnings.push("曲げ順を生成できませんでした。形状解析の結果を確認してください。");
  }

  const stack = suggestDefaultStack(machineId, holders);
  if ((stack.upper?.length ?? 0) === 0 && (stack.lower?.length ?? 0) === 0) {
    warnings.push(
      "デフォルトの中間板・ダイホルダーが見つかりませんでした。金型スタックは手動で設定してください。"
    );
  }

  return { plan, material, thickness, bends, stack, warnings };
}

import type {
  ApplyAutoSelectInput,
  ApplyAutoSelectResult,
  AutoSelectPreview,
  MachineOption,
  ProcessCondition,
  ProcessConditionInput,
  ProcessHistory,
  ProcessHistoryCreateInput,
  RevisionHistory,
  SimulationModel,
  SimulationModelFilePayload,
  TechnicalNote,
  TechnicalNoteCreateInput,
  TechnicalNoteUpdateInput,
  ToolHolderOption,
  ToolOption,
  ToolStack,
  ToolStackInput,
  ToolStackSide,
} from "@shared/sheetMetalSupport.js";
import { HOLDER_TYPE_SIDES, TOOL_STACK_SIDE_LABELS } from "@shared/sheetMetalSupport.js";

import { buildAutoSelect } from "./engines/process-auto-select.engine.js";
import { getAnalysis } from "./judgement.service.js";
import * as masterRef from "./master-ref.repo.js";
import * as modelStorage from "./model-storage.js";
import * as processConditionRepo from "./process-condition.repo.js";
import * as processHistoryRepo from "./process-history.repo.js";
import * as revisionHistoryRepo from "./revision-history.repo.js";
import * as simulationRepo from "./simulation.repo.js";
import * as technicalNoteRepo from "./technical-note.repo.js";

/**
 * Phase 2 加工情報管理のビジネスロジック。
 * - Repository（sheet-metal-support.db）と master-ref（read-only）を統合する。
 * - 変更時に更新履歴（`revision_histories`）を自動記録する（削除不可）。
 */

const TABLE_TECHNICAL_NOTE = "technical_notes";
const TABLE_PROCESS_HISTORY = "process_histories";
const TABLE_PROCESS_CONDITION = "process_conditions";

function resolveUser(map: Map<number, string>, id: number | null): string | null {
  if (id == null) return null;
  return map.get(id) ?? null;
}

/* -------------------- 機械マスタ -------------------- */

export function listMachines(): MachineOption[] {
  return masterRef.listMachines();
}

export function listUpperTools(): ToolOption[] {
  return masterRef.listUpperTools();
}

export function listLowerTools(): ToolOption[] {
  return masterRef.listLowerTools();
}

export function listToolHolders(): ToolHolderOption[] {
  return masterRef.listToolHolders();
}

/* -------------------- 技術ノート -------------------- */

export function listTechnicalNotes(partNumber: string): TechnicalNote[] {
  const pn = partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");
  const notes = technicalNoteRepo.listByPart(pn);
  if (notes.length === 0) return notes;
  const userMap = masterRef.buildUserNameMap();
  return notes.map((n) => ({
    ...n,
    createdByName: resolveUser(userMap, n.createdBy),
    updatedByName: resolveUser(userMap, n.updatedBy),
  }));
}

export function createTechnicalNote(
  input: TechnicalNoteCreateInput,
  userNameId: number | null
): TechnicalNote {
  const partNumber = input.partNumber?.trim();
  const body = input.body?.trim();
  if (!partNumber) throw new Error("品番を指定してください。");
  if (!body) throw new Error("本文を入力してください。");
  const noteType = input.noteType?.trim() || null;

  const created = technicalNoteRepo.insert({ partNumber, noteType, body, createdBy: userNameId });
  revisionHistoryRepo.record({
    targetTable: TABLE_TECHNICAL_NOTE,
    targetId: created.id,
    partNumber,
    fieldName: "(作成)",
    oldValue: null,
    newValue: body,
    changedBy: userNameId,
  });
  return { ...created, createdByName: null, updatedByName: null };
}

export function updateTechnicalNote(
  input: TechnicalNoteUpdateInput,
  userNameId: number | null
): TechnicalNote {
  const id = Number(input.id);
  const body = input.body?.trim();
  if (!Number.isInteger(id) || id <= 0) throw new Error("不正な ID です。");
  if (!body) throw new Error("本文を入力してください。");
  const noteType = input.noteType?.trim() || null;

  const before = technicalNoteRepo.getById(id);
  if (!before) throw new Error("対象の技術ノートが見つかりません。");

  const updated = technicalNoteRepo.update({ id, noteType, body, updatedBy: userNameId });

  const entries = [] as Parameters<typeof revisionHistoryRepo.recordMany>[0];
  if ((before.noteType ?? "") !== (noteType ?? "")) {
    entries.push({
      targetTable: TABLE_TECHNICAL_NOTE,
      targetId: id,
      partNumber: before.partNumber,
      fieldName: "種別",
      oldValue: before.noteType,
      newValue: noteType,
      changedBy: userNameId,
    });
  }
  if (before.body !== body) {
    entries.push({
      targetTable: TABLE_TECHNICAL_NOTE,
      targetId: id,
      partNumber: before.partNumber,
      fieldName: "本文",
      oldValue: before.body,
      newValue: body,
      changedBy: userNameId,
    });
  }
  if (entries.length > 0) revisionHistoryRepo.recordMany(entries);

  return updated;
}

export function deleteTechnicalNote(id: number, userNameId: number | null): { id: number } {
  const noteId = Number(id);
  if (!Number.isInteger(noteId) || noteId <= 0) throw new Error("不正な ID です。");
  const before = technicalNoteRepo.getById(noteId);
  if (!before) throw new Error("対象の技術ノートが見つかりません。");

  technicalNoteRepo.softDelete(noteId, userNameId);
  revisionHistoryRepo.record({
    targetTable: TABLE_TECHNICAL_NOTE,
    targetId: noteId,
    partNumber: before.partNumber,
    fieldName: "(削除)",
    oldValue: before.body,
    newValue: null,
    changedBy: userNameId,
  });
  return { id: noteId };
}

/* -------------------- 加工履歴 -------------------- */

export function listProcessHistories(partNumber: string): ProcessHistory[] {
  const pn = partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");
  const rows = processHistoryRepo.listByPart(pn);
  if (rows.length === 0) return rows;
  const machineMap = masterRef.buildMachineNameMap();
  const userMap = masterRef.buildUserNameMap();
  return rows.map((r) => ({
    ...r,
    machineName: r.machineId != null ? machineMap.get(r.machineId) ?? null : null,
    createdByName: resolveUser(userMap, r.createdBy),
  }));
}

export function createProcessHistory(
  input: ProcessHistoryCreateInput,
  userNameId: number | null
): ProcessHistory {
  const partNumber = input.partNumber?.trim();
  if (!partNumber) throw new Error("品番を指定してください。");
  const processedAt = input.processedAt?.trim() || null;
  const machineId =
    input.machineId != null && Number.isInteger(Number(input.machineId))
      ? Number(input.machineId)
      : null;
  const comment = input.comment?.trim() || null;
  const isTest = input.isTest === true;

  const created = processHistoryRepo.insert({
    partNumber,
    processedAt,
    machineId,
    isTest,
    comment,
    createdBy: userNameId,
  });
  revisionHistoryRepo.record({
    targetTable: TABLE_PROCESS_HISTORY,
    targetId: created.id,
    partNumber,
    fieldName: "(加工履歴 追加)",
    oldValue: null,
    newValue: isTest ? "テスト加工" : "加工",
    changedBy: userNameId,
  });

  const machineName =
    machineId != null ? masterRef.buildMachineNameMap().get(machineId) ?? null : null;
  return { ...created, machineName };
}

/* -------------------- 更新履歴 -------------------- */

export function listRevisionHistories(partNumber: string): RevisionHistory[] {
  const pn = partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");
  const rows = revisionHistoryRepo.listByPart(pn);
  if (rows.length === 0) return rows;
  const userMap = masterRef.buildUserNameMap();
  return rows.map((r) => ({
    ...r,
    changedByName: resolveUser(userMap, r.changedBy),
  }));
}

/* -------------------- 加工条件 -------------------- */

function resolveConditionNames(condition: ProcessCondition): ProcessCondition {
  const userMap = masterRef.buildUserNameMap();
  const upperMap = masterRef.buildUpperToolNameMap();
  const lowerMap = masterRef.buildLowerToolNameMap();
  const machineMap = masterRef.buildMachineNameMap();
  const holderMap = masterRef.buildToolHolderNameMap();
  return {
    ...condition,
    createdByName: resolveUser(userMap, condition.createdBy),
    updatedByName: resolveUser(userMap, condition.updatedBy),
    bends: condition.bends.map((b) => ({
      ...b,
      upperToolName: b.upperToolId != null ? upperMap.get(b.upperToolId) ?? null : null,
      lowerToolName: b.lowerToolId != null ? lowerMap.get(b.lowerToolId) ?? null : null,
      machineName: b.machineId != null ? machineMap.get(b.machineId) ?? null : null,
    })),
    stack: {
      upper: condition.stack.upper.map((item) => ({
        ...item,
        holderName: holderMap.get(item.holderId) ?? null,
      })),
      lower: condition.stack.lower.map((item) => ({
        ...item,
        holderName: holderMap.get(item.holderId) ?? null,
      })),
    },
  };
}

export function getProcessCondition(partNumber: string): ProcessCondition | null {
  const pn = partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");
  const condition = processConditionRepo.getByPart(pn);
  return condition ? resolveConditionNames(condition) : null;
}

export function saveProcessCondition(
  input: ProcessConditionInput,
  userNameId: number | null
): ProcessCondition {
  const partNumber = input.partNumber?.trim();
  if (!partNumber) throw new Error("品番を指定してください。");

  const thickness = normalizeNumber(input.thickness);
  const processScore = normalizeNumber(input.processScore);
  const material = input.material?.trim() || null;
  const workDirection = input.workDirection?.trim() || null;
  const note = input.note?.trim() || null;

  const before = processConditionRepo.getByPart(partNumber);

  const bends = (input.bends ?? [])
    .map((b, index) => ({
      bendSequence: Number.isInteger(b.bendSequence) ? b.bendSequence : index + 1,
      detectedBendIndex: normalizeId(b.detectedBendIndex),
      upperToolId: normalizeId(b.upperToolId),
      lowerToolId: normalizeId(b.lowerToolId),
      machineId: normalizeId(b.machineId),
      backGauge: normalizeNumber(b.backGauge),
      angle: normalizeNumber(b.angle),
      bendRadius: normalizeNumber(b.bendRadius),
      note: b.note?.trim() || null,
    }))
    .sort((a, b) => a.bendSequence - b.bendSequence);

  const stack = normalizeStack(input.stack);

  const saved = processConditionRepo.save({
    partNumber,
    material,
    thickness,
    processScore,
    workDirection,
    note,
    bends,
    stack,
    userNameId,
  });

  recordConditionChanges(before, saved, userNameId);
  return resolveConditionNames(saved);
}

/** 自動選定のプレビュー（保存しない） */
export function previewAutoSelect(
  input: ApplyAutoSelectInput
): AutoSelectPreview {
  const pn = input.partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");

  const record = getAnalysis(pn);
  if (!record?.analysis) {
    throw new Error("形状解析が未保存です。「シミュレーション」タブで STEP を表示し、解析が完了するまでお待ちください。");
  }

  const existing = processConditionRepo.getByPart(pn);
  const preview = buildAutoSelect(
    record.analysis,
    masterRef.listLowerTools(),
    masterRef.listUpperTools(),
    masterRef.listToolHolders(),
    masterRef.listMachines(),
    {
      existingMaterial: existing?.material ?? null,
      material: input.material,
      machineId: input.machineId,
      preserveMaterial: input.preserveMaterial,
    }
  );
  return preview;
}

/** 形状解析・推奨曲げ順・金型マスタから加工条件を自動生成して保存する */
export function applyAutoSelect(
  input: ApplyAutoSelectInput,
  userNameId: number | null
): ApplyAutoSelectResult {
  const preview = previewAutoSelect(input);
  const existing = processConditionRepo.getByPart(input.partNumber.trim());

  const saved = saveProcessCondition(
    {
      partNumber: input.partNumber.trim(),
      material: preview.material,
      thickness: preview.thickness,
      processScore: existing?.processScore ?? null,
      workDirection: existing?.workDirection ?? null,
      note: existing?.note ?? null,
      bends: preview.bends,
      stack: preview.stack,
    },
    userNameId
  );

  return { condition: saved, preview };
}

function recordConditionChanges(
  before: ProcessCondition | null,
  after: ProcessCondition,
  userNameId: number | null
): void {
  const entries = [] as Parameters<typeof revisionHistoryRepo.recordMany>[0];
  const push = (fieldName: string, oldValue: string | null, newValue: string | null): void => {
    if ((oldValue ?? "") === (newValue ?? "")) return;
    entries.push({
      targetTable: TABLE_PROCESS_CONDITION,
      targetId: after.id,
      partNumber: after.partNumber,
      fieldName,
      oldValue,
      newValue,
      changedBy: userNameId,
    });
  };

  if (before == null) {
    entries.push({
      targetTable: TABLE_PROCESS_CONDITION,
      targetId: after.id,
      partNumber: after.partNumber,
      fieldName: "(加工条件 作成)",
      oldValue: null,
      newValue: null,
      changedBy: userNameId,
    });
  } else {
    push("材質", before.material, after.material);
    push("板厚", numToStr(before.thickness), numToStr(after.thickness));
    push("加工性評価", numToStr(before.processScore), numToStr(after.processScore));
    push("ワーク向き", before.workDirection, after.workDirection);
    push("注意事項", before.note, after.note);
    push("曲げ順ステップ数", String(before.bends.length), String(after.bends.length));
    push("金型スタック", describeStack(before.stack), describeStack(after.stack));
  }

  if (entries.length > 0) revisionHistoryRepo.recordMany(entries);
}

function numToStr(value: number | null): string | null {
  return value == null ? null : String(value);
}

function describeStack(stack: ToolStack): string {
  const fmt = (items: ToolStack["upper"]): string =>
    items.length === 0 ? "なし" : items.map((item) => item.holderName ?? `#${item.holderId}`).join(" → ");
  return `上 ${fmt(stack.upper)} ／ 下 ${fmt(stack.lower)}`;
}

/**
 * スタック入力を正規化する。
 * 種別が側と合わないホルダー、最大段数を超える積みは保存させない。
 */
function normalizeStack(input: ToolStackInput | undefined): ToolStackInput {
  const holders = masterRef.buildToolHolderMap();
  return {
    upper: normalizeStackSide("upper", input?.upper, holders),
    lower: normalizeStackSide("lower", input?.lower, holders),
  };
}

function normalizeStackSide(
  side: ToolStackSide,
  ids: readonly number[] | undefined,
  holders: Map<number, ToolHolderOption>
): number[] {
  const counts = new Map<number, number>();
  const result: number[] = [];
  for (const raw of ids ?? []) {
    const holderId = normalizeId(raw);
    if (holderId == null) continue;
    const holder = holders.get(holderId);
    if (!holder) throw new Error("選択したホルダー・中間板がマスタにありません。");
    if (holder.holderType != null && HOLDER_TYPE_SIDES[holder.holderType] !== side) {
      throw new Error(
        `「${holder.name}」は${TOOL_STACK_SIDE_LABELS[side]}には使えません。`
      );
    }
    const used = (counts.get(holderId) ?? 0) + 1;
    counts.set(holderId, used);
    if (holder.maxStack != null && used > holder.maxStack) {
      throw new Error(
        `「${holder.name}」は最大 ${holder.maxStack} 段までです。`
      );
    }
    result.push(holderId);
  }
  return result;
}

/* -------------------- 3Dモデル（シミュレーション） -------------------- */

export function getSimulationModel(partNumber: string): SimulationModel | null {
  const pn = partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");
  const raw = simulationRepo.getRawByPart(pn);
  const model = simulationRepo.getByPart(pn);
  if (!raw || !model) return null;
  const userMap = masterRef.buildUserNameMap();
  return { ...model, updatedByName: resolveUser(userMap, raw.updated_by) };
}

export async function saveSimulationModelFromPath(
  partNumber: string,
  sourceAbsolutePath: string,
  userNameId: number | null
): Promise<SimulationModel> {
  const pn = partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");
  if (!sourceAbsolutePath) throw new Error("ファイルが選択されませんでした。");

  const previous = simulationRepo.getRawByPart(pn);
  const { relativePath } = await modelStorage.saveStepModel(sourceAbsolutePath, pn);
  const saved = simulationRepo.setModelPath(pn, relativePath, userNameId);

  if (previous?.model_file_path && previous.model_file_path !== relativePath) {
    await modelStorage.unlinkModelIfExists(previous.model_file_path);
  }
  return saved;
}

export async function readSimulationModelFile(
  partNumber: string
): Promise<SimulationModelFilePayload> {
  const pn = partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");
  const model = simulationRepo.getByPart(pn);
  if (!model?.modelFilePath) {
    throw new Error("3Dモデルが登録されていません。");
  }
  return modelStorage.readStepModel(model.modelFilePath);
}

export async function deleteSimulationModel(
  partNumber: string,
  userNameId: number | null
): Promise<{ partNumber: string }> {
  const pn = partNumber?.trim();
  if (!pn) throw new Error("品番を指定してください。");
  const removedPath = simulationRepo.clearModel(pn, userNameId);
  if (removedPath) {
    await modelStorage.unlinkModelIfExists(removedPath);
  }
  return { partNumber: pn };
}

function normalizeNumber(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeId(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 板金製造支援システム（曲げ支援）の共有型。Phase 1: 品番検索・図面表示。 */

/** 品番の検索結果サマリ（最新版図面のメタ情報） */
export interface PartSummary {
  partNumber: string;
  drawingId: number | null;
  customerName: string | null;
  model: string | null;
  revision: string | null;
  updatedAt: string | null;
}

/** 部品詳細（Phase 1 は図面メタのみ。加工条件等は Phase 2 で拡張） */
export interface PartDetail extends PartSummary {
  drawingNumber: string | null;
  title: string | null;
  filePath: string | null;
}

/** 品番検索のカスケード候補（客先→機種→品番） */
export interface PartSearchCascadeOptions {
  customers: string[];
  models: string[];
  partNumbers: string[];
}

export interface PartSearchCascadeParams {
  customerName?: string | null;
  model?: string | null;
}

export interface PartSearchParams {
  keyword?: string | null;
  customerName?: string | null;
  model?: string | null;
  partNumber?: string | null;
  page?: number;
  pageSize?: number;
}

export interface PartSearchResult {
  items: PartSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** PDF ファイル取得結果（base64） */
export interface DrawingFilePayload {
  fileName: string;
  base64: string;
  mime: string;
}

export interface SheetMetalSupportStatus {
  ready: boolean;
}

/* ============================================================
 * Phase 2: 加工情報管理（技術ノート・加工履歴・更新履歴）
 * ============================================================ */

/** 技術ノートの種別 */
export const TECHNICAL_NOTE_TYPES = ["改善案", "設計メモ", "現場メモ", "注意事項"] as const;
export type TechnicalNoteType = (typeof TECHNICAL_NOTE_TYPES)[number];

/** 機械マスタ選択肢（master.db `m_machines` の read-only 参照） */
export interface MachineOption {
  id: number;
  code: string;
  name: string;
  /** 加圧能力（kN・未登録は null） */
  pressCapacity: number | null;
  /** テーブル長（mm） */
  tableLength: number | null;
  /** 開口高さ（mm） */
  openHeight: number | null;
  /** ストローク（mm） */
  strokeLength: number | null;
}

/** 技術ノート（`technical_notes`） */
export interface TechnicalNote {
  id: number;
  partNumber: string;
  noteType: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  createdBy: number | null;
  updatedBy: number | null;
  createdByName: string | null;
  updatedByName: string | null;
}

export interface TechnicalNoteCreateInput {
  partNumber: string;
  noteType?: string | null;
  body: string;
}

export interface TechnicalNoteUpdateInput {
  id: number;
  noteType?: string | null;
  body: string;
}

/** 加工履歴（`process_histories`）。テスト加工も本テーブルで管理する。 */
export interface ProcessHistory {
  id: number;
  partNumber: string;
  processedAt: string | null;
  machineId: number | null;
  machineName: string | null;
  isTest: boolean;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: number | null;
  createdByName: string | null;
}

export interface ProcessHistoryCreateInput {
  partNumber: string;
  processedAt?: string | null;
  machineId?: number | null;
  isTest?: boolean;
  comment?: string | null;
}

/** 更新履歴（`revision_histories`・監査ログ・削除不可）。Service が自動記録する。 */
export interface RevisionHistory {
  id: number;
  targetTable: string;
  targetId: number;
  partNumber: string | null;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: number | null;
  changedByName: string | null;
  changedAt: string;
}

/**
 * 金型マスタ選択肢（master.db `m_upper_tools` / `m_lower_tools` の read-only 参照）。
 * 上型・下型で共通の型を使うため、寸法はどちらか一方でのみ設定される。
 */
export interface ToolOption {
  id: number;
  code: string;
  name: string;
  /** 下型: ダイ V 溝幅（mm） */
  vWidth: number | null;
  /** 下型: ダイ角度（°） */
  dieAngle: number | null;
  /** 下型: 肩R（mm） */
  shoulderRadius: number | null;
  /** 上型: 先端R（mm） */
  tipRadius: number | null;
  /** 上型: 先端角度（°） */
  tipAngle: number | null;
  /** 型高さ（mm） */
  toolHeight: number | null;
  /** 耐圧（kN / 曲げ長さ 1m） */
  maxLoad: number | null;
  /** 取り付けられる機械の ID。空配列は全機械で共用。 */
  machineIds: number[];
  /** パンチの型式（上型のみ） */
  punchType: PunchType | null;
  /** 剣先中心からパンチ本体面までの片側の張り出し（mm・上型のみ） */
  bodyOffset: number | null;
  /** 逃げ高さ（mm・グースネック等） */
  reliefHeight: number | null;
  /** 逃げ奥行き（mm・グースネック等） */
  reliefDepth: number | null;
  /** 取付規格（シャンク・溝の呼称。未入力なら規格の突き合わせは行わない） */
  mountStandard: string | null;
}

/**
 * ホルダー・中間板の種別。
 * 種別によって積む側が決まるため、上下の区別も兼ねる。
 */
export const HOLDER_TYPES = ["intermediatePlate", "dieHolder"] as const;
export type HolderType = (typeof HOLDER_TYPES)[number];

export const HOLDER_TYPE_LABELS: Record<HolderType, string> = {
  intermediatePlate: "中間板（上型側）",
  dieHolder: "ダイホルダー（下型側）",
};

export function isHolderType(value: unknown): value is HolderType {
  return typeof value === "string" && (HOLDER_TYPES as readonly string[]).includes(value);
}

/** 金型スタックの側（上型側＝ラム側 / 下型側＝テーブル側） */
export const TOOL_STACK_SIDES = ["upper", "lower"] as const;
export type ToolStackSide = (typeof TOOL_STACK_SIDES)[number];

export const TOOL_STACK_SIDE_LABELS: Record<ToolStackSide, string> = {
  upper: "上型側（ラム → パンチ）",
  lower: "下型側（テーブル → ダイ）",
};

/** 種別ごとに積める側 */
export const HOLDER_TYPE_SIDES: Record<HolderType, ToolStackSide> = {
  intermediatePlate: "upper",
  dieHolder: "lower",
};

export function isToolStackSide(value: unknown): value is ToolStackSide {
  return typeof value === "string" && (TOOL_STACK_SIDES as readonly string[]).includes(value);
}

/**
 * ホルダー・中間板マスタ選択肢（master.db `m_tool_holders` の read-only 参照）。
 * ダイホルダーの段積みは、同じホルダーを複数段として積むことで表現する。
 */
export interface ToolHolderOption {
  id: number;
  code: string;
  name: string;
  holderType: HolderType | null;
  /** 型高さ（mm） */
  toolHeight: number | null;
  /** 耐圧（kN / 曲げ長さ 1m） */
  maxLoad: number | null;
  /** 上面から見た片側の張り出し（mm）。下向きフランジとの干渉判定に使用する */
  topOffset: number | null;
  /** 積める最大段数（1 なら段積み不可） */
  maxStack: number | null;
  /** 取付規格（未入力なら規格の突き合わせは行わない） */
  mountStandard: string | null;
  /** 取り付けられる機械の ID。空配列は全機械で共用。 */
  machineIds: number[];
}

/** 金型スタックの 1 段（position は機械側から数えた並び順・1 始まり） */
export interface ToolStackItem {
  position: number;
  holderId: number;
  holderName: string | null;
}

/** 品番ごとの金型スタック構成（`process_condition_stacks`） */
export interface ToolStack {
  upper: ToolStackItem[];
  lower: ToolStackItem[];
}

/** スタックの入力（機械側から順に積むホルダー ID） */
export interface ToolStackInput {
  upper?: number[];
  lower?: number[];
}

/**
 * パンチ（上型）の型式。
 * 型式によって「先に曲げたフランジをどれだけ逃がせるか」が変わるため、
 * 干渉判定では型式と逃げ寸法をあわせて評価する。
 */
export const PUNCH_TYPES = ["straight", "gooseneck", "acute", "radius"] as const;
export type PunchType = (typeof PUNCH_TYPES)[number];

export const PUNCH_TYPE_LABELS: Record<PunchType, string> = {
  straight: "ストレート",
  gooseneck: "グースネック",
  acute: "鋭角",
  radius: "ラジアス",
};

/** 逃げ（フランジを収める空間）を持つ型式か */
export const RELIEF_PUNCH_TYPES: readonly PunchType[] = ["gooseneck"];

export function isPunchType(value: unknown): value is PunchType {
  return typeof value === "string" && (PUNCH_TYPES as readonly string[]).includes(value);
}

/** 金型・ホルダーがその機械に取り付けられるか（対応機械が空なら共用） */
export function isToolUsableOnMachine(
  tool: { machineIds: readonly number[] },
  machineId: number | null
): boolean {
  if (tool.machineIds.length === 0) return true;
  if (machineId == null) return true;
  return tool.machineIds.includes(machineId);
}

/** 加工条件の曲げ順ステップ（`process_condition_bends`） */
export interface ProcessConditionBend {
  id: number | null;
  bendSequence: number;
  upperToolId: number | null;
  lowerToolId: number | null;
  machineId: number | null;
  backGauge: number | null;
  angle: number | null;
  bendRadius: number | null;
  note: string | null;
  upperToolName: string | null;
  lowerToolName: string | null;
  machineName: string | null;
}

/** 加工条件（`process_conditions`）＋曲げ順。品番ごとに 1 件。 */
export interface ProcessCondition {
  id: number;
  partNumber: string;
  material: string | null;
  thickness: number | null;
  processScore: number | null;
  workDirection: string | null;
  note: string | null;
  bends: ProcessConditionBend[];
  /** ホルダー・中間板の段構成（品番ごとに 1 構成） */
  stack: ToolStack;
  createdAt: string;
  updatedAt: string;
  createdBy: number | null;
  updatedBy: number | null;
  createdByName: string | null;
  updatedByName: string | null;
}

export interface ProcessConditionBendInput {
  bendSequence: number;
  upperToolId?: number | null;
  lowerToolId?: number | null;
  machineId?: number | null;
  backGauge?: number | null;
  angle?: number | null;
  bendRadius?: number | null;
  note?: string | null;
}

export interface ProcessConditionInput {
  partNumber: string;
  material?: string | null;
  thickness?: number | null;
  processScore?: number | null;
  workDirection?: string | null;
  note?: string | null;
  bends: ProcessConditionBendInput[];
  stack?: ToolStackInput;
}

/* ============================================================
 * Phase 3: 3Dシミュレーション基盤（STEP 表示）
 * ============================================================ */

/** STEP 3Dモデル（`simulations`）。品番ごとに 1 件。 */
export interface SimulationModel {
  id: number;
  partNumber: string;
  /** データルートからの相対パス（未登録は null） */
  modelFilePath: string | null;
  /** 表示用ファイル名（modelFilePath の basename） */
  fileName: string | null;
  status: string;
  updatedAt: string;
  updatedByName: string | null;
}

/** STEP ファイルのバイト内容（base64） */
export interface SimulationModelFilePayload {
  fileName: string;
  base64: string;
}

/* ============================================================
 * Phase 4: 加工判断エンジン（金型選定・加工条件生成・加工性評価・改善案）
 * ============================================================ */

export type Vec3 = [number, number, number];

/**
 * 曲げ検出の確度。
 * 内側と外側の円筒が板厚ぶん離れて同軸に存在すれば曲げと断定できる（high）。
 * 片側しか取れなかった場合は曲げ以外の可能性が残るため要確認とする（review）。
 */
export type BendConfidence = "high" | "review";

/** STEP 形状から検出した曲げ部（円筒面） */
export interface DetectedBend {
  /** 検出順（1 始まり・座標順で安定化） */
  index: number;
  /** 内側曲げ半径（mm） */
  innerRadius: number;
  /** 外側曲げ半径（mm）。対となる面を検出できない場合は null */
  outerRadius: number | null;
  /** 曲げ角度（円筒面の回転角＝材料の振れ角） */
  angleDeg: number;
  /** 曲げ線の長さ（mm） */
  lengthMm: number;
  /** 曲げ軸の方向（単位ベクトル） */
  axisDir: Vec3;
  /** 曲げ軸の端点（モデル座標） */
  axisStart: Vec3;
  axisEnd: Vec3;
  /** 検出の確度（旧データには無いので任意） */
  confidence?: BendConfidence;
}

/** 曲げ以外として除外した円筒面の内訳 */
export interface CylinderBreakdown {
  /** 全周円筒（穴・バーリング） */
  holes: number;
  /** 外形コーナーR・スロット端（軸方向の長さが板厚と同程度） */
  cornerFillets: number;
  /** 面取りR・エッジR（半径が板厚に対して極小） */
  edgeFillets: number;
}

/** 分類の基準に用いた板厚の出典 */
export type ThicknessSource = "condition" | "estimated" | "unknown";

/** STEP 形状の解析結果 */
export interface ModelAnalysis {
  bends: DetectedBend[];
  /** 内外円筒の半径差から推定した板厚（mm）。推定できなければ null */
  thickness: number | null;
  /**
   * 円筒面の分類に用いた板厚（mm）。加工条件の登録値を優先する。
   * null の場合は基準が無く分類を保留している（旧データには無いので任意）。
   */
  basisThickness?: number | null;
  /** 基準板厚の出典（旧データには無いので任意） */
  thicknessSource?: ThicknessSource;
  /** 解析対象となった BREP 面の数 */
  faceCount: number;
  /** 検出した円筒面の数（穴を含む） */
  cylinderCount: number;
  /** 全周円筒（穴・バーリング）とみなして除外した数 */
  holeCount: number;
  /** 曲げ以外として除外した円筒面の内訳（旧データには無いので任意） */
  excluded?: CylinderBreakdown;
  /** `brep_faces` を利用できたか（false の場合は面単位の判定ができていない） */
  brepFacesAvailable: boolean;
  /** 外形の境界箱（曲げ順・干渉の推定に使用） */
  boundingBox: { min: Vec3; max: Vec3 } | null;
}

/** 保存済みの形状解析（`model_analyses`） */
export interface ModelAnalysisRecord {
  partNumber: string;
  analysis: ModelAnalysis;
  analyzedAt: string;
  analyzedByName: string | null;
}

/** 自動生成した曲げ順の 1 ステップ */
export interface PlannedBendStep {
  /** 推奨する加工順（1 始まり） */
  order: number;
  /** 対応する検出曲げの番号 */
  detectedIndex: number;
  innerRadius: number;
  angleDeg: number;
  lengthMm: number;
  /** 曲げ線から外形境界までの推定フランジ長（mm） */
  flangeLengthMm: number | null;
  /** この順序に決めた理由 */
  reason: string;
}

export interface BendSequencePlan {
  steps: PlannedBendStep[];
  /** 生成ルールと前提の説明 */
  notes: string[];
}

export type InterferenceLevel = "none" | "caution" | "risk" | "unknown";

export interface InterferenceItem {
  /** 対象の加工順 */
  order: number;
  message: string;
  severity: JudgementSeverity;
}

export interface InterferenceCheck {
  level: InterferenceLevel;
  summary: string;
  items: InterferenceItem[];
}

/** 必要加圧力の判定レベル */
export type PressForceLevel = "ok" | "caution" | "over" | "unknown";

export const PRESS_FORCE_LABELS: Record<PressForceLevel, string> = {
  ok: "能力内",
  caution: "能力の余裕が少ない",
  over: "能力不足",
  unknown: "判定不可",
};

/**
 * 必要加圧力の判定（部品全体）。
 * 曲げ荷重は V 幅が小さいほど大きく、曲げ線が長いほど大きくなるため、
 * もっとも厳しくなる組み合わせ（最小 V 幅 × 最長曲げ線）で評価する。
 */
export interface PressForceCheck {
  level: PressForceLevel;
  /** 判定に使用した V 幅（mm） */
  vWidth: number | null;
  /** V 幅を金型マスタの登録値から取得できたか（false は推奨値・名称からの推定） */
  vWidthFromMaster: boolean;
  /** 曲げ荷重（kN / 曲げ長さ 1m） */
  forcePerMeter: number | null;
  /** 判定に使用した曲げ線長さ（mm・最長の曲げ） */
  bendLengthMm: number | null;
  /** 必要加圧力（kN） */
  requiredForce: number | null;
  /** 判定対象の機械（加工条件で選択された中でもっとも能力が低いもの） */
  machineName: string | null;
  /** 機械の加圧能力（kN） */
  machineCapacity: number | null;
  /** 加圧能力に対する使用率（1.0 で能力ちょうど） */
  usageRatio: number | null;
  /** 金型耐圧（kN / 曲げ長さ 1m） */
  toolMaxLoad: number | null;
  message: string;
}

/** 総合判定レベル（加工性評価の点数帯から決定） */
export type JudgementLevel = "good" | "ok" | "caution" | "difficult";

export const JUDGEMENT_LABELS: Record<JudgementLevel, string> = {
  good: "加工性良好",
  ok: "加工可能",
  caution: "注意が必要",
  difficult: "加工困難",
};

/** 減点の重大度 */
export type JudgementSeverity = "info" | "warn" | "error";

/** 判断理由（STD-009: 判断は必ず理由を伴う） */
export interface JudgementReason {
  /** 分類（材質 / 板厚 / 曲げR / 金型 など） */
  category: string;
  message: string;
  severity: JudgementSeverity;
  /** 減点値（0 は情報のみ） */
  deduction: number;
  /** 対象の曲げ順（全体に対する指摘は null） */
  bendSequence: number | null;
}

/** 曲げ 1 ステップごとのエンジン算出結果 */
export interface BendJudgement {
  bendSequence: number;
  /** 推奨ダイ V 幅（mm） */
  recommendedVWidth: number | null;
  /** 推奨内側曲げ R（mm） */
  recommendedInnerRadius: number | null;
  /** 最小フランジ長（mm） */
  minFlangeLength: number | null;
  /** 曲げ荷重（kN / 曲げ長さ 1m あたり） */
  bendForcePerMeter: number | null;
  /** 選定済み下型（未選定は null） */
  lowerToolName: string | null;
  /** 推奨 V 幅に合致する下型マスタの候補 */
  suggestedLowerToolName: string | null;
  upperToolName: string | null;
  issues: string[];
}

/** 判断エンジンの実行結果（`simulation_results`） */
export interface SimulationResult {
  id: number | null;
  partNumber: string;
  judgement: JudgementLevel;
  judgementLabel: string;
  processScore: number;
  /** 干渉判定（3D 解析は Phase 4 後半。現状は未評価） */
  interferenceResult: string | null;
  reasons: JudgementReason[];
  recommendations: string[];
  bends: BendJudgement[];
  /** 判定に使用した材質（加工条件の入力値） */
  material: string | null;
  /** 材質マスタ相当の定義に解決できたか */
  materialResolved: boolean;
  /** 判定に使用した引張強さ（N/mm²） */
  tensileStrength: number | null;
  thickness: number | null;
  /** 形状解析（STEP）を判定に利用できたか */
  analysisAvailable: boolean;
  /** 形状から自動生成した曲げ順（解析が無い場合は null） */
  plan: BendSequencePlan | null;
  /** 干渉判定（解析が無い場合は level="unknown"） */
  interference: InterferenceCheck | null;
  /** 必要加圧力と機械能力の突き合わせ */
  pressForce: PressForceCheck | null;
  evaluatedAt: string;
  evaluatedByName: string | null;
}

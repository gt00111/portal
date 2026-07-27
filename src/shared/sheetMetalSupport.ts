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

/** 金型マスタ選択肢（master.db `m_upper_tools` / `m_lower_tools` の read-only 参照） */
export interface ToolOption {
  id: number;
  code: string;
  name: string;
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

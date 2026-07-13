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

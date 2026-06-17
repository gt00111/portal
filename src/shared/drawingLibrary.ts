/** 図面ライブラリ専用 DB（`drawing-library.db`）の行・入出力型 */

export interface LibDrawingRow {
  id: number;
  title: string;
  description: string | null;
  file_path: string | null;
  category: string | null;
  tags: string | null;
  customer_name: string | null;
  model: string | null;
  product_name: string | null;
  drawing_number: string | null;
  revision: string | null;
  drawing_type: string | null;
  is_obsolete: number;
  /** Rev 変更理由（§8.4.6） */
  change_summary: string | null;
  created_at: string;
  updated_at: string;
}

/** `drawing:list` の自社発行行（現行版フラグ付き） */
export interface LibDrawingListItem extends LibDrawingRow {
  is_current: boolean;
}

export interface DrawingUpsertInput {
  title: string;
  description?: string | null;
  file_path?: string | null;
  category?: string | null;
  tags?: string | null;
  customer_name?: string | null;
  model?: string | null;
  product_name?: string | null;
  drawing_number?: string | null;
  revision?: string | null;
  change_summary?: string | null;
  drawingType?: "customer" | "work";
}

export interface DrawingListParams {
  search?: string;
  /** カテゴリ（m_categories.code）で完全一致絞り込み */
  category?: string | null;
  limit?: number;
  offset?: number;
  drawingType?: "customer" | "work";
  customerName?: string | null;
  model?: string | null;
  productName?: string | null;
  /** 並び替え列（`drawing:list`） */
  sortBy?: DrawingListSortColumn;
  sortOrder?: "asc" | "desc";
  /** 自社発行: 各 Rev グループの現行版のみ（§8.4.6） */
  currentOnly?: boolean;
}

export type DrawingListSortColumn =
  | "updated_at"
  | "customer_name"
  | "model"
  | "product_name"
  | "revision"
  | "title";

/** 自社発行図面のカスケード用（客先→機種→品番） */
export interface DrawingWorkCascadeResult {
  customers: string[];
  models: string[];
  productNames: string[];
}

export interface DrawingListResult {
  drawings: LibDrawingListItem[];
  total: number;
  limit: number;
  offset: number;
  totalPages: number;
}

export interface DrawingRevHistoryParams {
  customerName: string;
  model: string;
  productName: string;
  drawingType?: "work";
}

export interface LibEdrawingsFileRow {
  id: number;
  drawing_id: number;
  file_path: string;
  file_name: string;
  file_size: number | null;
  created_at: string;
}

export interface LibCommentRow {
  id: number;
  drawing_id: number;
  comment_text: string;
  user_name_id: number | null;
  user_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompareDrawingsInput {
  filePath1: string;
  filePath2: string;
  pageNumber?: number | null;
  roiCoords?: { x: number; y: number; width: number; height: number } | null;
}

export interface CompareDrawingsResult {
  resultImage: string;
  message: string;
}

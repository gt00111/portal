/** 部材管理 ↔ 図面ライブラリ（自社発行）の read-only 連携型 */

export interface PartDrawingLinkInfo {
  drawingId: number;
  revision: string | null;
  productName: string;
}

export interface AssemblyDrawingLinkResolveInput {
  customerName: string;
  model?: string | null;
  /** 案件の親番（トップアセンブリ品番）＝図面ライブラリの assembly_number */
  assemblyNumber: string;
  partNumbers: string[];
}

export interface AssemblyDrawingLinkResolveResult {
  found: boolean;
  customerName: string;
  model: string;
  assemblyNumber: string;
  /** 現行版アセンブリスナップショット内の部品図面件数 */
  assemblyPartCount: number;
  /** 一致した BOM 品番 → 図面リンク */
  links: Record<string, PartDrawingLinkInfo>;
  linkedCount: number;
  message: string | null;
}

export interface PartDrawingFilePayload {
  fileName: string;
  base64: string;
  mime: string;
}

export interface PartDrawingReadFileInput {
  drawingId: number;
}

/** 製品マスタ・製品 BOM（5-A-1 / 5-E 統合・親番テンプレート兼用）の共有型 */

import type { PartSourceType } from "./partsTracker.js";

export const PRODUCT_BOM_STATUSES = ["draft", "released", "obsolete"] as const;
export type ProductBomStatus = (typeof PRODUCT_BOM_STATUSES)[number];

export const PRODUCT_BOM_STATUS_LABELS: Record<ProductBomStatus, string> = {
  draft: "下書き",
  released: "リリース",
  obsolete: "廃止",
};

export const BOM_LINE_KINDS = ["part", "sub_assembly"] as const;
export type BomLineKind = (typeof BOM_LINE_KINDS)[number];

export const BOM_LINE_KIND_LABELS: Record<BomLineKind, string> = {
  part: "末端部品",
  sub_assembly: "サブ組立",
};

export interface ProductRow {
  id: number;
  partNumber: string;
  name: string;
  skuId: number | null;
  defaultSupplierId: number | null;
  defaultSupplierName: string | null;
  note: string | null;
  isActive: boolean;
  bomCount: number;
  latestRevision: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductUpsertInput {
  partNumber: string;
  name: string;
  skuId?: number | null;
  defaultSupplierId?: number | null;
  note?: string | null;
  isActive?: boolean;
}

export interface ProductBomRow {
  id: number;
  productId: number;
  productPartNumber: string;
  productName: string;
  revision: string;
  status: ProductBomStatus;
  releasedAt: string | null;
  releasedByUsername: string | null;
  note: string | null;
  lineCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductBomUpsertInput {
  productId: number;
  revision: string;
  status?: ProductBomStatus;
  note?: string | null;
}

export interface ProductBomLineRow {
  id: number;
  productBomId: number;
  lineKind: BomLineKind;
  partNumber: string;
  partName: string;
  quantity: number;
  sourceType: PartSourceType;
  supplierId: number | null;
  supplierName: string | null;
  skuId: number | null;
  refProductBomId: number | null;
  refPartNumber: string | null;
  refSummary: string | null;
  sortOrder: number;
  note: string | null;
}

export interface ProductBomLineUpsertInput {
  productBomId: number;
  lineKind: BomLineKind;
  partNumber: string;
  partName: string;
  quantity?: number;
  sourceType: PartSourceType;
  supplierId?: number | null;
  skuId?: number | null;
  refProductBomId?: number | null;
  refPartNumber?: string | null;
  sortOrder?: number;
  note?: string | null;
}

export interface ProductBomExpandPreviewItem {
  partNumber: string;
  partName: string;
  quantity: number;
  sourceType: PartSourceType;
  supplierId: number | null;
  skuId: number | null;
  bomLevel: number;
  assemblyPath: string;
  parentAssemblyPartNumber: string | null;
  sourceProductBomLineId: number;
  rootProductBomId: number;
}

export interface ProductBomExpandPreview {
  rootProductBomId: number;
  productPartNumber: string;
  productRevision: string;
  totalLeafLines: number;
  subAssemblyCount: number;
  maxDepth: number;
  missingSubAssemblies: Array<{
    partNumber: string;
    sourceProductBomLineId: number;
    parentAssemblyPath: string;
  }>;
  cycleDetected: boolean;
  cyclePath?: string[];
  items: ProductBomExpandPreviewItem[];
}

export type ExpandDuplicatePolicy = "skip" | "addQuantity" | "overwrite";

export interface ProductBomExpandInput {
  seisanProjectId: string;
  productBomId: number;
  duplicatePolicy?: ExpandDuplicatePolicy;
  requiredDate?: string | null;
  multiplier?: number;
}

export interface ProductBomExpandResult {
  rootProductBomId: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  missingSubAssemblies: number;
}

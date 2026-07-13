import type {
  DrawingFilePayload,
  PartDetail,
  PartSearchCascadeOptions,
  PartSearchCascadeParams,
  PartSearchParams,
  PartSearchResult,
  PartSummary,
} from "@shared/sheetMetalSupport.js";

import * as drawingRef from "./drawing-ref.repo.js";

function toSummary(row: drawingRef.WorkDrawingRefRow): PartSummary {
  return {
    partNumber: row.product_name ?? row.drawing_number ?? "",
    drawingId: row.id,
    customerName: row.customer_name,
    model: row.model,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

export function getCascadeOptions(params: PartSearchCascadeParams): PartSearchCascadeOptions {
  const customer = params.customerName?.trim() ?? "";
  const model = params.model?.trim() ?? "";
  return {
    customers: drawingRef.listWorkCustomers(),
    models: customer ? drawingRef.listWorkModels(customer) : [],
    partNumbers: customer && model ? drawingRef.listWorkProductNames(customer, model) : [],
  };
}

export function searchParts(params: PartSearchParams): PartSearchResult {
  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);

  const rows = drawingRef.listCurrentWorkDrawings({
    keyword: params.keyword ?? null,
    customerName: params.customerName ?? null,
    model: params.model ?? null,
    productName: params.partNumber ?? null,
  });

  const total = rows.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize).map(toSummary);

  return { items, total, page, pageSize, totalPages };
}

export function getPartDetail(partNumber: string): PartDetail | null {
  const pn = partNumber?.trim();
  if (!pn) {
    throw new Error("品番を指定してください。");
  }
  const row = drawingRef.getCurrentWorkDrawingByPartNumber(pn);
  if (!row) return null;
  return {
    ...toSummary(row),
    drawingNumber: row.drawing_number,
    title: row.title,
    filePath: row.file_path,
  };
}

export async function getDrawingFile(drawingId: number): Promise<DrawingFilePayload> {
  if (!Number.isInteger(drawingId) || drawingId <= 0) {
    throw new Error("図面 ID が不正です。");
  }
  return drawingRef.readWorkDrawingFile(drawingId);
}

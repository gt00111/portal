export interface SkuRow {
  id: number;
  customerId: number | null;
  modelId: number | null;
  partNumberId: number | null;
  componentNameId: number | null;
  drawingNumber: string | null;
  revision: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  customerCode: string | null;
  customerName: string | null;
  modelCode: string | null;
  modelName: string | null;
  partNumberCode: string | null;
  partNumberName: string | null;
  componentNameCode: string | null;
  componentNameName: string | null;
}

export interface SkuUpsertInput {
  customerId: number | null;
  modelId: number | null;
  partNumberId: number | null;
  componentNameId: number | null;
  drawingNumber: string | null;
  revision: string | null;
  note?: string | null;
  isActive?: boolean;
}

/** 部材管理 BOM CSV 取込（SolidWorks 想定）の列定義・テンプレ生成 */

import type { PartSourceType } from "./partsTracker.js";

export interface BomCsvColumnDef {
  /** 内部キー（DB 列） */
  key: BomCsvFieldKey;
  /** CSV ヘッダ候補（複数受け付け・大文字小文字無視） */
  headers: string[];
  /** ヘルプ用表示名 */
  label: string;
  /** 必須かどうか */
  required: boolean;
  description: string;
}

export type BomCsvFieldKey =
  | "partNumber"
  | "partName"
  | "quantity"
  | "revision"
  | "sourceType"
  | "supplierName"
  | "assemblyLevel"
  | "parentAssemblyPartNumber"
  | "note";

export const BOM_CSV_COLUMNS: BomCsvColumnDef[] = [
  {
    key: "partNumber",
    headers: ["品番", "Part Number", "PartNumber", "PART NUMBER", "PART_NO"],
    label: "品番",
    required: true,
    description: "部品の図面番号 / 品番。必須。",
  },
  {
    key: "partName",
    headers: ["名称", "Description", "DESCRIPTION", "NAME", "部品名称"],
    label: "部品名称",
    required: true,
    description: "部品の名称・説明。必須（空なら品番で代用）。",
  },
  {
    key: "quantity",
    headers: ["数量", "QTY", "Quantity", "QUANTITY"],
    label: "数量",
    required: false,
    description: "親 1 個あたりの員数。未指定なら 1。",
  },
  {
    key: "revision",
    headers: ["リビジョン", "REV", "Rev", "Revision", "REVISION"],
    label: "リビジョン",
    required: false,
    description: "部品のリビジョン（A・01 等）。空欄可。",
  },
  {
    key: "sourceType",
    headers: ["調達区分", "区分", "Source", "SOURCE"],
    label: "調達区分",
    required: false,
    description: "inhouse / purchase / supplied、または 社内製作 / 購入 / 支給品。未指定なら 購入。",
  },
  {
    key: "supplierName",
    headers: ["商社", "仕入先", "Supplier", "SUPPLIER"],
    label: "商社名",
    required: false,
    description: "商社マスタとの照合に使う。未登録の場合は手動選択。",
  },
  {
    key: "assemblyLevel",
    headers: ["レベル", "Level", "LEVEL", "BOM Level"],
    label: "BOM レベル",
    required: false,
    description: "ルートからの深さ（0=ルート直下）。未指定なら 0。",
  },
  {
    key: "parentAssemblyPartNumber",
    headers: ["親品番", "Parent", "PARENT", "Parent Part Number"],
    label: "直上サブ組立品番",
    required: false,
    description: "直上のサブ組立品番（未指定なら NULL）。",
  },
  {
    key: "note",
    headers: ["備考", "Note", "NOTE", "Memo"],
    label: "備考",
    required: false,
    description: "行の補足情報。",
  },
];

export interface BomCsvPreviewIssue {
  rowIndex: number;
  level: "error" | "warning";
  message: string;
}

export interface BomCsvPreviewRow {
  rowIndex: number;
  partNumber: string;
  partName: string;
  quantity: number;
  revision: string | null;
  sourceType: PartSourceType;
  supplierName: string | null;
  matchedSupplierId: number | null;
  assemblyLevel: number;
  parentAssemblyPartNumber: string | null;
  note: string | null;
  issues: BomCsvPreviewIssue[];
}

export interface BomCsvPreviewResult {
  rows: BomCsvPreviewRow[];
  totalRows: number;
  errorCount: number;
  warningCount: number;
  detectedColumns: Partial<Record<BomCsvFieldKey, string>>;
  unmatchedSupplierNames: string[];
}

export type ImportDuplicatePolicy = "appendOnly" | "updateOnRevision" | "replaceAll";

export interface BomCsvImportCommitInput {
  seisanProjectId: string;
  fileName: string;
  duplicatePolicy?: ImportDuplicatePolicy;
  requiredDate?: string | null;
  rows: Array<{
    partNumber: string;
    partName: string;
    quantity?: number;
    revision?: string | null;
    sourceType?: PartSourceType;
    supplierId?: number | null;
    assemblyLevel?: number;
    parentAssemblyPartNumber?: string | null;
    note?: string | null;
  }>;
}

export interface BomCsvImportBatchRow {
  id: number;
  seisanProjectId: string;
  source: string;
  fileName: string | null;
  rowCount: number;
  importedByUsername: string | null;
  createdAt: string;
}

export interface BomCsvImportCommitResult {
  batch: BomCsvImportBatchRow;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  removedCount: number;
}

export function buildBomCsvTemplate(): string {
  // UTF-8 BOM + ヘッダ + サンプル 1 行
  const bom = "\uFEFF";
  const headers = BOM_CSV_COLUMNS.map((c) => c.headers[0]).join(",");
  const sample = [
    "EX-001",
    "ブラケット",
    "1",
    "A",
    "purchase",
    "サンプル商社",
    "0",
    "",
    "サンプル",
  ].join(",");
  return `${bom}${headers}\n${sample}\n`;
}

function normalizeSourceLabel(raw: string): PartSourceType | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "inhouse" || trimmed === "社内" || trimmed === "社内製作") return "inhouse";
  if (trimmed === "purchase" || trimmed === "購入" || trimmed === "外注") return "purchase";
  if (trimmed === "supplied" || trimmed === "支給" || trimmed === "支給品") return "supplied";
  return null;
}

export function parseBomCsvText(text: string): { headers: string[]; rows: string[][] } {
  const stripped = text.replace(/^\uFEFF/, "");
  const lines = stripped.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let buf = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          buf += '"';
          i += 1;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          buf += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(buf);
        buf = "";
      } else {
        buf += ch;
      }
    }
    out.push(buf);
    return out.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export function mapCsvHeadersToFields(headers: string[]): Partial<Record<BomCsvFieldKey, number>> {
  const map: Partial<Record<BomCsvFieldKey, number>> = {};
  headers.forEach((header, idx) => {
    const h = header.trim().toLowerCase();
    for (const col of BOM_CSV_COLUMNS) {
      if (col.headers.some((cand) => cand.toLowerCase() === h)) {
        if (map[col.key] == null) map[col.key] = idx;
      }
    }
  });
  return map;
}

export interface PreviewBomCsvInput {
  text: string;
  knownSuppliers: Array<{ id: number; name: string }>;
}

export function previewBomCsv(input: PreviewBomCsvInput): BomCsvPreviewResult {
  const { headers, rows } = parseBomCsvText(input.text);
  const fieldIdx = mapCsvHeadersToFields(headers);
  const detected: Partial<Record<BomCsvFieldKey, string>> = {};
  for (const [k, idx] of Object.entries(fieldIdx)) {
    if (idx != null) detected[k as BomCsvFieldKey] = headers[idx];
  }

  const supplierMap = new Map<string, number>();
  for (const s of input.knownSuppliers) {
    supplierMap.set(s.name.trim().toLowerCase(), s.id);
  }

  const unmatched = new Set<string>();
  const previewRows: BomCsvPreviewRow[] = [];

  rows.forEach((cols, idx) => {
    const issues: BomCsvPreviewIssue[] = [];
    const get = (key: BomCsvFieldKey): string => {
      const i = fieldIdx[key];
      if (i == null) return "";
      return (cols[i] ?? "").trim();
    };

    const partNumber = get("partNumber");
    const partNameRaw = get("partName");
    const partName = partNameRaw || partNumber;
    const qtyRaw = get("quantity");
    const quantity = qtyRaw ? Number(qtyRaw) : 1;
    const revision = get("revision") || null;
    const supplierName = get("supplierName") || null;
    const noteRaw = get("note");
    const note = noteRaw ? noteRaw : null;

    if (!partNumber) {
      issues.push({ rowIndex: idx + 2, level: "error", message: "品番が空です。" });
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      issues.push({ rowIndex: idx + 2, level: "error", message: "数量が不正です。" });
    }

    const sourceLabel = get("sourceType");
    const sourceType = sourceLabel ? normalizeSourceLabel(sourceLabel) : "purchase";
    if (sourceLabel && sourceType == null) {
      issues.push({
        rowIndex: idx + 2,
        level: "warning",
        message: `調達区分「${sourceLabel}」を解釈できません。購入として扱います。`,
      });
    }
    const finalSourceType: PartSourceType = sourceType ?? "purchase";

    let matchedSupplierId: number | null = null;
    if (supplierName) {
      const hit = supplierMap.get(supplierName.toLowerCase());
      if (hit != null) {
        matchedSupplierId = hit;
      } else {
        unmatched.add(supplierName);
        issues.push({
          rowIndex: idx + 2,
          level: "warning",
          message: `商社「${supplierName}」がマスタに見つかりません。`,
        });
      }
    }

    const levelRaw = get("assemblyLevel");
    const assemblyLevel = levelRaw ? Number(levelRaw) : 0;

    const parent = get("parentAssemblyPartNumber") || null;

    previewRows.push({
      rowIndex: idx + 2,
      partNumber,
      partName,
      quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 0,
      revision,
      sourceType: finalSourceType,
      supplierName,
      matchedSupplierId,
      assemblyLevel: Number.isFinite(assemblyLevel) ? Math.max(0, Math.floor(assemblyLevel)) : 0,
      parentAssemblyPartNumber: parent,
      note,
      issues,
    });
  });

  const errorCount = previewRows.reduce(
    (sum, r) => sum + r.issues.filter((i) => i.level === "error").length,
    0
  );
  const warningCount = previewRows.reduce(
    (sum, r) => sum + r.issues.filter((i) => i.level === "warning").length,
    0
  );

  return {
    rows: previewRows,
    totalRows: previewRows.length,
    errorCount,
    warningCount,
    detectedColumns: detected,
    unmatchedSupplierNames: [...unmatched],
  };
}

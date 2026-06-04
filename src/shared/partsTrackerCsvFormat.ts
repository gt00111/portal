/** 部材管理 BOM CSV 取込（標準8列）の列定義・テンプレ生成 */

import type { PartSourceType } from "./partsTracker.js";

export const BOM_CSV_DASH = "-";

export interface BomCsvColumnDef {
  key: BomCsvFieldKey;
  headers: string[];
  label: string;
  required: boolean;
  description: string;
}

export type BomCsvFieldKey =
  | "symbolRef"
  | "partNumber"
  | "partName"
  | "revision"
  | "quantity"
  | "material"
  | "parentAssemblyPartNumber"
  | "assemblyLevel"
  | "sourceType"
  | "supplierName"
  | "note";

export const BOM_CSV_COLUMNS: BomCsvColumnDef[] = [
  {
    key: "symbolRef",
    headers: ["符号"],
    label: "符号",
    required: false,
    description: "ルート行の並び。子行は空欄可（取込後は -）。",
  },
  {
    key: "partNumber",
    headers: ["品番", "品　　番", "Part Number", "PartNumber", "PART NUMBER"],
    label: "品番",
    required: true,
    description: "部品の図面番号。必須。",
  },
  {
    key: "partName",
    headers: ["名称", "名　称", "Description", "NAME", "部品名称"],
    label: "名称",
    required: true,
    description: "部品名称。空なら品番または -。",
  },
  {
    key: "revision",
    headers: ["Rev", "リビジョン", "Revision", "REVISION"],
    label: "Rev",
    required: false,
    description: "部品 Rev。空は -。未検出はそのまま。",
  },
  {
    key: "quantity",
    headers: ["個数", "数量", "QTY", "Quantity"],
    label: "個数",
    required: true,
    description: "1 台分の員数。",
  },
  {
    key: "material",
    headers: ["材質", "材料"],
    label: "材質",
    required: false,
    description: "材質。空は -。",
  },
  {
    key: "parentAssemblyPartNumber",
    headers: ["親品番", "Parent", "Parent Part Number"],
    label: "親品番",
    required: false,
    description: "直上サブ組立品番。レベル 0 は空。",
  },
  {
    key: "assemblyLevel",
    headers: ["レベル", "Level", "LEVEL", "BOM Level"],
    label: "レベル",
    required: false,
    description: "ルートからの深さ（0 始まり）。",
  },
  {
    key: "sourceType",
    headers: ["調達区分", "区分", "Source"],
    label: "調達区分",
    required: false,
    description: "CSV に無い場合は未設定。",
  },
  {
    key: "supplierName",
    headers: ["商社", "商社コード", "Supplier"],
    label: "商社",
    required: false,
    description: "マスタ照合（任意）。",
  },
  {
    key: "note",
    headers: ["備考", "Note"],
    label: "備考",
    required: false,
    description: "自由記述。",
  },
];

export interface BomCsvPreviewIssue {
  rowIndex: number;
  level: "error" | "warning";
  message: string;
}

export interface BomCsvPreviewRow {
  rowIndex: number;
  csvSortOrder: number;
  symbolRef: string;
  partNumber: string;
  partName: string;
  quantity: number;
  revision: string;
  material: string;
  sourceType: PartSourceType;
  supplierName: string | null;
  matchedSupplierId: number | null;
  assemblyLevel: number;
  parentAssemblyPartNumber: string | null;
  assemblyPath: string;
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
    assemblyPath?: string | null;
    note?: string | null;
    csvSortOrder?: number;
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
  const bom = "\uFEFF";
  const headers = "符号,品番,名称,Rev,個数,材質,親品番,レベル";
  const sample = "1,EX-001,ブラケット,A,1,SS400,,0";
  return `${bom}${headers}\n${sample}\n`;
}

function normalizeHeaderKey(header: string): string {
  return header.replace(/\s+/g, "").toLowerCase();
}

function normalizeSourceLabel(raw: string): PartSourceType | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "inhouse" || trimmed === "社内" || trimmed === "社内製作") return "inhouse";
  if (trimmed === "purchase" || trimmed === "購入" || trimmed === "外注") return "purchase";
  if (trimmed === "supplied" || trimmed === "支給" || trimmed === "支給品") return "supplied";
  if (trimmed === "unset" || trimmed === "未設定") return "unset";
  return null;
}

/** RFC4180 風: 改行を含む quoted フィールドに対応 */
export function parseBomCsvText(text: string): { headers: string[]; rows: string[][] } {
  const stripped = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = (): void => {
    row.push(field);
    field = "";
  };

  const pushRow = (): void => {
    if (row.length > 0 || field.length > 0) {
      pushField();
      records.push(row);
      row = [];
    }
  };

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inQuotes) {
      if (ch === '"') {
        if (stripped[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\r") {
      if (stripped[i + 1] === "\n") i += 1;
      pushRow();
    } else if (ch === "\n") {
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).filter((r) => r.some((c) => c.trim().length > 0));
  return { headers, rows };
}

export function mapCsvHeadersToFields(headers: string[]): Partial<Record<BomCsvFieldKey, number>> {
  const map: Partial<Record<BomCsvFieldKey, number>> = {};
  headers.forEach((header, idx) => {
    const h = normalizeHeaderKey(header);
    for (const col of BOM_CSV_COLUMNS) {
      if (col.headers.some((cand) => normalizeHeaderKey(cand) === h)) {
        if (map[col.key] == null) map[col.key] = idx;
      }
    }
  });
  return map;
}

function blankToDash(raw: string): string {
  const t = raw.trim();
  return t.length > 0 ? t : BOM_CSV_DASH;
}

function normalizeRevision(raw: string): string {
  const t = raw.trim();
  if (!t) return BOM_CSV_DASH;
  return t;
}

function formatNote(material: string, extraNote: string | null): string | null {
  const parts: string[] = [];
  if (material && material !== BOM_CSV_DASH) {
    parts.push(`材質: ${material}`);
  }
  if (extraNote?.trim()) parts.push(extraNote.trim());
  return parts.length > 0 ? parts.join(" / ") : null;
}

interface ParsedRowCore {
  partNumber: string;
  partName: string;
  quantity: number;
  revision: string;
  material: string;
  symbolRef: string;
  assemblyLevel: number;
  parentAssemblyPartNumber: string | null;
  sourceType: PartSourceType;
  supplierName: string | null;
  matchedSupplierId: number | null;
  extraNote: string | null;
}

function buildAssemblyPaths(cores: ParsedRowCore[]): string[] {
  const paths: string[] = [];
  const stack: Array<{ level: number; partNumber: string; path: string }> = [];

  for (const row of cores) {
    while (stack.length > 0 && stack[stack.length - 1].level >= row.assemblyLevel) {
      stack.pop();
    }

    let path: string;
    if (row.assemblyLevel <= 0 || !row.parentAssemblyPartNumber) {
      path = row.partNumber;
    } else {
      const parentPn = row.parentAssemblyPartNumber;
      const fromStack = [...stack].reverse().find((s) => s.partNumber === parentPn);
      path = fromStack
        ? `${fromStack.path}/${row.partNumber}`
        : `${parentPn}/${row.partNumber}`;
    }

    paths.push(path);
    stack.push({ level: row.assemblyLevel, partNumber: row.partNumber, path });
  }
  return paths;
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

  if (fieldIdx.partNumber == null) {
    return {
      rows: [],
      totalRows: 0,
      errorCount: 1,
      warningCount: 0,
      detectedColumns: detected,
      unmatchedSupplierNames: [],
    };
  }

  const supplierMap = new Map<string, number>();
  for (const s of input.knownSuppliers) {
    supplierMap.set(s.name.trim().toLowerCase(), s.id);
  }

  const unmatched = new Set<string>();
  const cores: ParsedRowCore[] = [];
  const issuesPerRow: BomCsvPreviewIssue[][] = [];

  rows.forEach((cols, idx) => {
    const issues: BomCsvPreviewIssue[] = [];
    const get = (key: BomCsvFieldKey): string => {
      const i = fieldIdx[key];
      if (i == null) return "";
      return (cols[i] ?? "").trim();
    };

    const partNumber = get("partNumber").trim();
    const partNameRaw = get("partName");
    const partName = partNameRaw ? blankToDash(partNameRaw) : partNumber || BOM_CSV_DASH;
    const qtyRaw = get("quantity");
    const quantity = qtyRaw ? Number(qtyRaw) : NaN;
    const revision = normalizeRevision(get("revision"));
    const material = blankToDash(get("material"));
    const symbolRef = blankToDash(get("symbolRef"));

    const levelRaw = get("assemblyLevel");
    const hasLevel = levelRaw.length > 0;
    const assemblyLevel = hasLevel ? Number(levelRaw) : 0;

    const parentRaw = get("parentAssemblyPartNumber");
    const parentAssemblyPartNumber =
      assemblyLevel <= 0 ? null : parentRaw ? parentRaw.trim() : null;

    if (!partNumber) {
      issues.push({ rowIndex: idx + 2, level: "error", message: "品番が空です。" });
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      issues.push({ rowIndex: idx + 2, level: "error", message: "個数が不正です。" });
    }
    if (hasLevel && (!Number.isFinite(assemblyLevel) || assemblyLevel < 0)) {
      issues.push({ rowIndex: idx + 2, level: "error", message: "レベルが不正です。" });
    }
    if (assemblyLevel > 0 && !parentAssemblyPartNumber) {
      issues.push({
        rowIndex: idx + 2,
        level: "warning",
        message: "レベル > 0 ですが親品番が空です。",
      });
    }

    const sourceLabel = get("sourceType");
    let sourceType: PartSourceType = "unset";
    if (sourceLabel) {
      const parsed = normalizeSourceLabel(sourceLabel);
      if (parsed) sourceType = parsed;
      else {
        issues.push({
          rowIndex: idx + 2,
          level: "warning",
          message: `調達区分「${sourceLabel}」を解釈できません。未設定として扱います。`,
        });
      }
    }

    const supplierName = get("supplierName") || null;
    let matchedSupplierId: number | null = null;
    if (supplierName) {
      const hit = supplierMap.get(supplierName.toLowerCase());
      if (hit != null) matchedSupplierId = hit;
      else {
        unmatched.add(supplierName);
        issues.push({
          rowIndex: idx + 2,
          level: "warning",
          message: `商社「${supplierName}」がマスタに見つかりません。`,
        });
      }
    }

    const extraNote = get("note") || null;

    cores.push({
      partNumber,
      partName,
      quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 0,
      revision,
      material,
      symbolRef,
      assemblyLevel: Number.isFinite(assemblyLevel)
        ? Math.max(0, Math.floor(assemblyLevel))
        : 0,
      parentAssemblyPartNumber,
      sourceType,
      supplierName,
      matchedSupplierId,
      extraNote,
    });
    issuesPerRow.push(issues);
  });

  const assemblyPaths = buildAssemblyPaths(cores);
  const previewRows: BomCsvPreviewRow[] = cores.map((c, i) => ({
    rowIndex: i + 2,
    csvSortOrder: i,
    symbolRef: c.symbolRef,
    partNumber: c.partNumber,
    partName: c.partName,
    quantity: c.quantity,
    revision: c.revision,
    material: c.material,
    sourceType: c.sourceType,
    supplierName: c.supplierName,
    matchedSupplierId: c.matchedSupplierId,
    assemblyLevel: c.assemblyLevel,
    parentAssemblyPartNumber: c.parentAssemblyPartNumber,
    assemblyPath: assemblyPaths[i] ?? c.partNumber,
    note: formatNote(c.material, c.extraNote),
    issues: issuesPerRow[i],
  }));

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
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildCurrentDrawingIdMap,
  isCurrentDrawing,
  type RevGroupRow,
} from "@shared/drawingRevisionSort.js";

import {
  getDrawingLibraryDb,
  getDrawingLibraryDataDir,
} from "@main/db/drawingLibraryConnection.js";

/**
 * 図面ライブラリ（drawing-library.db）への読み取り専用参照（REQ-DL-002）。
 * 図面ライブラリ「モジュール」は import せず、共有 DB 接続レイヤと @shared のみを利用する。
 * 対象は自社発行（work）図面。書き込みは一切行わない。
 */

const SQL_WORK_DRAWING = "(drawing_type = 'work' OR file_path LIKE 'drawings/mycompany/%')";
const MAX_READ = 80 * 1024 * 1024;

export interface WorkDrawingRefRow {
  id: number;
  title: string | null;
  file_path: string | null;
  customer_name: string | null;
  model: string | null;
  product_name: string | null;
  assembly_number: string | null;
  drawing_number: string | null;
  revision: string | null;
  is_obsolete: number;
  updated_at: string | null;
}

function distinctColumn(sql: string, params: string[] = []): string[] {
  const db = getDrawingLibraryDb();
  const rows = db.prepare(sql).all(...params) as { v: string }[];
  return rows.map((r) => r.v);
}

export function listWorkCustomers(): string[] {
  return distinctColumn(
    `SELECT DISTINCT customer_name AS v FROM drawings
     WHERE ${SQL_WORK_DRAWING}
       AND customer_name IS NOT NULL AND TRIM(customer_name) != ''
     ORDER BY customer_name COLLATE NOCASE ASC`
  );
}

export function listWorkModels(customerName: string): string[] {
  return distinctColumn(
    `SELECT DISTINCT model AS v FROM drawings
     WHERE ${SQL_WORK_DRAWING}
       AND customer_name = ?
       AND model IS NOT NULL AND TRIM(model) != ''
     ORDER BY model COLLATE NOCASE ASC`,
    [customerName]
  );
}

export function listWorkProductNames(customerName: string, model: string): string[] {
  return distinctColumn(
    `SELECT DISTINCT product_name AS v FROM drawings
     WHERE ${SQL_WORK_DRAWING}
       AND customer_name = ?
       AND model = ?
       AND product_name IS NOT NULL AND TRIM(product_name) != ''
     ORDER BY product_name COLLATE NOCASE ASC`,
    [customerName, model]
  );
}

/** 現行版判定用の Rev グループ行（全 work 行） */
function listRevGroupRows(): RevGroupRow[] {
  const db = getDrawingLibraryDb();
  return db
    .prepare(
      `SELECT id, customer_name, model, product_name, assembly_number, revision, is_obsolete
       FROM drawings WHERE ${SQL_WORK_DRAWING}`
    )
    .all() as RevGroupRow[];
}

export interface WorkDrawingFilter {
  keyword?: string | null;
  customerName?: string | null;
  model?: string | null;
  productName?: string | null;
}

/** フィルタに一致する work 図面のうち、各 Rev グループの現行版のみを返す（更新日降順） */
export function listCurrentWorkDrawings(filter: WorkDrawingFilter): WorkDrawingRefRow[] {
  const db = getDrawingLibraryDb();
  const conditions: string[] = [SQL_WORK_DRAWING];
  const params: string[] = [];

  if (filter.keyword?.trim()) {
    const term = `%${filter.keyword.trim()}%`;
    conditions.push(
      "(title LIKE ? OR customer_name LIKE ? OR model LIKE ? OR product_name LIKE ? OR drawing_number LIKE ? OR revision LIKE ?)"
    );
    for (let i = 0; i < 6; i++) params.push(term);
  }
  if (filter.customerName?.trim()) {
    conditions.push("customer_name = ?");
    params.push(filter.customerName.trim());
  }
  if (filter.model?.trim()) {
    conditions.push("model = ?");
    params.push(filter.model.trim());
  }
  if (filter.productName?.trim()) {
    conditions.push("product_name = ?");
    params.push(filter.productName.trim());
  }

  const rows = db
    .prepare(
      `SELECT id, title, file_path, customer_name, model, product_name, assembly_number,
              drawing_number, revision, is_obsolete, updated_at
       FROM drawings
       WHERE ${conditions.join(" AND ")}
       ORDER BY updated_at DESC`
    )
    .all(...params) as WorkDrawingRefRow[];

  const currentIdMap = buildCurrentDrawingIdMap(listRevGroupRows());
  return rows.filter((row) =>
    isCurrentDrawing(
      {
        id: row.id,
        customer_name: row.customer_name,
        model: row.model,
        product_name: row.product_name,
        assembly_number: row.assembly_number,
        revision: row.revision,
        is_obsolete: row.is_obsolete,
      },
      currentIdMap
    )
  );
}

/** 品番（product_name）の現行版図面を取得。複数グループ該当時は更新日最新を返す。 */
export function getCurrentWorkDrawingByPartNumber(partNumber: string): WorkDrawingRefRow | null {
  const rows = listCurrentWorkDrawings({ productName: partNumber });
  return rows[0] ?? null;
}

export function getWorkDrawingById(id: number): WorkDrawingRefRow | null {
  const db = getDrawingLibraryDb();
  const row = db
    .prepare(
      `SELECT id, title, file_path, customer_name, model, product_name, assembly_number,
              drawing_number, revision, is_obsolete, updated_at
       FROM drawings WHERE id = ? AND ${SQL_WORK_DRAWING}`
    )
    .get(id) as WorkDrawingRefRow | undefined;
  return row ?? null;
}

/** 図面ライブラリのデータルート配下に相対パスを解決（パストラバーサル防止） */
function resolveUnderDrawingLibraryDataDir(relativePath: string): string {
  const root = path.resolve(getDrawingLibraryDataDir());
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = path.resolve(root, normalized);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error("ファイルパスが許可範囲外です。");
  }
  return abs;
}

/** 図面 PDF を base64 で取得（read-only） */
export async function readWorkDrawingFile(
  id: number
): Promise<{ fileName: string; base64: string; mime: string }> {
  const row = getWorkDrawingById(id);
  if (!row) {
    throw new Error("図面が見つかりません。");
  }
  if (!row.file_path) {
    throw new Error("図面ファイルが登録されていません。");
  }
  const abs = resolveUnderDrawingLibraryDataDir(row.file_path);
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === ".pdf" ? "application/pdf" : "application/octet-stream";
  const buf = await readFile(abs);
  if (buf.length > MAX_READ) {
    throw new Error("ファイルが大きすぎます。外部アプリで開いてください。");
  }
  return { fileName: path.basename(abs), base64: buf.toString("base64"), mime };
}

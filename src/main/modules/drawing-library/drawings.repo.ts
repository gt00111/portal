import type {
  DrawingListParams,
  DrawingListResult,
  DrawingUpsertInput,
  LibDrawingRow,
} from "@shared/drawingLibrary.js";

import { getDrawingLibraryDb } from "@main/db/drawingLibraryConnection.js";

import { resolveUnderDataDir, unlinkIfExists } from "./drawingStorage.js";

/** 自社発行（work）行の共通 WHERE 断片用 */
const SQL_WORK_DRAWING = "(drawing_type = 'work' OR file_path LIKE 'drawings/mycompany/%')";

export function listWorkDistinctCustomers(): string[] {
  const db = getDrawingLibraryDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT customer_name AS v FROM drawings
       WHERE ${SQL_WORK_DRAWING}
         AND customer_name IS NOT NULL AND TRIM(customer_name) != ''
       ORDER BY customer_name COLLATE NOCASE ASC`
    )
    .all() as { v: string }[];
  return rows.map((r) => r.v);
}

export function listWorkDistinctModels(customerName: string): string[] {
  const db = getDrawingLibraryDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT model AS v FROM drawings
       WHERE ${SQL_WORK_DRAWING}
         AND customer_name = ?
         AND model IS NOT NULL AND TRIM(model) != ''
       ORDER BY model COLLATE NOCASE ASC`
    )
    .all(customerName) as { v: string }[];
  return rows.map((r) => r.v);
}

export function listWorkDistinctProductNames(customerName: string, model: string): string[] {
  const db = getDrawingLibraryDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT product_name AS v FROM drawings
       WHERE ${SQL_WORK_DRAWING}
         AND customer_name = ?
         AND model = ?
         AND product_name IS NOT NULL AND TRIM(product_name) != ''
       ORDER BY product_name COLLATE NOCASE ASC`
    )
    .all(customerName, model) as { v: string }[];
  return rows.map((r) => r.v);
}

export function getWorkCascadeOptions(
  customerName?: string | null,
  model?: string | null
): {
  customers: string[];
  models: string[];
  productNames: string[];
} {
  const customers = listWorkDistinctCustomers();
  const c = customerName?.trim() ?? "";
  const m = model?.trim() ?? "";
  const models = c ? listWorkDistinctModels(c) : [];
  const productNames = c && m ? listWorkDistinctProductNames(c, m) : [];
  return { customers, models, productNames };
}

function orderClauseForList(sortBy: string | undefined, sortOrder: string | undefined): string {
  const order = sortOrder === "asc" ? "ASC" : "DESC";
  const col =
    sortBy === "customer_name" ||
    sortBy === "model" ||
    sortBy === "product_name" ||
    sortBy === "revision" ||
    sortBy === "title"
      ? sortBy
      : "updated_at";
  if (col === "updated_at") {
    return `ORDER BY updated_at ${order}`;
  }
  return `ORDER BY COALESCE(${col}, '') COLLATE NOCASE ${order}`;
}

export function listDrawings(params: DrawingListParams): DrawingListResult {
  const db = getDrawingLibraryDb();
  const limitNum = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offsetNum = Math.max(params.offset ?? 0, 0);
  const drawingType = params.drawingType ?? "customer";

  let query = "SELECT * FROM drawings";
  let countQuery = "SELECT COUNT(*) as total FROM drawings";
  const qparams: (string | number)[] = [];
  const conditions: string[] = [];

  if (drawingType === "work") {
    conditions.push("(drawing_type = 'work' OR file_path LIKE 'drawings/mycompany/%')");
  } else {
    conditions.push(
      "((drawing_type IS NULL OR drawing_type = 'customer' OR drawing_type = '') AND (file_path IS NULL OR file_path NOT LIKE 'drawings/mycompany/%'))"
    );
  }

  if (params.search?.trim()) {
    const searchTerm = `%${params.search.trim()}%`;
    conditions.push(
      "(title LIKE ? OR description LIKE ? OR tags LIKE ? OR customer_name LIKE ? OR model LIKE ? OR product_name LIKE ? OR drawing_number LIKE ? OR revision LIKE ?)"
    );
    for (let i = 0; i < 8; i++) qparams.push(searchTerm);
  }
  if (params.category?.trim()) {
    conditions.push("category = ?");
    qparams.push(params.category.trim());
  }
  if (params.customerName?.trim()) {
    conditions.push("customer_name = ?");
    qparams.push(params.customerName.trim());
  }
  if (params.model?.trim()) {
    conditions.push("model = ?");
    qparams.push(params.model.trim());
  }
  if (params.productName?.trim()) {
    conditions.push("product_name = ?");
    qparams.push(params.productName.trim());
  }

  if (conditions.length > 0) {
    const whereClause = " WHERE " + conditions.join(" AND ");
    query += whereClause;
    countQuery += whereClause;
  }

  query += ` ${orderClauseForList(params.sortBy, params.sortOrder)} LIMIT ? OFFSET ?`;
  const listParams = [...qparams, limitNum, offsetNum];
  const drawings = db.prepare(query).all(...listParams) as LibDrawingRow[];
  const countParams = qparams.slice();
  const totalRow = db.prepare(countQuery).get(...countParams) as { total: number } | undefined;
  const total = totalRow?.total ?? 0;

  return {
    drawings,
    total,
    limit: limitNum,
    offset: offsetNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

export function getDrawing(id: number): LibDrawingRow | null {
  const db = getDrawingLibraryDb();
  const row = db.prepare("SELECT * FROM drawings WHERE id = ?").get(id) as LibDrawingRow | undefined;
  return row ?? null;
}

export function checkDuplicate(
  productName: string,
  revision: string,
  drawingType: string,
  excludeId?: number
): LibDrawingRow | null {
  const db = getDrawingLibraryDb();
  let sql = `
    SELECT * FROM drawings
    WHERE LOWER(product_name) = LOWER(?)
      AND LOWER(revision) = LOWER(?)
      AND drawing_type = ?
  `;
  const q: (string | number)[] = [productName, revision, drawingType];
  if (excludeId != null) {
    sql += " AND id != ?";
    q.push(excludeId);
  }
  sql += " LIMIT 1";
  const row = db.prepare(sql).get(...q) as LibDrawingRow | undefined;
  return row ?? null;
}

export function insertDrawing(input: DrawingUpsertInput): LibDrawingRow {
  const db = getDrawingLibraryDb();
  const dt = input.drawingType ?? "customer";
  if (input.product_name?.trim() && input.revision?.trim()) {
    const dup = checkDuplicate(input.product_name, input.revision, dt);
    if (dup) {
      throw new Error(
        `同じ品番（${input.product_name}）とリビジョン（${input.revision}）の組み合わせが既に登録されています。`
      );
    }
  }
  if (input.file_path && !input.file_path.toLowerCase().endsWith(".pdf")) {
    throw new Error("図面ファイルは PDF 形式のみ対応しています。");
  }

  const result = db
    .prepare(
      `INSERT INTO drawings (
        title, description, file_path, category, tags,
        customer_name, model, product_name, drawing_number, revision, drawing_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.title,
      input.description ?? null,
      input.file_path ?? null,
      input.category ?? null,
      input.tags ?? null,
      input.customer_name ?? null,
      input.model ?? null,
      input.product_name ?? null,
      input.drawing_number ?? null,
      input.revision ?? null,
      dt
    );

  const id = Number(result.lastInsertRowid);
  return getDrawing(id)!;
}

export function updateDrawing(id: number, patch: Partial<DrawingUpsertInput>): LibDrawingRow {
  const db = getDrawingLibraryDb();
  const existing = getDrawing(id);
  if (!existing) {
    throw new Error("図面が見つかりません。");
  }

  const title = patch.title ?? existing.title;
  const description = patch.description !== undefined ? patch.description : existing.description;
  const file_path = patch.file_path !== undefined ? patch.file_path : existing.file_path;
  const category = patch.category !== undefined ? patch.category : existing.category;
  const tags = patch.tags !== undefined ? patch.tags : existing.tags;
  const customer_name = patch.customer_name !== undefined ? patch.customer_name : existing.customer_name;
  const model = patch.model !== undefined ? patch.model : existing.model;
  const product_name = patch.product_name !== undefined ? patch.product_name : existing.product_name;
  const drawing_number = patch.drawing_number !== undefined ? patch.drawing_number : existing.drawing_number;
  const revision = patch.revision !== undefined ? patch.revision : existing.revision;

  const checkPn = product_name ?? "";
  const checkRev = revision ?? "";
  const checkDt = existing.drawing_type || "customer";
  if (checkPn.trim() && checkRev.trim()) {
    const dup = checkDuplicate(checkPn, checkRev, checkDt, id);
    if (dup) {
      throw new Error(
        `同じ品番（${checkPn}）とリビジョン（${checkRev}）の組み合わせが既に登録されています。`
      );
    }
  }

  if (file_path && !file_path.toLowerCase().endsWith(".pdf")) {
    throw new Error("図面ファイルは PDF 形式のみ対応しています。");
  }

  let drawingType = existing.drawing_type || "customer";
  if (file_path) {
    drawingType = file_path.startsWith("drawings/mycompany/") ? "work" : "customer";
  }

  db.prepare(
    `UPDATE drawings SET
      title = ?, description = ?, file_path = ?, category = ?, tags = ?,
      customer_name = ?, model = ?, product_name = ?, drawing_number = ?, revision = ?,
      drawing_type = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`
  ).run(
    title,
    description,
    file_path,
    category,
    tags,
    customer_name,
    model,
    product_name,
    drawing_number,
    revision,
    drawingType,
    id
  );

  return getDrawing(id)!;
}

export function setObsolete(id: number, isObsolete: boolean): LibDrawingRow {
  const db = getDrawingLibraryDb();
  if (!getDrawing(id)) {
    throw new Error("図面が見つかりません。");
  }
  db.prepare("UPDATE drawings SET is_obsolete = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    isObsolete ? 1 : 0,
    id
  );
  return getDrawing(id)!;
}

export async function deleteDrawing(id: number): Promise<void> {
  const db = getDrawingLibraryDb();
  const drawing = getDrawing(id);
  if (!drawing) {
    throw new Error("図面が見つかりません。");
  }
  if (drawing.file_path) {
    try {
      const abs = resolveUnderDataDir(drawing.file_path);
      await unlinkIfExists(abs);
    } catch {
      /* パス不正時は DB のみ削除 */
    }
  }
  db.prepare("DELETE FROM drawings WHERE id = ?").run(id);
}

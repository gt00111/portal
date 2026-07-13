import type {
  DrawingListParams,
  DrawingListResult,
  DrawingUpsertInput,
  LibDrawingListItem,
  LibDrawingRow,
  WorkAssemblyPart,
  WorkBatchCreateInput,
  WorkBatchCreateResult,
} from "@shared/drawingLibrary.js";
import {
  buildCurrentDrawingIdMap,
  isCurrentDrawing,
  sortByRevisionDesc,
  type RevGroupRow,
} from "@shared/drawingRevisionSort.js";

import { getDrawingLibraryDb } from "@main/db/drawingLibraryConnection.js";

import { ensureWorkPartPdf, resolveUnderDataDir, unlinkIfExists } from "./drawingStorage.js";

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
  assemblies: string[];
} {
  const customers = listWorkDistinctCustomers();
  const c = customerName?.trim() ?? "";
  const m = model?.trim() ?? "";
  const models = c ? listWorkDistinctModels(c) : [];
  const productNames = c && m ? listWorkDistinctProductNames(c, m) : [];
  const assemblies = c && m ? listWorkDistinctAssemblies(c, m) : [];
  return { customers, models, productNames, assemblies };
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

function listWorkRevGroupRows(db: ReturnType<typeof getDrawingLibraryDb>): RevGroupRow[] {
  return db
    .prepare(
      `SELECT id, customer_name, model, product_name, assembly_number, revision, is_obsolete
       FROM drawings WHERE ${SQL_WORK_DRAWING}`
    )
    .all() as RevGroupRow[];
}

/** 自社発行: 客先＋機種で絞ったトップアセンブリ品番の一覧（REQ-DL-004） */
export function listWorkDistinctAssemblies(customerName: string, model: string): string[] {
  const db = getDrawingLibraryDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT assembly_number AS v FROM drawings
       WHERE ${SQL_WORK_DRAWING}
         AND customer_name = ?
         AND model = ?
         AND assembly_number IS NOT NULL AND TRIM(assembly_number) != ''
       ORDER BY assembly_number COLLATE NOCASE ASC`
    )
    .all(customerName, model) as { v: string }[];
  return rows.map((r) => r.v);
}

function toListItems(rows: LibDrawingRow[], currentIdMap: Map<string, number>): LibDrawingListItem[] {
  return rows.map((row) => ({
    ...row,
    change_summary: row.change_summary ?? null,
    is_current: isCurrentDrawing(row, currentIdMap),
  }));
}

export function listRevHistory(
  customerName: string,
  model: string,
  productName: string,
  assemblyNumber?: string | null
): LibDrawingRow[] {
  const db = getDrawingLibraryDb();
  const conds = [SQL_WORK_DRAWING, "customer_name = ?", "model = ?", "product_name = ?"];
  const args: string[] = [customerName.trim(), model.trim(), productName.trim()];
  const asm = assemblyNumber?.trim();
  if (asm) {
    conds.push("IFNULL(assembly_number, '') = ?");
    args.push(asm);
  }
  const rows = db
    .prepare(`SELECT * FROM drawings WHERE ${conds.join(" AND ")}`)
    .all(...args) as LibDrawingRow[];
  return sortByRevisionDesc(rows.map((r) => ({ ...r, change_summary: r.change_summary ?? null })));
}

export function listDrawings(params: DrawingListParams): DrawingListResult {
  const db = getDrawingLibraryDb();
  const limitNum = Math.min(Math.max(params.limit ?? 50, 1), 5000);
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
  if (params.assemblyNumber?.trim()) {
    conditions.push("assembly_number = ?");
    qparams.push(params.assemblyNumber.trim());
  }

  const isWorkList = drawingType === "work";
  let currentIdMap = new Map<string, number>();
  if (isWorkList) {
    currentIdMap = buildCurrentDrawingIdMap(listWorkRevGroupRows(db));
    if (params.currentOnly) {
      const currentIds = [...currentIdMap.values()];
      if (currentIds.length === 0) {
        return {
          drawings: [],
          total: 0,
          limit: limitNum,
          offset: offsetNum,
          totalPages: 1,
        };
      }
      conditions.push(`id IN (${currentIds.map(() => "?").join(", ")})`);
      qparams.push(...currentIds);
    }
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

  const listItems: LibDrawingListItem[] = isWorkList
    ? toListItems(drawings, currentIdMap)
    : drawings.map((row) => ({
        ...row,
        change_summary: row.change_summary ?? null,
        is_current: false,
      }));

  return {
    drawings: listItems,
    total,
    limit: limitNum,
    offset: offsetNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

export function getDrawing(id: number): LibDrawingRow | null {
  const db = getDrawingLibraryDb();
  const row = db.prepare("SELECT * FROM drawings WHERE id = ?").get(id) as LibDrawingRow | undefined;
  if (!row) return null;
  return { ...row, change_summary: row.change_summary ?? null };
}

export function checkDuplicate(
  productName: string,
  revision: string,
  drawingType: string,
  excludeId?: number,
  assemblyNumber?: string | null
): LibDrawingRow | null {
  const db = getDrawingLibraryDb();
  let sql = `
    SELECT * FROM drawings
    WHERE LOWER(product_name) = LOWER(?)
      AND LOWER(revision) = LOWER(?)
      AND drawing_type = ?
  `;
  const q: (string | number)[] = [productName, revision, drawingType];
  // 自社発行の部品単位登録では、同一部品品番が別アセンブリに存在しうるため
  // 重複判定をアセンブリ単位にスコープする（REQ-DL-004）。
  if (drawingType === "work" && assemblyNumber?.trim()) {
    sql += " AND IFNULL(LOWER(assembly_number), '') = LOWER(?)";
    q.push(assemblyNumber.trim());
  }
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
    const dup = checkDuplicate(input.product_name, input.revision, dt, undefined, input.assembly_number);
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
        customer_name, model, product_name, assembly_number, drawing_number, revision, drawing_type, change_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      input.assembly_number ?? null,
      input.drawing_number ?? null,
      input.revision ?? null,
      dt,
      input.change_summary?.trim() || null
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
  const assembly_number =
    patch.assembly_number !== undefined ? patch.assembly_number : existing.assembly_number;
  const drawing_number = patch.drawing_number !== undefined ? patch.drawing_number : existing.drawing_number;
  const revision = patch.revision !== undefined ? patch.revision : existing.revision;
  const change_summary =
    patch.change_summary !== undefined ? patch.change_summary : existing.change_summary;

  const checkPn = product_name ?? "";
  const checkRev = revision ?? "";
  const checkDt = existing.drawing_type || "customer";
  if (checkPn.trim() && checkRev.trim()) {
    const dup = checkDuplicate(checkPn, checkRev, checkDt, id, assembly_number);
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
      customer_name = ?, model = ?, product_name = ?, assembly_number = ?, drawing_number = ?, revision = ?,
      drawing_type = ?, change_summary = ?, updated_at = CURRENT_TIMESTAMP
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
    assembly_number,
    drawing_number,
    revision,
    drawingType,
    change_summary?.trim() || null,
    id
  );

  return getDrawing(id)!;
}

/** 指定アセンブリの「引き継ぎ元」Rev を決定（登録先 Rev 以外の最新 Rev。再登録時はその1つ前） */
function resolveCarrySourceRevision(
  rows: LibDrawingRow[],
  targetRevision: string | null
): string {
  const revList: string[] = [];
  const seen = new Set<string>();
  for (const r of sortByRevisionDesc(rows)) {
    const rev = r.revision?.trim() || "";
    if (!seen.has(rev)) {
      seen.add(rev);
      revList.push(rev);
    }
  }
  const target = targetRevision?.trim() || "";
  if (target) {
    const other = revList.find((rev) => rev !== target);
    if (other !== undefined) return other;
  }
  return revList[0] ?? "";
}

/** 指定アセンブリの引き継ぎ元 Rev における部品スナップショット（完全な1 Rev分） */
function getLatestAssemblyRevSnapshot(
  customerName: string,
  model: string | null,
  assemblyNumber: string,
  targetRevision: string | null
): LibDrawingRow[] {
  const db = getDrawingLibraryDb();
  const rows = db
    .prepare(
      `SELECT * FROM drawings
       WHERE ${SQL_WORK_DRAWING}
         AND customer_name = ?
         AND IFNULL(model, '') = ?
         AND IFNULL(assembly_number, '') = ?
         AND is_obsolete != 1`
    )
    .all(customerName.trim(), (model ?? "").trim(), assemblyNumber.trim()) as LibDrawingRow[];
  const carryRev = resolveCarrySourceRevision(rows, targetRevision);
  if (!carryRev && rows.length === 0) return [];
  return rows
    .filter((r) => (r.revision?.trim() || "") === carryRev)
    .map((r) => ({ ...r, change_summary: r.change_summary ?? null }));
}

/** 指定アセンブリの特定 Rev の行/ファイルを削除（同一Rev再登録時の上書き用） */
async function deleteAssemblyRevRows(
  customerName: string,
  model: string | null,
  assemblyNumber: string,
  revision: string | null
): Promise<void> {
  const db = getDrawingLibraryDb();
  const rows = db
    .prepare(
      `SELECT id, file_path FROM drawings
       WHERE ${SQL_WORK_DRAWING}
         AND customer_name = ?
         AND IFNULL(model, '') = ?
         AND IFNULL(assembly_number, '') = ?
         AND IFNULL(revision, '') = ?`
    )
    .all(customerName.trim(), (model ?? "").trim(), assemblyNumber.trim(), (revision ?? "").trim()) as {
    id: number;
    file_path: string | null;
  }[];
  for (const r of rows) {
    if (r.file_path) {
      try {
        await unlinkIfExists(resolveUnderDataDir(r.file_path));
      } catch {
        /* パス不正時は DB のみ削除 */
      }
    }
  }
  db.prepare(
    `DELETE FROM drawings
     WHERE ${SQL_WORK_DRAWING}
       AND customer_name = ?
       AND IFNULL(model, '') = ?
       AND IFNULL(assembly_number, '') = ?
       AND IFNULL(revision, '') = ?`
  ).run(customerName.trim(), (model ?? "").trim(), assemblyNumber.trim(), (revision ?? "").trim());
}

/**
 * 自社発行: 複数部品PDFの一括登録（REQ-DL-004 / スナップショット方式）。
 * クライアントから渡された部品一覧が、そのまま新Revの完全なスナップショットになる。
 * 各部品は新規取込（sourcePath）または前Revからの継承（carryFromRelativePath）で、
 * いずれも `.../アセンブリ品番/Rev/部品品番.pdf` に**実ファイルをコピー**して保存する。
 * 前Revに存在したが今回の一覧に無い部品は、新Revには含まれない（＝削除）。
 */
export async function insertWorkBatch(input: WorkBatchCreateInput): Promise<WorkBatchCreateResult> {
  const customerName = input.customerName?.trim();
  const assemblyNumber = input.assemblyNumber?.trim();
  const revision = input.revision?.trim() || null;
  if (!customerName) throw new Error("客先を入力してください。");
  if (!assemblyNumber) throw new Error("トップアセンブリ品番を入力してください。");
  if (!input.parts?.length) throw new Error("登録する部品が1つもありません。");
  const model = input.model?.trim() || null;

  type Item = {
    partNumber: string;
    sourceAbs: string;
    title: string | null;
    category: string | null;
  };
  // 削除前に引き継ぎ元スナップショットを取得（実ファイルコピー用）
  const prevSnapshot = getLatestAssemblyRevSnapshot(
    customerName,
    model,
    assemblyNumber,
    revision
  );
  const prevByPn = new Map(
    prevSnapshot
      .filter((r) => r.product_name?.trim() && r.file_path)
      .map((r) => [r.product_name!.trim().toLowerCase(), r])
  );

  // 同一品番は後勝ち。一覧に無い部品は新Revに含めない（＝削除）
  const finalMap = new Map<string, Item>();
  for (const p of input.parts) {
    const pn = p.partNumber?.trim();
    if (!pn) throw new Error("部品品番が空の項目があります。");
    let sourceAbs: string | null = null;
    if (p.sourcePath?.trim()) {
      sourceAbs = p.sourcePath.trim();
    } else if (p.carryFromRelativePath?.trim()) {
      sourceAbs = resolveUnderDataDir(p.carryFromRelativePath.trim());
    } else {
      const prev = prevByPn.get(pn.toLowerCase());
      if (prev?.file_path) sourceAbs = resolveUnderDataDir(prev.file_path);
    }
    if (!sourceAbs) {
      throw new Error(`部品「${pn}」のPDFが見つかりません。`);
    }
    const prev = prevByPn.get(pn.toLowerCase());
    finalMap.set(pn.toLowerCase(), {
      partNumber: pn,
      sourceAbs,
      title: p.title?.trim() || prev?.title?.trim() || pn,
      category: prev?.category ?? input.category?.trim() ?? null,
    });
  }

  // 同一Rev再登録時は既存の同Rev行/ファイルを削除して作り直す（上書き）
  await deleteAssemblyRevRows(customerName, model, assemblyNumber, revision);

  const created: LibDrawingRow[] = [];
  for (const item of finalMap.values()) {
    const { relativePath } = await ensureWorkPartPdf(item.sourceAbs, {
      customerName,
      model,
      assemblyNumber,
      revision,
      partNumber: item.partNumber,
    });
    const row = insertDrawing({
      title: item.title || item.partNumber,
      customer_name: customerName,
      model,
      product_name: item.partNumber,
      assembly_number: assemblyNumber,
      revision,
      category: item.category ?? input.category?.trim() ?? null,
      change_summary: input.changeSummary?.trim() || null,
      file_path: relativePath,
      drawingType: "work",
    });
    created.push(row);
  }
  return { created: created.length, drawings: created };
}

/** 自社発行: 引き継ぎ元 Rev の部品スナップショット（登録フォームの「前Rev読込」用） */
export function listWorkAssemblyCarrySnapshot(
  customerName: string,
  model: string | null,
  assemblyNumber: string,
  targetRevision?: string | null
): LibDrawingRow[] {
  return getLatestAssemblyRevSnapshot(
    customerName,
    model,
    assemblyNumber,
    targetRevision?.trim() || null
  );
}

/**
 * 自社発行: 指定アセンブリの「現行版部品図面」一覧を返す（REQ-DL-004 の結合表示用）。
 * 部品ごとに最大 Rev の1件を採用する（未変更部品は前Revを継承）。
 */
export function getCurrentAssemblyParts(
  customerName: string,
  model: string,
  assemblyNumber: string
): WorkAssemblyPart[] {
  const db = getDrawingLibraryDb();
  const rows = db
    .prepare(
      `SELECT id, customer_name, model, product_name, assembly_number, revision, is_obsolete, file_path
       FROM drawings
       WHERE ${SQL_WORK_DRAWING}
         AND customer_name = ?
         AND IFNULL(model, '') = ?
         AND IFNULL(assembly_number, '') = ?`
    )
    .all(customerName.trim(), model.trim(), assemblyNumber.trim()) as (RevGroupRow & {
    file_path: string | null;
  })[];
  const currentIds = new Set(buildCurrentDrawingIdMap(rows).values());
  return rows
    .filter((r) => currentIds.has(r.id) && r.is_obsolete !== 1 && r.file_path)
    .sort((a, b) => (a.product_name ?? "").localeCompare(b.product_name ?? "", "ja"))
    .map((r) => ({
      id: r.id,
      product_name: r.product_name,
      revision: r.revision,
      file_path: r.file_path,
    }));
}

/** 指定アセンブリの特定 Rev の部品図面一覧（Rev切替の結合表示用） */
export function getAssemblyPartsByRevision(
  customerName: string,
  model: string,
  assemblyNumber: string,
  revision: string
): WorkAssemblyPart[] {
  const db = getDrawingLibraryDb();
  const rows = db
    .prepare(
      `SELECT id, product_name, revision, file_path
       FROM drawings
       WHERE ${SQL_WORK_DRAWING}
         AND customer_name = ?
         AND IFNULL(model, '') = ?
         AND IFNULL(assembly_number, '') = ?
         AND IFNULL(revision, '') = ?
         AND is_obsolete != 1
         AND file_path IS NOT NULL`
    )
    .all(customerName.trim(), model.trim(), assemblyNumber.trim(), revision.trim()) as {
    id: number;
    product_name: string | null;
    revision: string | null;
    file_path: string | null;
  }[];
  return rows
    .sort((a, b) => (a.product_name ?? "").localeCompare(b.product_name ?? "", "ja"))
    .map((r) => ({
      id: r.id,
      product_name: r.product_name,
      revision: r.revision,
      file_path: r.file_path,
    }));
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

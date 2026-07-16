import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  AssemblyDrawingLinkResolveResult,
  PartDrawingFilePayload,
  PartDrawingLinkInfo,
} from "@shared/partsTrackerDrawing.js";
import {
  buildCurrentDrawingIdMap,
  type RevGroupRow,
} from "@shared/drawingRevisionSort.js";
import type { WorkAssemblyPart } from "@shared/drawingLibrary.js";

import {
  getDrawingLibraryDb,
  getDrawingLibraryDataDir,
} from "@main/db/drawingLibraryConnection.js";

/**
 * 図面ライブラリ（drawing-library.db）への読み取り専用参照。
 * 図面ライブラリモジュールは import せず、共有 DB 接続レイヤと @shared のみを利用する。
 */

const SQL_WORK_DRAWING = "(drawing_type = 'work' OR file_path LIKE 'drawings/mycompany/%')";
const MAX_READ = 80 * 1024 * 1024;

function getCurrentAssemblyParts(
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

function resolveUnderDrawingLibraryDataDir(relativePath: string): string {
  const root = path.resolve(getDrawingLibraryDataDir());
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = path.resolve(root, normalized);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error("ファイルパスが許可範囲外です。");
  }
  return abs;
}

/**
 * 案件の親番（アセンブリ）に対応する現行版 Rev フォルダ内の部品図面と、
 * BOM 品番を突合してリンク情報を返す。
 */
export function resolveAssemblyPartLinks(
  customerName: string,
  model: string | null | undefined,
  assemblyNumber: string,
  partNumbers: string[]
): AssemblyDrawingLinkResolveResult {
  const customer = customerName.trim();
  const modelNorm = (model ?? "").trim();
  const assembly = assemblyNumber.trim();
  const base = {
    customerName: customer,
    model: modelNorm,
    assemblyNumber: assembly,
    assemblyPartCount: 0,
    links: {} as Record<string, PartDrawingLinkInfo>,
    linkedCount: 0,
  };

  if (!customer || !assembly) {
    return {
      ...base,
      found: false,
      message: "客先または親番（アセンブリ品番）が案件に未設定のため、図面リンクできません。",
    };
  }

  const assemblyParts = getCurrentAssemblyParts(customer, modelNorm, assembly);
  if (assemblyParts.length === 0) {
    return {
      ...base,
      found: false,
      message:
        "図面ライブラリに、この客先・機種・親番のアセンブリ登録（現行 Rev）がありません。",
    };
  }

  const byPartLower = new Map<string, WorkAssemblyPart>();
  for (const p of assemblyParts) {
    const pn = p.product_name?.trim();
    if (!pn) continue;
    byPartLower.set(pn.toLowerCase(), p);
  }

  const links: Record<string, PartDrawingLinkInfo> = {};
  const seen = new Set<string>();
  for (const raw of partNumbers) {
    const bomPn = raw.trim();
    if (!bomPn) continue;
    const dedupeKey = bomPn.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const hit = byPartLower.get(dedupeKey);
    if (!hit) continue;
    links[bomPn] = {
      drawingId: hit.id,
      revision: hit.revision,
      productName: hit.product_name ?? bomPn,
    };
  }

  return {
    ...base,
    found: true,
    assemblyPartCount: assemblyParts.length,
    links,
    linkedCount: Object.keys(links).length,
    message: null,
  };
}

export async function readWorkDrawingFile(drawingId: number): Promise<PartDrawingFilePayload> {
  const db = getDrawingLibraryDb();
  const row = db
    .prepare(
      `SELECT id, file_path FROM drawings WHERE id = ? AND ${SQL_WORK_DRAWING}`
    )
    .get(drawingId) as { id: number; file_path: string | null } | undefined;
  if (!row?.file_path) {
    throw new Error("図面が見つかりません。");
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

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { PDFDocument } from "pdf-lib";

import type { WorkAssemblyPart } from "@shared/drawingLibrary.js";

import { resolveUnderDataDir } from "./drawingStorage.js";

/**
 * 自社発行アセンブリの現行部品PDFを1つに結合し、base64 を返す（REQ-DL-004 の結合表示用）。
 * 保存はせず、表示のたびに都度生成する。読み込めない部品はスキップする。
 */
export async function mergeAssemblyParts(parts: WorkAssemblyPart[]): Promise<{
  base64: string;
  mime: string;
  mergedCount: number;
}> {
  const merged = await PDFDocument.create();
  let mergedCount = 0;

  for (const part of parts) {
    const rel = part.file_path?.trim();
    if (!rel || !rel.toLowerCase().endsWith(".pdf")) continue;
    try {
      const abs = resolveUnderDataDir(rel);
      if (!existsSync(abs)) continue;
      const bytes = await readFile(abs);
      const src = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      for (const page of pages) merged.addPage(page);
      mergedCount += 1;
    } catch {
      /* 破損PDF等はスキップして続行 */
    }
  }

  if (mergedCount === 0) {
    throw new Error("結合できる部品PDFがありませんでした。");
  }

  const out = await merged.save();
  const base64 = Buffer.from(out).toString("base64");
  return { base64, mime: "application/pdf", mergedCount };
}

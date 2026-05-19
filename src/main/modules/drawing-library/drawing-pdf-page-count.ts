import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import { PDFDocument } from "pdf-lib";

/** 比較用に選択したローカル PDF の総ページ数 */
export async function getPdfPageCountFromPath(filePath: string): Promise<number> {
  const path = filePath.trim();
  if (!path) {
    throw new Error("PDF パスが空です。");
  }
  if (!existsSync(path)) {
    throw new Error("PDF ファイルが見つかりません。");
  }
  const bytes = await readFile(path);
  const doc = await PDFDocument.load(bytes);
  const count = doc.getPageCount();
  if (count < 1) {
    throw new Error("PDF にページがありません。");
  }
  return count;
}

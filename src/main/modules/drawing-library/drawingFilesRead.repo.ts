import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveUnderDataDir } from "./drawingStorage.js";

const MAX_READ = 80 * 1024 * 1024;

export async function readDataFileAsBase64(relativePath: string): Promise<{ base64: string; mime: string }> {
  const abs = resolveUnderDataDir(relativePath);
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === ".pdf" ? "application/pdf" : "application/octet-stream";
  const buf = await readFile(abs);
  if (buf.length > MAX_READ) {
    throw new Error("ファイルが大きすぎます。外部アプリで開いてください。");
  }
  return { base64: buf.toString("base64"), mime };
}

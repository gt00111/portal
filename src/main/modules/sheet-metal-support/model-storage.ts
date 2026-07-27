import { access, copyFile, mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import { getSheetMetalSupportDataDir } from "@main/db/sheetMetalSupportConnection.js";

/**
 * 板金製造支援の 3Dモデル（STEP）ファイル保存。
 * 保存先: <DBと同じディレクトリ>/models/<品番>/<timestamp>_<ファイル名>
 * 図面ライブラリとは別管理（simulations.model_file_path に相対パスを保持）。
 */

const MAX_READ = 200 * 1024 * 1024;

export function safeSegment(input: string): string {
  const raw = input.trim();
  const safe = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "");
  return safe || "unknown";
}

/** データルートからの相対パスを絶対パスに解決（パストラバーサル防止） */
export function resolveUnderDataDir(relativePath: string): string {
  const root = path.resolve(getSheetMetalSupportDataDir());
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = path.resolve(root, normalized);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error("ファイルパスが許可範囲外です。");
  }
  return abs;
}

/** STEP ファイルを品番フォルダにコピーし、相対パスを返す。 */
export async function saveStepModel(
  sourceAbsolutePath: string,
  partNumber: string
): Promise<{ relativePath: string; absolutePath: string }> {
  const root = getSheetMetalSupportDataDir();
  const dir = path.join(root, "models", safeSegment(partNumber));
  await mkdir(dir, { recursive: true });
  await access(sourceAbsolutePath);
  const orig = path.basename(sourceAbsolutePath);
  const destName = `${Date.now()}_${safeSegment(orig)}`;
  const abs = path.join(dir, destName);
  await copyFile(sourceAbsolutePath, abs);
  const relative = path.relative(root, abs).replace(/\\/g, "/");
  return { relativePath: relative, absolutePath: abs };
}

/** 相対パスの STEP ファイルを読み込み、base64 で返す。 */
export async function readStepModel(
  relativePath: string
): Promise<{ fileName: string; base64: string }> {
  const abs = resolveUnderDataDir(relativePath);
  const buf = await readFile(abs);
  if (buf.length > MAX_READ) {
    throw new Error("3Dモデルが大きすぎます。");
  }
  return { fileName: path.basename(abs), base64: buf.toString("base64") };
}

export async function unlinkModelIfExists(relativePath: string): Promise<void> {
  try {
    await unlink(resolveUnderDataDir(relativePath));
  } catch {
    /* ignore */
  }
}

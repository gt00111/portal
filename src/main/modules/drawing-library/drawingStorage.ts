import { access, copyFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";

import { getDrawingLibraryDataDir } from "@main/db/drawingLibraryConnection.js";

export function safeSegment(input: string): string {
  const raw = input.trim();
  const safe = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "");
  return safe || "unknown";
}

/** db ルートからの相対パスを絶対パスに解決（パストラバーサル防止） */
export function resolveUnderDataDir(relativePath: string): string {
  const root = path.resolve(getDrawingLibraryDataDir());
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = path.resolve(root, normalized);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error("ファイルパスが許可範囲外です。");
  }
  return abs;
}

export async function ensurePdfInCustomerFolder(
  sourceAbsolutePath: string,
  customerName: string,
  drawingType: "customer" | "work"
): Promise<{ relativePath: string; absolutePath: string }> {
  const root = getDrawingLibraryDataDir();
  const safeCustomer = safeSegment(customerName);
  const customerDir =
    drawingType === "work"
      ? path.join(root, "drawings", "mycompany", safeCustomer)
      : path.join(root, "drawings", safeCustomer);
  await mkdir(customerDir, { recursive: true });
  await access(sourceAbsolutePath);
  const orig = path.basename(sourceAbsolutePath);
  const timestamp = Date.now();
  const safeName = safeSegment(orig);
  const destName = `${timestamp}_${safeName}`;
  const abs = path.join(customerDir, destName);
  await copyFile(sourceAbsolutePath, abs);
  const relative = path.relative(root, abs).replace(/\\/g, "/");
  return { relativePath: relative, absolutePath: abs };
}

/**
 * 自社発行の部品図面PDFを階層フォルダに保存する（REQ-DL-004）。
 * `drawings/mycompany/<客先>/<機種>/<アセンブリ品番>/<Rev>/<部品品番>.pdf`
 * 同名ファイルが既にある場合はタイムスタンプを付与して衝突を避ける。
 */
export async function ensureWorkPartPdf(
  sourceAbsolutePath: string,
  parts: {
    customerName: string;
    model?: string | null;
    assemblyNumber: string;
    revision?: string | null;
    partNumber: string;
  }
): Promise<{ relativePath: string; absolutePath: string }> {
  const root = getDrawingLibraryDataDir();
  const dir = path.join(
    root,
    "drawings",
    "mycompany",
    safeSegment(parts.customerName),
    safeSegment(parts.model?.trim() || "_"),
    safeSegment(parts.assemblyNumber),
    safeSegment(parts.revision?.trim() || "_")
  );
  await mkdir(dir, { recursive: true });
  await access(sourceAbsolutePath);
  const safeName = `${safeSegment(parts.partNumber)}.pdf`;
  let abs = path.join(dir, safeName);
  try {
    await access(abs);
    abs = path.join(dir, `${safeSegment(parts.partNumber)}_${Date.now()}.pdf`);
  } catch {
    /* 未存在ならそのまま使用 */
  }
  await copyFile(sourceAbsolutePath, abs);
  const relative = path.relative(root, abs).replace(/\\/g, "/");
  return { relativePath: relative, absolutePath: abs };
}

export async function ensureEdrawingsInFolder(
  sourceAbsolutePath: string,
  customerName: string
): Promise<{ relativePath: string; absolutePath: string }> {
  const root = getDrawingLibraryDataDir();
  const safeCustomer = safeSegment(customerName);
  const edrawDir = path.join(root, "mycompany", "edraw", safeCustomer);
  await mkdir(edrawDir, { recursive: true });
  await access(sourceAbsolutePath);
  const orig = path.basename(sourceAbsolutePath);
  const timestamp = Date.now();
  const safeName = safeSegment(orig);
  const destName = `${timestamp}_${safeName}`;
  const abs = path.join(edrawDir, destName);
  await copyFile(sourceAbsolutePath, abs);
  const relative = path.relative(root, abs).replace(/\\/g, "/");
  return { relativePath: relative, absolutePath: abs };
}

export async function unlinkIfExists(absolutePath: string): Promise<void> {
  try {
    await unlink(absolutePath);
  } catch {
    /* ignore */
  }
}

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

export async function ensureDxfInCustomerFolder(
  sourceAbsolutePath: string,
  customerName: string
): Promise<{ relativePath: string; absolutePath: string }> {
  const root = getDrawingLibraryDataDir();
  const safeCustomer = safeSegment(customerName);
  const dxfDir = path.join(root, "dxf", safeCustomer);
  await mkdir(dxfDir, { recursive: true });
  await access(sourceAbsolutePath);
  const orig = path.basename(sourceAbsolutePath);
  const timestamp = Date.now();
  const safeName = safeSegment(orig);
  const destName = `${timestamp}_${safeName}`;
  const abs = path.join(dxfDir, destName);
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

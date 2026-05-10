import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  type Dirent,
} from "node:fs";
import { copyFile, readFile, readdir, unlink, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BrowserWindow, app, dialog } from "electron";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { getPortalWindow } from "@main/window.js";

function dialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? getPortalWindow() ?? undefined;
}

function getAppTempRoot(): string {
  return join(app.getPath("userData"), "portal-pixo-converter", "temp");
}

function getUploadDir(): string {
  return join(getAppTempRoot(), "uploadimages");
}

function getOutputDir(): string {
  return join(getAppTempRoot(), "outputimages");
}

function ensureTempDirs(): void {
  const root = getAppTempRoot();
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  const u = getUploadDir();
  const o = getOutputDir();
  if (!existsSync(u)) mkdirSync(u, { recursive: true });
  if (!existsSync(o)) mkdirSync(o, { recursive: true });
}

export function cleanupTempDirs(): void {
  const dirs = [getUploadDir(), getOutputDir()];
  for (const dir of dirs) {
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        const filePath = join(dir, file);
        if (statSync(filePath).isDirectory()) {
          rmSync(filePath, { recursive: true, force: true });
        } else {
          unlinkSync(filePath);
        }
      }
    }
  }
}

function pdftoppmFileName(): string {
  return process.platform === "win32" ? "pdftoppm.exe" : "pdftoppm";
}

/** electron-vite: チャンクが `out/main/...` のどこに出るか不定のため、package.json まで辿る */
function projectRootFromMainBundle(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** `resources/tools/poppler-*`（例: poppler-25.07.0/Library/bin）を優先的に使う */
function addPopplerToolBinDirs(add: (dir: string) => void, toolsRoot: string): void {
  if (!existsSync(toolsRoot)) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(toolsRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (!ent.name.toLowerCase().startsWith("poppler")) continue;
    const binDir = join(toolsRoot, ent.name, "Library", "bin");
    if (existsSync(binDir)) add(binDir);
  }
}

function popplerBinDirCandidates(): string[] {
  const name = pdftoppmFileName();
  const unique: string[] = [];
  const add = (dir: string): void => {
    const d = dir.trim();
    if (d && !unique.includes(d)) unique.push(d);
  };

  if (app.isPackaged) {
    addPopplerToolBinDirs(add, join(process.resourcesPath, "tools"));
    add(join(process.resourcesPath, "pixo-converter", "bin"));
    add(join(process.resourcesPath, "resources", "pixo-converter", "bin"));
  } else {
    addPopplerToolBinDirs(add, join(projectRootFromMainBundle(), "resources", "tools"));
    add(join(projectRootFromMainBundle(), "resources", "pixo-converter", "bin"));
    add(join(app.getAppPath(), "resources", "pixo-converter", "bin"));
    add(join(app.getAppPath(), "..", "resources", "pixo-converter", "bin"));
  }

  return unique.filter((dir) => {
    try {
      return existsSync(join(dir, name));
    } catch {
      return false;
    }
  });
}

/** 同梱パスがあれば絶対パス、なければ PATH の pdftoppm を使う（Pixo 単体版の挙動に近い） */
function resolvePdftoppmCommand(): string {
  const name = pdftoppmFileName();
  const dirs = popplerBinDirCandidates();
  if (dirs.length > 0) return join(dirs[0], name);
  return name;
}

function spawnAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { shell: false });
    const stderrChunks: Buffer[] = [];
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else {
        const errText = Buffer.concat(stderrChunks).toString("utf8").trim();
        reject(
          new Error(
            errText.length > 0
              ? `pdftoppm exited with code ${code}: ${errText}`
              : `pdftoppm exited with code ${code}`,
          ),
        );
      }
    });
  });
}

async function copySelectionsToUpload(originalPaths: string[]): Promise<string[]> {
  ensureTempDirs();
  const uploaded: string[] = [];
  for (const originalPath of originalPaths) {
    const filename = originalPath.split(/[/\\]/).pop() ?? "file";
    const destPath = join(getUploadDir(), filename);
    await copyFile(originalPath, destPath);
    uploaded.push(destPath);
  }
  return uploaded;
}

export async function openPdfDialog(): Promise<string[]> {
  ensureTempDirs();
  const parent = dialogParent();
  const result = parent
    ? await dialog.showOpenDialog(parent, {
        filters: [{ name: "PDF Files", extensions: ["pdf"] }],
        properties: ["openFile", "multiSelections"],
      })
    : await dialog.showOpenDialog({
        filters: [{ name: "PDF Files", extensions: ["pdf"] }],
        properties: ["openFile", "multiSelections"],
      });
  if (result.canceled || result.filePaths.length === 0) return [];
  return copySelectionsToUpload(result.filePaths);
}

export async function convertPdfToImages(
  filePath: string,
  format: string = "png",
): Promise<string[] | { error: string }> {
  try {
    ensureTempDirs();
    const outDir = getOutputDir();
    const prefixBase = filePath.replace(/\\/g, "/").split("/").pop() ?? "doc";
    const prefix = prefixBase.replace(/\.[^.]+$/, "");
    const outputPrefix = join(outDir, `${prefix}_`);
    const poppler = resolvePdftoppmCommand();
    const popplerFormat = format === "jpg" ? "jpeg" : format;
    await spawnAsync(poppler, ["-r", "300", `-${popplerFormat}`, filePath, outputPrefix]);
    const files = readdirSync(outDir);
    return files
      .filter((f) => f.startsWith(prefix) && /\.(png|jpe?g)$/i.test(f))
      .map((f) => join(outDir, f));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

export async function saveOutputImagesToFolder(): Promise<{ success: boolean; error?: string }> {
  ensureTempDirs();
  const parent = dialogParent();
  const result = parent
    ? await dialog.showOpenDialog(parent, {
        title: "保存先フォルダを選択",
        properties: ["openDirectory"],
      })
    : await dialog.showOpenDialog({
        title: "保存先フォルダを選択",
        properties: ["openDirectory"],
      });
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, error: "保存先が選択されませんでした" };
  }
  const saveDir = result.filePaths[0];
  const sourceDir = getOutputDir();
  try {
    const files = await readdir(sourceDir);
    for (const file of files) {
      await copyFile(join(sourceDir, file), join(saveDir, file));
    }
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  } finally {
    cleanupTempDirs();
  }
}

export async function resetTempState(): Promise<{ success: boolean; error?: string }> {
  try {
    cleanupTempDirs();
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

export async function openTiffDialog(): Promise<string[]> {
  ensureTempDirs();
  const parent = dialogParent();
  const result = parent
    ? await dialog.showOpenDialog(parent, {
        filters: [{ name: "TIFF Files", extensions: ["tif", "tiff"] }],
        properties: ["openFile", "multiSelections"],
      })
    : await dialog.showOpenDialog({
        filters: [{ name: "TIFF Files", extensions: ["tif", "tiff"] }],
        properties: ["openFile", "multiSelections"],
      });
  if (result.canceled || result.filePaths.length === 0) return [];
  return copySelectionsToUpload(result.filePaths);
}

export async function convertTiffToPdf(filePath: string): Promise<
  { success: true; path: string } | { error: string }
> {
  try {
    ensureTempDirs();
    const image = sharp(filePath, { pages: -1 });
    const metadata = await image.metadata();
    const pageCount = metadata.pages ?? 1;
    const pdfDoc = await PDFDocument.create();
    const assumedDPI = 300;
    for (let i = 0; i < pageCount; i++) {
      const pageBuffer = await sharp(filePath, { page: i }).png().toBuffer();
      const pngImage = await pdfDoc.embedPng(pageBuffer);
      const widthInch = pngImage.width / assumedDPI;
      const heightInch = pngImage.height / assumedDPI;
      const pageWidth = widthInch * 72;
      const pageHeight = heightInch * 72;
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      page.drawImage(pngImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    }
    const pdfBytes = await pdfDoc.save();
    const base = (filePath.split(/[/\\]/).pop() ?? "out").replace(/\.[^.]+$/i, "");
    const outputPath = join(getOutputDir(), `${base}.pdf`);
    await writeFile(outputPath, pdfBytes);
    return { success: true, path: outputPath };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e ?? "不明なエラー");
    return { error: message };
  }
}

export async function openImagesDialog(): Promise<string[]> {
  ensureTempDirs();
  const parent = dialogParent();
  const result = parent
    ? await dialog.showOpenDialog(parent, {
        filters: [{ name: "画像ファイル", extensions: ["jpg", "jpeg", "png"] }],
        properties: ["openFile", "multiSelections"],
      })
    : await dialog.showOpenDialog({
        filters: [{ name: "画像ファイル", extensions: ["jpg", "jpeg", "png"] }],
        properties: ["openFile", "multiSelections"],
      });
  if (result.canceled || result.filePaths.length === 0) return [];
  return copySelectionsToUpload(result.filePaths);
}

export async function convertImageToPdf(filePath: string): Promise<
  { success: true; path: string } | { error: string }
> {
  try {
    ensureTempDirs();
    const metadata = await sharp(filePath).metadata();
    const imageBuffer = await sharp(filePath).png().toBuffer();
    const pdfDoc = await PDFDocument.create();
    const embeddedImage = await pdfDoc.embedPng(imageBuffer);
    const dpi = metadata.density ?? 300;
    const widthInch = embeddedImage.width / dpi;
    const heightInch = embeddedImage.height / dpi;
    const widthPt = widthInch * 72;
    const heightPt = heightInch * 72;
    const page = pdfDoc.addPage([widthPt, heightPt]);
    page.drawImage(embeddedImage, { x: 0, y: 0, width: widthPt, height: heightPt });
    const pdfBytes = await pdfDoc.save();
    const base = (filePath.split(/[/\\]/).pop() ?? "out").replace(/\.[^.]+$/i, "");
    const outputPath = join(getOutputDir(), `${base}.pdf`);
    await writeFile(outputPath, pdfBytes);
    return { success: true, path: outputPath };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: message };
  }
}

export async function mergePdfs(filePaths: string[]): Promise<
  { success: true; path: string } | { success: false; error: string }
> {
  try {
    ensureTempDirs();
    const mergedPdf = await PDFDocument.create();
    for (const filePath of filePaths) {
      const pdfBytes = await readFile(filePath);
      const pdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      for (const p of copiedPages) mergedPdf.addPage(p);
    }
    const mergedBytes = await mergedPdf.save();
    const outputPath = join(getOutputDir(), `merged_${Date.now()}.pdf`);
    await writeFile(outputPath, mergedBytes);
    return { success: true, path: outputPath };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

export async function mergeAndSaveToPath(
  filePaths: string[],
  savePath: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    ensureTempDirs();
    const mergedPdf = await PDFDocument.create();
    for (const filePath of filePaths) {
      const pdfBytes = await readFile(filePath);
      const pdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      for (const p of copiedPages) mergedPdf.addPage(p);
    }
    const mergedBytes = await mergedPdf.save();
    await writeFile(savePath, mergedBytes);
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

export async function showMergeSaveDialog(): Promise<
  { success: true; filePath: string } | { success: false; error: string }
> {
  const parent = dialogParent();
  const result = parent
    ? await dialog.showSaveDialog(parent, {
        title: "名前を付けて保存",
        defaultPath: "merged.pdf",
        filters: [{ name: "PDF Files", extensions: ["pdf"] }],
      })
    : await dialog.showSaveDialog({
        title: "名前を付けて保存",
        defaultPath: "merged.pdf",
        filters: [{ name: "PDF Files", extensions: ["pdf"] }],
      });
  if (result.canceled || !result.filePath) {
    return { success: false, error: "保存がキャンセルされました" };
  }
  return { success: true, filePath: result.filePath };
}

export async function copyPdfFile(
  sourcePath: string,
  targetPath: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await copyFile(sourcePath, targetPath);
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

export async function deleteTempFile(filePath: string): Promise<
  { success: true } | { success: false; error: string }
> {
  try {
    try {
      await access(filePath);
      await unlink(filePath);
    } catch (accessErr: unknown) {
      const code = accessErr as { code?: string };
      if (code?.code !== "ENOENT") throw accessErr;
    }
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

export async function readFileAsDataUrl(filePath: string): Promise<
  { success: true; dataURL: string } | { success: false; error: string }
> {
  try {
    await access(filePath).catch(() => {
      throw new Error("ファイルが見つかりません");
    });
    const fileBuffer = await readFile(filePath);
    const base64 = fileBuffer.toString("base64");
    const ext = filePath.toLowerCase().split(".").pop();
    const mimeType = ext === "pdf" ? "application/pdf" : "application/octet-stream";
    return { success: true, dataURL: `data:${mimeType};base64,${base64}` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

export async function getPdfPages(filePath: string): Promise<
  | { success: true; pages: { index: number; number: number; thumbnail: null }[] }
  | { success: false; error: string }
> {
  try {
    const pdfBytes = await readFile(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    const pages = [];
    for (let i = 0; i < pageCount; i++) {
      pages.push({ index: i, number: i + 1, thumbnail: null });
    }
    return { success: true, pages };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

/** サムネイル不要のとき用（連結 UI のページ数表示など） */
export async function getPdfPageCount(filePath: string): Promise<
  { success: true; pageCount: number } | { success: false; error: string }
> {
  try {
    const pdfBytes = await readFile(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    return { success: true, pageCount: pdfDoc.getPageCount() };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

export interface ManipulatePdfInput {
  sourcePdfPath: string | null;
  targetPdfPath: string;
  pageIndex?: number | null;
  pageIndices?: number[];
  operation: string;
}

export async function manipulatePdfPage(
  input: ManipulatePdfInput,
): Promise<{ success: true; outputPath: string } | { success: false; error: string }> {
  try {
    const { sourcePdfPath, targetPdfPath, pageIndex, pageIndices, operation } = input;
    if (!operation) throw new Error("操作種別(operation)が指定されていません");

    let sourcePdf: PDFDocument | null = null;
    if (operation !== "delete") {
      if (!sourcePdfPath || typeof sourcePdfPath !== "string") {
        throw new Error("操作用PDFが指定されていません");
      }
      const sourceBytes = await readFile(sourcePdfPath);
      sourcePdf = await PDFDocument.load(sourceBytes);
      if (sourcePdf.getPageCount() === 0) throw new Error("操作用PDFにページがありません");
    }

    const targetBytes = await readFile(targetPdfPath);
    const targetPdf = await PDFDocument.load(targetBytes);

    if (operation === "delete" && pageIndices && Array.isArray(pageIndices)) {
      for (const idx of pageIndices) {
        if (idx < 0 || idx >= targetPdf.getPageCount()) {
          throw new Error(`無効なページ番号です: ${idx}`);
        }
      }
      const newPdf = await PDFDocument.create();
      const deleteSet = new Set(pageIndices);
      for (let i = 0; i < targetPdf.getPageCount(); i++) {
        if (!deleteSet.has(i)) {
          const [originalPage] = await newPdf.copyPages(targetPdf, [i]);
          newPdf.addPage(originalPage);
        }
      }
      const newPdfBytes = await newPdf.save();
      const outputPath = join(getOutputDir(), `edited_${Date.now()}.pdf`);
      await writeFile(outputPath, newPdfBytes);
      return { success: true, outputPath };
    }

    if (pageIndex === undefined || pageIndex === null) {
      throw new Error("ページ番号が指定されていません");
    }
    if (pageIndex < 0 || pageIndex >= targetPdf.getPageCount()) {
      throw new Error("無効なページ番号です");
    }

    const newPdf = await PDFDocument.create();
    for (let i = 0; i < targetPdf.getPageCount(); i++) {
      if (operation === "delete" && i === pageIndex) continue;
      if (operation === "insertBefore" && i === pageIndex) {
        const [sourcePage] = await newPdf.copyPages(sourcePdf!, [0]);
        newPdf.addPage(sourcePage);
        const [originalPage] = await newPdf.copyPages(targetPdf, [i]);
        newPdf.addPage(originalPage);
      } else if (operation === "replace" && i === pageIndex) {
        const [sourcePage] = await newPdf.copyPages(sourcePdf!, [0]);
        newPdf.addPage(sourcePage);
      } else if (operation === "insertAfter" && i === pageIndex) {
        const [originalPage] = await newPdf.copyPages(targetPdf, [i]);
        newPdf.addPage(originalPage);
        const [sourcePage] = await newPdf.copyPages(sourcePdf!, [0]);
        newPdf.addPage(sourcePage);
      } else {
        const [originalPage] = await newPdf.copyPages(targetPdf, [i]);
        newPdf.addPage(originalPage);
      }
    }

    const newPdfBytes = await newPdf.save();
    const outputPath = join(getOutputDir(), `edited_${Date.now()}.pdf`);
    await writeFile(outputPath, newPdfBytes);
    return { success: true, outputPath };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

export async function showSavePdfDialog(): Promise<
  { success: true; filePath: string } | { success: false; error: string }
> {
  const parent = dialogParent();
  const result = parent
    ? await dialog.showSaveDialog(parent, {
        title: "名前を付けて保存",
        defaultPath: "document.pdf",
        filters: [{ name: "PDF Files", extensions: ["pdf"] }],
      })
    : await dialog.showSaveDialog({
        title: "名前を付けて保存",
        defaultPath: "document.pdf",
        filters: [{ name: "PDF Files", extensions: ["pdf"] }],
      });
  if (result.canceled || !result.filePath) {
    return { success: false, error: "保存がキャンセルされました" };
  }
  return { success: true, filePath: result.filePath };
}

export async function saveTempUploadFile(
  fileName: string,
  data: ArrayBuffer | Uint8Array | number[],
): Promise<{ success: true; path: string } | { success: false; error: string }> {
  try {
    if (!fileName || !data) throw new Error("fileName と data は必須です");
    ensureTempDirs();
    const tempFilePath = join(getUploadDir(), fileName);
    let bytes: Uint8Array;
    if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else if (Array.isArray(data)) {
      bytes = Uint8Array.from(data);
    } else {
      bytes = data;
    }
    await writeFile(tempFilePath, bytes);
    return { success: true, path: tempFilePath };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

/** 起動時に作業ディレクトリを用意 */
export function ensurePixoTempOnStartup(): void {
  ensureTempDirs();
}

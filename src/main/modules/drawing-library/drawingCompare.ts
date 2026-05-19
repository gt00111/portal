import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { app } from "electron";

import type { CompareDrawingsInput, CompareDrawingsResult } from "@shared/drawingLibrary.js";

import {
  getDrawingLibraryDataDir,
  isDrawingLibraryOpen,
} from "@main/db/drawingLibraryConnection.js";

import { resolveUnderDataDir } from "./drawingStorage.js";

function mainBundleDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/** Python 比較スクリプトは環境変数 `DRAWING_COMPARE_SCRIPT`、または配布物／開発用の既定パスで解決 */
function resolveCompareScriptPath(): string | null {
  const env = process.env["DRAWING_COMPARE_SCRIPT"];
  if (env && existsSync(env)) {
    return env;
  }
  const mainDir = mainBundleDir();
  const portalPackageRoot = join(mainDir, "..", "..");
  const scriptInTools = join(portalPackageRoot, "resources", "tools", "compare_drawings.py");
  if (existsSync(scriptInTools)) {
    return scriptInTools;
  }
  return null;
}

function portalPackageRootFromMain(): string {
  return join(mainBundleDir(), "..", "..");
}

/** 配布物は electron-builder の extraResources で `resources/tools` → `process.resourcesPath/tools` に配置 */
function resolveCompareExe(): string | null {
  const env = process.env["DRAWING_COMPARE_EXE"];
  if (env && existsSync(env)) {
    return env;
  }
  const resBase = process.resourcesPath || "";
  const packagedCandidates = [
    join(resBase, "tools", "compare_drawings.exe"),
    join(resBase, "compare_drawings.exe"),
  ];
  for (const p of packagedCandidates) {
    if (p && existsSync(p)) {
      return p;
    }
  }
  const portalRoot = portalPackageRootFromMain();
  const devBundled = join(portalRoot, "resources", "tools", "compare_drawings.exe");
  if (existsSync(devBundled)) {
    return devBundled;
  }
  return null;
}

function resolveCompareOutputDir(): string {
  if (isDrawingLibraryOpen()) {
    const dir = join(getDrawingLibraryDataDir(), "_temp");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
  const dir = join(app.getPath("userData"), "drawing-compare-temp");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function resolveAbsoluteForCompare(filePath: string): string {
  const isProbablyRelative =
    filePath.startsWith("drawings/") ||
    filePath.startsWith("mycompany/") ||
    filePath.startsWith("_temp/");
  if (isProbablyRelative) {
    return resolveUnderDataDir(filePath);
  }
  if (existsSync(filePath)) {
    return filePath;
  }
  return resolveUnderDataDir(filePath);
}

function buildCliTail(input: CompareDrawingsInput): string[] {
  const tail: string[] = [];
  if (input.pageNumber != null) {
    tail.push("--page", String(input.pageNumber));
  }
  if (input.roiCoords?.x !== undefined) {
    tail.push(
      "--roi",
      `${input.roiCoords.x},${input.roiCoords.y},${input.roiCoords.width},${input.roiCoords.height}`
    );
  }
  return tail;
}

function runSpawn(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: false, cwd, env: process.env });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `比較処理が失敗しました (code ${code})`));
        return;
      }
      resolve();
    });
  });
}

async function runPythonCompareScript(scriptPath: string, pdfArgs: string[]): Promise<void> {
  const cwd = dirname(scriptPath);
  const win = process.platform === "win32";
  const attempts: { cmd: string; args: string[] }[] = win
    ? [
        { cmd: "py", args: ["-3", scriptPath, ...pdfArgs] },
        { cmd: "python", args: [scriptPath, ...pdfArgs] },
        { cmd: "python3", args: [scriptPath, ...pdfArgs] },
      ]
    : [
        { cmd: "python3", args: [scriptPath, ...pdfArgs] },
        { cmd: "python", args: [scriptPath, ...pdfArgs] },
      ];

  let lastSpawnError: Error | null = null;
  for (const { cmd, args } of attempts) {
    try {
      await runSpawn(cmd, args, cwd);
      return;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        lastSpawnError = err instanceof Error ? err : new Error(String(e));
        continue;
      }
      throw e instanceof Error ? e : new Error(String(e));
    }
  }
  throw (
    lastSpawnError ??
    new Error("Python が見つかりません。Windows では Python 3 インストール後「py」ランチャーが使える状態にしてください。")
  );
}

export async function compareDrawings(input: CompareDrawingsInput): Promise<CompareDrawingsResult> {
  const abs1 = resolveAbsoluteForCompare(input.filePath1);
  const abs2 = resolveAbsoluteForCompare(input.filePath2);
  if (!existsSync(abs1) || !existsSync(abs2)) {
    throw new Error("比較元ファイルが見つかりません。");
  }

  const outDir = resolveCompareOutputDir();
  const outputPath = join(outDir, `comparison_${Date.now()}.png`);
  const tail = buildCliTail(input);

  const exe = resolveCompareExe();
  if (exe) {
    const args = [abs1, abs2, outputPath, ...tail];
    await runSpawn(exe, args, dirname(exe));
  } else {
    const script = resolveCompareScriptPath();
    if (!script) {
      throw new Error(
        "図面比較ツールが見つかりません。次のいずれかを行ってください: (1) compare_drawings.exe を `resources/tools/` に配置するか、`DRAWING_COMPARE_EXE` で絶対パスを指定する (2) Python スクリプトと pdf2image・OpenCV・poppler を用意し、`DRAWING_COMPARE_SCRIPT` で .py の絶対パスを指定する",
      );
    }
    const args = [abs1, abs2, outputPath, ...tail];
    await runPythonCompareScript(script, args);
  }

  if (!existsSync(outputPath)) {
    throw new Error("比較結果画像が生成されませんでした。");
  }
  const imageBuffer = readFileSync(outputPath);
  const dataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;
  try {
    unlinkSync(outputPath);
  } catch {
    /* ignore */
  }
  return { resultImage: dataUrl, message: "比較が完了しました" };
}

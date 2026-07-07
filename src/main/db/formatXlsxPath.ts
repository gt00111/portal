import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { app } from "electron";

import { FORMAT_XLSX_FILENAME, FORMAT_XLSX_RELATIVE_PATH, DATA_ROOT_RESOURCES_DIR } from "@shared/constants.js";

import { resolveUnderDataRoot } from "./dataRoot.js";

export type FormatXlsxSource = "dataRoot" | "bundled";

function tryDataRootFormatPath(): string | null {
  try {
    const abs = resolveUnderDataRoot(FORMAT_XLSX_RELATIVE_PATH);
    return existsSync(abs) ? abs : null;
  } catch {
    return null;
  }
}

/** アプリ同梱（開発: プロジェクト resources/、配布: app.asar 内 resources/） */
export function resolveBundledFormatXlsxPath(): string | null {
  const bundled = path.join(app.getAppPath(), DATA_ROOT_RESOURCES_DIR, FORMAT_XLSX_FILENAME);
  return existsSync(bundled) ? bundled : null;
}

/** データ根優先 → 同梱フォールバック */
export function resolveFormatXlsxPath(): { path: string; source: FormatXlsxSource } {
  const dataRootPath = tryDataRootFormatPath();
  if (dataRootPath) {
    return { path: dataRootPath, source: "dataRoot" };
  }

  const bundled = resolveBundledFormatXlsxPath();
  if (bundled) {
    return { path: bundled, source: "bundled" };
  }

  throw new Error(
    `CSVインポート用フォーマット (${FORMAT_XLSX_FILENAME}) が見つかりません。` +
      `共有データフォルダに ${FORMAT_XLSX_RELATIVE_PATH} を配置するか、アプリを再インストールしてください。`,
  );
}

/** 同梱テンプレをデータ根へ初回コピー（書き込み不可 PC では黙ってスキップ） */
export function seedFormatXlsxToDataRoot(bundledPath: string): void {
  try {
    const dest = resolveUnderDataRoot(FORMAT_XLSX_RELATIVE_PATH);
    if (existsSync(dest)) {
      return;
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(bundledPath, dest);
  } catch {
    // データ根への書き込み権限がない場合はフォールバック運用のまま
  }
}

/**
 * 中央 DB 接続後に呼び出し、データ根へ format.xlsx を自動配置する。
 * 既に存在する場合・同梱が無い場合・書き込み不可の場合は何もしない（冪等）。
 */
export function ensureFormatXlsxSeeded(): void {
  const bundled = resolveBundledFormatXlsxPath();
  if (bundled) {
    seedFormatXlsxToDataRoot(bundled);
  }
}

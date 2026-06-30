import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import {
  HERO_BACKGROUND_BASENAME,
  PORTAL_ASSETS_DIR,
} from "@shared/constants.js";

import { getDataRoot, toRelativeDataPath } from "./dataRoot.js";

const ALLOWED_HERO_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);

/** 選択した画像をデータ根 assets/ へコピーし、相対パスを返す */
export async function importHeroBackground(sourceAbsolutePath: string): Promise<string> {
  const normalizedSource = path.normalize(sourceAbsolutePath.trim());
  await access(normalizedSource);

  const ext = path.extname(normalizedSource).toLowerCase();
  if (!ALLOWED_HERO_EXTENSIONS.has(ext)) {
    throw new Error("対応していない画像形式です。");
  }

  const assetsDir = path.join(getDataRoot(), PORTAL_ASSETS_DIR);
  await mkdir(assetsDir, { recursive: true });

  const destAbs = path.join(assetsDir, `${HERO_BACKGROUND_BASENAME}${ext}`);
  await copyFile(normalizedSource, destAbs);
  return toRelativeDataPath(destAbs);
}

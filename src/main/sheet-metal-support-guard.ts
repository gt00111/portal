import { isSheetMetalSupportOpen } from "@main/db/sheetMetalSupportConnection.js";
import { isDrawingLibraryOpen } from "@main/db/drawingLibraryConnection.js";

export function ensureSheetMetalSupport(): void {
  if (!isSheetMetalSupportOpen()) {
    throw new Error("板金製造支援 DB が利用できません。ポータル DB を開き直してください。");
  }
}

/** 品番検索・図面表示は図面ライブラリ DB を参照するため、その利用可否も確認する。 */
export function ensureDrawingLibraryForSheetMetalSupport(): void {
  if (!isDrawingLibraryOpen()) {
    throw new Error("図面ライブラリ DB が利用できません。ポータル DB を開き直してください。");
  }
}

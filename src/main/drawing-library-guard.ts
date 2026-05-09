import { isDrawingLibraryOpen } from "@main/db/drawingLibraryConnection.js";

export function ensureDrawingLibrary(): void {
  if (!isDrawingLibraryOpen()) {
    throw new Error("図面ライブラリ DB が利用できません。ポータル DB を開き直してください。");
  }
}

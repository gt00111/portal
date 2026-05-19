import type { LibCommentRow, LibEdrawingsFileRow } from "@shared/drawingLibrary.js";

import { getDrawingLibraryDb } from "@main/db/drawingLibraryConnection.js";

import { resolveUnderDataDir, unlinkIfExists } from "./drawingStorage.js";

export function listEdrawingsByDrawing(drawingId: number): LibEdrawingsFileRow[] {
  const db = getDrawingLibraryDb();
  return db
    .prepare(
      "SELECT * FROM drawing_edrawings_files WHERE drawing_id = ? ORDER BY created_at ASC"
    )
    .all(drawingId) as LibEdrawingsFileRow[];
}

export function insertEdrawingsRow(
  drawingId: number,
  relativePath: string,
  originalName: string,
  fileSize: number
): LibEdrawingsFileRow {
  const db = getDrawingLibraryDb();
  const r = db
    .prepare(
      `INSERT INTO drawing_edrawings_files (drawing_id, file_path, file_name, file_size)
       VALUES (?, ?, ?, ?)`
    )
    .run(drawingId, relativePath, originalName, fileSize);
  const id = Number(r.lastInsertRowid);
  return db.prepare("SELECT * FROM drawing_edrawings_files WHERE id = ?").get(id) as LibEdrawingsFileRow;
}

export async function deleteEdrawingsFile(id: number): Promise<void> {
  const db = getDrawingLibraryDb();
  const file = db
    .prepare("SELECT * FROM drawing_edrawings_files WHERE id = ?")
    .get(id) as LibEdrawingsFileRow | undefined;
  if (!file) {
    throw new Error("eDrawings ファイルが見つかりません。");
  }
  try {
    const abs = resolveUnderDataDir(file.file_path);
    await unlinkIfExists(abs);
  } catch {
    /* continue */
  }
  db.prepare("DELETE FROM drawing_edrawings_files WHERE id = ?").run(id);
}

export function listComments(drawingId: number): LibCommentRow[] {
  const db = getDrawingLibraryDb();
  return db
    .prepare("SELECT * FROM drawing_comments WHERE drawing_id = ? ORDER BY created_at DESC")
    .all(drawingId) as LibCommentRow[];
}

export function insertComment(drawingId: number, text: string): LibCommentRow {
  const db = getDrawingLibraryDb();
  const r = db
    .prepare("INSERT INTO drawing_comments (drawing_id, comment_text) VALUES (?, ?)")
    .run(drawingId, text.trim());
  const id = Number(r.lastInsertRowid);
  return db.prepare("SELECT * FROM drawing_comments WHERE id = ?").get(id) as LibCommentRow;
}

export function updateComment(id: number, text: string): LibCommentRow {
  const db = getDrawingLibraryDb();
  const existing = db.prepare("SELECT * FROM drawing_comments WHERE id = ?").get(id) as LibCommentRow | undefined;
  if (!existing) {
    throw new Error("コメントが見つかりません。");
  }
  db.prepare(
    "UPDATE drawing_comments SET comment_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(text.trim(), id);
  return db.prepare("SELECT * FROM drawing_comments WHERE id = ?").get(id) as LibCommentRow;
}

export function deleteComment(id: number): void {
  const db = getDrawingLibraryDb();
  const existing = db.prepare("SELECT * FROM drawing_comments WHERE id = ?").get(id);
  if (!existing) {
    throw new Error("コメントが見つかりません。");
  }
  db.prepare("DELETE FROM drawing_comments WHERE id = ?").run(id);
}

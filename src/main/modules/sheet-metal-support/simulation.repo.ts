import path from "node:path";

import type { SimulationModel } from "@shared/sheetMetalSupport.js";

import { getSheetMetalSupportDb } from "@main/db/sheetMetalSupportConnection.js";

/**
 * シミュレーション（`simulations`）の CRUD。品番ごとに 1 件（is_active=1）。
 * Phase 3 では STEP モデルの登録パス（model_file_path）と状態のみを扱う。
 */

interface RawRow {
  id: number;
  part_number: string;
  model_file_path: string | null;
  status: string;
  updated_at: string;
  updated_by: number | null;
}

function toModel(raw: RawRow): SimulationModel {
  return {
    id: raw.id,
    partNumber: raw.part_number,
    modelFilePath: raw.model_file_path,
    fileName: raw.model_file_path ? path.basename(raw.model_file_path) : null,
    status: raw.status,
    updatedAt: raw.updated_at,
    updatedByName: null,
  };
}

const SELECT_COLS = "id, part_number, model_file_path, status, updated_at, updated_by";

export function getRawByPart(partNumber: string): RawRow | undefined {
  return getSheetMetalSupportDb()
    .prepare(
      `SELECT ${SELECT_COLS}
       FROM simulations
       WHERE part_number = ? AND is_active = 1
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(partNumber) as RawRow | undefined;
}

export function getByPart(partNumber: string): SimulationModel | null {
  const raw = getRawByPart(partNumber);
  return raw ? toModel(raw) : null;
}

/** 品番ごとに STEP モデルパスを upsert して返す。 */
export function setModelPath(
  partNumber: string,
  modelFilePath: string,
  userNameId: number | null
): SimulationModel {
  const db = getSheetMetalSupportDb();
  const existing = getRawByPart(partNumber);
  if (existing) {
    db.prepare(
      `UPDATE simulations
       SET model_file_path = ?, status = 'done', updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(modelFilePath, userNameId, existing.id);
  } else {
    db.prepare(
      `INSERT INTO simulations (part_number, model_file_path, status, created_by, updated_by)
       VALUES (?, ?, 'done', ?, ?)`
    ).run(partNumber, modelFilePath, userNameId, userNameId);
  }
  const saved = getByPart(partNumber);
  if (!saved) throw new Error("3Dモデルの保存に失敗しました。");
  return saved;
}

/**
 * 判断エンジン実行用にシミュレーション行を確保する。
 * STEP モデル未登録でも加工条件だけで判定できるよう、無ければ空行を作成する。
 */
export function ensureSimulation(partNumber: string, userNameId: number | null): number {
  const existing = getRawByPart(partNumber);
  if (existing) return existing.id;
  const info = getSheetMetalSupportDb()
    .prepare(
      `INSERT INTO simulations (part_number, model_file_path, status, created_by, updated_by)
       VALUES (?, NULL, 'draft', ?, ?)`
    )
    .run(partNumber, userNameId, userNameId);
  return Number(info.lastInsertRowid);
}

/** STEP モデルを取り外す（論理削除）。旧相対パスを返す。 */
export function clearModel(partNumber: string, userNameId: number | null): string | null {
  const db = getSheetMetalSupportDb();
  const existing = getRawByPart(partNumber);
  if (!existing) return null;
  db.prepare(
    `UPDATE simulations
     SET model_file_path = NULL, status = 'draft', is_active = 0, updated_by = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(userNameId, existing.id);
  return existing.model_file_path;
}

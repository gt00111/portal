import { getSheetMetalSupportDb } from "@main/db/sheetMetalSupportConnection.js";

/**
 * STEP 形状解析（`model_analyses`）の CRUD。
 * 解析本体（曲げ線の座標を含む）は JSON 文字列として `detail` に保持する。
 */

export interface ModelAnalysisRow {
  id: number;
  simulation_id: number;
  part_number: string;
  thickness: number | null;
  bend_count: number;
  detail: string;
  updated_at: string;
  updated_by: number | null;
}

export interface ModelAnalysisSaveInput {
  simulationId: number;
  partNumber: string;
  thickness: number | null;
  bendCount: number;
  detail: string;
  userNameId: number | null;
}

const SELECT_COLS =
  "id, simulation_id, part_number, thickness, bend_count, detail, updated_at, updated_by";

export function getBySimulation(simulationId: number): ModelAnalysisRow | undefined {
  return getSheetMetalSupportDb()
    .prepare(
      `SELECT ${SELECT_COLS}
       FROM model_analyses
       WHERE simulation_id = ? AND is_active = 1
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(simulationId) as ModelAnalysisRow | undefined;
}

/** シミュレーションごとに 1 件を upsert する。 */
export function save(input: ModelAnalysisSaveInput): ModelAnalysisRow {
  const db = getSheetMetalSupportDb();
  const existing = getBySimulation(input.simulationId);
  if (existing) {
    db.prepare(
      `UPDATE model_analyses
       SET thickness = ?, bend_count = ?, detail = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(input.thickness, input.bendCount, input.detail, input.userNameId, existing.id);
  } else {
    db.prepare(
      `INSERT INTO model_analyses
         (simulation_id, part_number, thickness, bend_count, detail, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.simulationId,
      input.partNumber,
      input.thickness,
      input.bendCount,
      input.detail,
      input.userNameId,
      input.userNameId
    );
  }
  const saved = getBySimulation(input.simulationId);
  if (!saved) throw new Error("形状解析結果の保存に失敗しました。");
  return saved;
}

import { getSheetMetalSupportDb } from "@main/db/sheetMetalSupportConnection.js";

/**
 * 判断エンジンの実行結果（`simulation_results`）の CRUD。
 * 理由・改善案・工程明細は JSON 文字列として保持する（列は Service が組み立てる）。
 */

export interface SimulationResultRow {
  id: number;
  simulation_id: number;
  judgement: string | null;
  process_score: number | null;
  interference_result: string | null;
  reason: string | null;
  recommendations: string | null;
  result_detail: string | null;
  updated_at: string;
  updated_by: number | null;
}

export interface SimulationResultSaveInput {
  simulationId: number;
  judgement: string;
  processScore: number;
  interferenceResult: string | null;
  reason: string;
  recommendations: string;
  resultDetail: string;
  userNameId: number | null;
}

const SELECT_COLS =
  "id, simulation_id, judgement, process_score, interference_result, reason, recommendations, result_detail, updated_at, updated_by";

export function getBySimulation(simulationId: number): SimulationResultRow | undefined {
  return getSheetMetalSupportDb()
    .prepare(
      `SELECT ${SELECT_COLS}
       FROM simulation_results
       WHERE simulation_id = ? AND is_active = 1
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(simulationId) as SimulationResultRow | undefined;
}

/** シミュレーションごとに 1 件を upsert する。 */
export function save(input: SimulationResultSaveInput): SimulationResultRow {
  const db = getSheetMetalSupportDb();
  const existing = getBySimulation(input.simulationId);
  if (existing) {
    db.prepare(
      `UPDATE simulation_results
       SET judgement = ?, process_score = ?, interference_result = ?, reason = ?,
           recommendations = ?, result_detail = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      input.judgement,
      input.processScore,
      input.interferenceResult,
      input.reason,
      input.recommendations,
      input.resultDetail,
      input.userNameId,
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO simulation_results
         (simulation_id, judgement, process_score, interference_result, reason,
          recommendations, result_detail, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.simulationId,
      input.judgement,
      input.processScore,
      input.interferenceResult,
      input.reason,
      input.recommendations,
      input.resultDetail,
      input.userNameId,
      input.userNameId
    );
  }
  const saved = getBySimulation(input.simulationId);
  if (!saved) throw new Error("判定結果の保存に失敗しました。");
  return saved;
}

import type Database from "better-sqlite3";

/**
 * 板金製造支援システム専用 DB（`sheet-metal-support.db`）のスキーマ。
 * 図面・マスタ情報は保持せず参照する（SSOT）。本 DB は加工条件・シミュレーション・
 * 技術ノート・加工履歴・更新履歴のみを正本管理する（docs/sheet-metal-support/14_DBスキーマ定義.md）。
 *
 * Phase 1（品番検索・最新版PDF表示）では本 DB のテーブルは未使用だが、後から追加困難な
 * 設計を避けるためテーブル作成のみ先行する。
 */
export function initSheetMetalSupportSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS process_conditions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_number TEXT NOT NULL,
      drawing_id INTEGER,
      customer_id INTEGER,
      model_id INTEGER,
      revision TEXT,
      material TEXT,
      thickness REAL,
      process_condition TEXT,
      process_score INTEGER,
      work_direction TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_process_conditions_part
      ON process_conditions (part_number);

    CREATE TABLE IF NOT EXISTS process_condition_bends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      process_condition_id INTEGER NOT NULL REFERENCES process_conditions(id) ON DELETE CASCADE,
      bend_sequence INTEGER NOT NULL,
      upper_tool_id INTEGER,
      lower_tool_id INTEGER,
      machine_id INTEGER,
      back_gauge REAL,
      angle REAL,
      bend_radius REAL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_pc_bends_parent
      ON process_condition_bends (process_condition_id, bend_sequence);

    CREATE TABLE IF NOT EXISTS simulations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_number TEXT NOT NULL,
      model_file_path TEXT,
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_simulations_part
      ON simulations (part_number);

    CREATE TABLE IF NOT EXISTS simulation_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      simulation_id INTEGER NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
      judgement TEXT,
      process_score INTEGER,
      interference_result TEXT,
      reason TEXT,
      recommendations TEXT,
      result_detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_sim_results_sim
      ON simulation_results (simulation_id);

    CREATE TABLE IF NOT EXISTS technical_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_number TEXT NOT NULL,
      note_type TEXT,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_technical_notes_part
      ON technical_notes (part_number);

    CREATE TABLE IF NOT EXISTS process_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_number TEXT NOT NULL,
      processed_at DATE,
      machine_id INTEGER,
      is_test INTEGER NOT NULL DEFAULT 0,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_process_histories_part
      ON process_histories (part_number);

    CREATE TABLE IF NOT EXISTS revision_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_table TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      part_number TEXT,
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by INTEGER,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_revision_histories_target
      ON revision_histories (target_table, target_id);
  `);
}

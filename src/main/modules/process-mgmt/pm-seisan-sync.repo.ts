import { getProcessMgmtDb } from "@main/db/processMgmtConnection.js";
import { getOrCreateBundleProjectId } from "@main/db/processMgmtSchema.js";
import { getSeisanDb } from "@main/db/seisanConnection.js";

/** 下書き・取消以外の生産ボード案件に、未作成なら SolidWorks / CADMAC の 2 工程を自動作成 */
export function syncDefaultProcessTasksFromSeisan(): { created: number } {
  const seisan = getSeisanDb();
  const pm = getProcessMgmtDb();
  const bundleId = getOrCreateBundleProjectId(pm);
  const projectRows = seisan
    .prepare(`SELECT id FROM projects WHERE status NOT IN ('draft', 'canceled')`)
    .all() as { id: string }[];

  const existsStmt = pm.prepare("SELECT 1 FROM tasks WHERE seisan_project_id = ? LIMIT 1");
  const insertStmt = pm.prepare(
    `
      INSERT INTO tasks (
        project_id, seisan_project_id, title, description, process_type, status, assignee,
        progress_note, progress_percent, started_at, completed_at, created_at, updated_at
      )
      VALUES (?, ?, ?, '', ?, '未開始', '', '', 0, NULL, NULL, ?, ?)
    `
  );

  let created = 0;
  const now = new Date().toISOString();
  for (const { id } of projectRows) {
    if (existsStmt.get(id)) continue;
    insertStmt.run(bundleId, id, "SolidWorks工程", "solidworks", now, now);
    insertStmt.run(bundleId, id, "CADMAC工程", "cadmac", now, now);
    created += 2;
  }
  return { created };
}

import { getProcessMgmtDb } from "@main/db/processMgmtConnection.js";
import type { PmProject } from "@shared/processMgmt.js";

type ProjectRow = {
  id: number;
  name: string;
  description: string;
  client: string;
  drawing_number: string;
  revision: string;
  note: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CreatePmProjectPayload = {
  name: string;
  description?: string;
  client?: string;
  drawingNumber?: string;
  revision?: string;
  note?: string;
};

export type UpdatePmProjectPayload = {
  id: number;
  name: string;
  description: string;
  client: string;
  drawingNumber: string;
  revision: string;
  note: string;
  status: string;
};

const PROJECT_NAME_MAX_LENGTH = 100;
const PROJECT_DESCRIPTION_MAX_LENGTH = 500;
const PROJECT_CLIENT_MAX_LENGTH = 100;
const PROJECT_DRAWING_NUMBER_MAX_LENGTH = 120;
const PROJECT_REVISION_MAX_LENGTH = 40;
const PROJECT_NOTE_MAX_LENGTH = 1000;
const PROJECT_STATUS_VALUES = ["active", "on_hold", "completed", "archived"] as const;

function validateProjectInput(
  name: string,
  description: string,
  client: string,
  drawingNumber: string,
  revision: string,
  note: string,
  status: string
): void {
  if (!name) {
    throw new Error("案件名を入力してください。");
  }
  if (name.length > PROJECT_NAME_MAX_LENGTH) {
    throw new Error(`案件名は ${PROJECT_NAME_MAX_LENGTH} 文字以内にしてください。`);
  }
  if (description.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
    throw new Error(`説明は ${PROJECT_DESCRIPTION_MAX_LENGTH} 文字以内にしてください。`);
  }
  if (!client) {
    throw new Error("客先を入力してください。");
  }
  if (!drawingNumber) {
    throw new Error("図面番号を入力してください。");
  }
  if (!revision) {
    throw new Error("リビジョンを入力してください。");
  }
  if (client.length > PROJECT_CLIENT_MAX_LENGTH) {
    throw new Error(`客先は ${PROJECT_CLIENT_MAX_LENGTH} 文字以内にしてください。`);
  }
  if (drawingNumber.length > PROJECT_DRAWING_NUMBER_MAX_LENGTH) {
    throw new Error(`図面番号は ${PROJECT_DRAWING_NUMBER_MAX_LENGTH} 文字以内にしてください。`);
  }
  if (revision.length > PROJECT_REVISION_MAX_LENGTH) {
    throw new Error(`リビジョンは ${PROJECT_REVISION_MAX_LENGTH} 文字以内にしてください。`);
  }
  if (note.length > PROJECT_NOTE_MAX_LENGTH) {
    throw new Error(`備考は ${PROJECT_NOTE_MAX_LENGTH} 文字以内にしてください。`);
  }
  if (!PROJECT_STATUS_VALUES.includes(status as (typeof PROJECT_STATUS_VALUES)[number])) {
    throw new Error(`ステータスは次のいずれかにしてください: ${PROJECT_STATUS_VALUES.join(", ")}`);
  }
}

function mapProject(row: ProjectRow): PmProject {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    client: row.client,
    drawingNumber: row.drawing_number,
    revision: row.revision,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProjects(): PmProject[] {
  const db = getProcessMgmtDb();
  const rows = db
    .prepare(
      `
        SELECT id, name, description, status, created_at, updated_at
             , client, drawing_number, revision, note
        FROM projects
        ORDER BY id DESC
      `
    )
    .all() as ProjectRow[];
  return rows.map(mapProject);
}

export function createProject(payload: CreatePmProjectPayload): PmProject {
  const name = payload.name.trim();
  const description = (payload.description || "").trim();
  const client = (payload.client || "").trim();
  const drawingNumber = (payload.drawingNumber || "").trim() || name;
  const revision = (payload.revision || "").trim() || "A";
  const note = (payload.note || "").trim() || description;
  const status = "active";
  validateProjectInput(name, description, client, drawingNumber, revision, note, status);

  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `
        SELECT id FROM projects
        WHERE client = ? AND drawing_number = ? AND revision = ?
      `
    )
    .get(client, drawingNumber, revision) as { id: number } | undefined;

  if (existing) {
    throw new Error("同じ客先・図面番号・リビジョンの案件が既に存在します。");
  }

  const result = db
    .prepare(
      `
        INSERT INTO projects (
          name, description, client, drawing_number, revision, note, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `
    )
    .run(name, description, client, drawingNumber, revision, note, now, now);

  db.prepare(
    `
      INSERT INTO tasks (
        project_id, title, description, process_type, status, assignee, started_at, completed_at, created_at, updated_at
      )
      VALUES
      (?, 'SolidWorks工程', '', 'solidworks', '未開始', '', NULL, NULL, ?, ?),
      (?, 'CADMAC工程', '', 'cadmac', '未開始', '', NULL, NULL, ?, ?)
    `
  ).run(result.lastInsertRowid, now, now, result.lastInsertRowid, now, now);

  const row = db
    .prepare(
      `
        SELECT id, name, description, client, drawing_number, revision, note, status, created_at, updated_at
        FROM projects WHERE id = ?
      `
    )
    .get(result.lastInsertRowid) as ProjectRow;

  return mapProject(row);
}

export function getProjectDetail(id: number): PmProject {
  const db = getProcessMgmtDb();
  const row = db
    .prepare(
      `
        SELECT id, name, description, client, drawing_number, revision, note, status, created_at, updated_at
        FROM projects WHERE id = ?
      `
    )
    .get(id) as ProjectRow | undefined;
  if (!row) {
    throw new Error("案件が見つかりません。");
  }
  return mapProject(row);
}

export function updateProject(payload: UpdatePmProjectPayload): PmProject {
  const name = payload.name.trim();
  const description = payload.description.trim();
  const client = payload.client.trim();
  const drawingNumber = payload.drawingNumber.trim();
  const revision = payload.revision.trim();
  const note = payload.note.trim();
  const status = payload.status.trim();
  validateProjectInput(name, description, client, drawingNumber, revision, note, status);

  const db = getProcessMgmtDb();
  const now = new Date().toISOString();
  db.prepare(
    `
      UPDATE projects
      SET name = ?, description = ?, client = ?, drawing_number = ?, revision = ?, note = ?, status = ?, updated_at = ?
      WHERE id = ?
    `
  ).run(name, description, client, drawingNumber, revision, note, status, now, payload.id);

  return getProjectDetail(payload.id);
}

export function deleteProject(id: number): { id: number; relatedTaskCount: number } {
  const db = getProcessMgmtDb();
  const project = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(id) as { id: number } | undefined;
  if (!project) {
    throw new Error("案件が見つかりません。");
  }
  const taskCountRow = db
    .prepare(`SELECT COUNT(*) as total FROM tasks WHERE project_id = ?`)
    .get(id) as { total: number };

  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  return { id, relatedTaskCount: taskCountRow.total };
}

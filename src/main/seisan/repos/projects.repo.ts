import type { Project, ProjectWithRelations } from "@shared/seisan/project.js";
import { PROJECT_STATUS_TRANSITIONS } from "@shared/seisan/status.js";

import { getSeisanDb } from "@main/db/seisanConnection.js";
import { generateId } from "@main/seisan/utils/id.js";
import { now } from "@main/seisan/utils/datetime.js";

export interface ProjectListFilter {
  status?: string[]
  company_id?: string
  group_id?: string
  deadline_from?: string
  deadline_to?: string
  created_from?: string
  created_to?: string
  search?: string
  sort_by?: 'deadline' | 'created_at' | 'priority'
  sort_order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface ProjectListResult {
  items: ProjectWithRelations[]
  total: number
}

export interface CreateProjectInput {
  company_id: string
  deadline?: string
  project_name?: string
  request_content?: string
  input_by_user_id: string
  group_id?: string
  priority?: number
  model_type?: string
  part_number?: string
  unit_number?: string
  revision?: string
  notes?: string
}

export interface UpdateProjectInput {
  id: string
  company_id?: string
  deadline?: string
  project_name?: string
  request_content?: string
  group_id?: string
  priority?: number
  model_type?: string
  part_number?: string
  unit_number?: string
  revision?: string
  notes?: string
}

function generateProjectNo(): string {
  const db = getSeisanDb()
  const year = new Date().getFullYear().toString().slice(-2)
  const prefix = `YS${year}-`
  const row = db.prepare(`
    SELECT MAX(CAST(SUBSTR(project_no, 6) AS INTEGER)) AS max_seq
    FROM projects
    WHERE project_no LIKE ?
  `).get(`${prefix}%`) as { max_seq: number | null }
  const next = (row?.max_seq ?? 0) + 1
  return `${prefix}${next.toString().padStart(4, '0')}`
}

export function list(filter?: ProjectListFilter): ProjectListResult {
  const db = getSeisanDb()
  const conditions: string[] = ['1=1']
  const params: unknown[] = []

  if (filter?.status?.length) {
    const placeholders = filter.status.map(() => '?').join(',')
    conditions.push(`p.status IN (${placeholders})`)
    params.push(...filter.status)
  }
  if (filter?.company_id) {
    conditions.push('p.company_id = ?')
    params.push(filter.company_id)
  }
  if (filter?.group_id) {
    conditions.push('p.group_id = ?')
    params.push(filter.group_id)
  }
  if (filter?.deadline_from) {
    conditions.push('p.deadline >= ?')
    params.push(filter.deadline_from)
  }
  if (filter?.deadline_to) {
    conditions.push('p.deadline <= ?')
    params.push(filter.deadline_to)
  }
  if (filter?.created_from) {
    conditions.push('p.created_at >= ?')
    params.push(filter.created_from)
  }
  if (filter?.created_to) {
    conditions.push('p.created_at <= ?')
    params.push(filter.created_to)
  }
  if (filter?.search?.trim()) {
    const searchPattern = `%${filter.search.trim()}%`
    conditions.push(`(
      p.project_no LIKE ? OR
      p.company_id LIKE ? OR
      COALESCE(p.project_name, '') LIKE ? OR
      COALESCE(p.model_type, '') LIKE ? OR
      COALESCE(p.part_number, '') LIKE ? OR
      COALESCE(p.unit_number, '') LIKE ? OR
      COALESCE(p.revision, '') LIKE ? OR
      COALESCE(p.request_content, '') LIKE ?
    )`)
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern)
  }

  const sortBy = filter?.sort_by ?? 'deadline'
  const sortOrder = filter?.sort_order ?? 'asc'
  const orderClause = `p.${sortBy} ${sortOrder.toUpperCase()}`

  const whereClause = conditions.join(' AND ')

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM projects p WHERE ${whereClause}`).get(...params) as { total: number }
  const total = countRow.total

  const limit = filter?.limit ?? 0
  const offset = filter?.offset ?? 0
  const listParams = limit > 0 ? [...params, limit, offset] : params
  const limitClause = limit > 0 ? 'LIMIT ? OFFSET ?' : ''

  const sql = `
    SELECT
      p.*,
      p.company_id AS company_name,
      p.group_id AS group_name,
      p.input_by_user_id AS input_by_username,
      NULL AS input_by_display_name
    FROM projects p
    WHERE ${whereClause}
    ORDER BY ${orderClause}
    ${limitClause}
  `.trim()
  const rows = db.prepare(sql).all(...listParams) as ProjectWithRelations[]

  return { items: rows, total }
}

export function get(id: string): ProjectWithRelations | null {
  const db = getSeisanDb()
  const row = db.prepare(`
    SELECT
      p.*,
      p.company_id AS company_name,
      p.group_id AS group_name,
      p.input_by_user_id AS input_by_username,
      NULL AS input_by_display_name
    FROM projects p
    WHERE p.id = ?
  `).get(id) as ProjectWithRelations | undefined

  return row ?? null
}

export function checkDuplicate(
  projectName?: string | null,
  modelType?: string | null,
  partNumber?: string | null,
  unitNumber?: string | null,
  excludeId?: string,
): boolean {
  const db = getSeisanDb()
  const conditions = [
    "COALESCE(project_name, '') = ?",
    "COALESCE(model_type, '') = ?",
    "COALESCE(part_number, '') = ?",
    "COALESCE(unit_number, '') = ?",
  ]
  const params: unknown[] = [
    projectName ?? '',
    modelType ?? '',
    partNumber ?? '',
    unitNumber ?? '',
  ]
  if (excludeId) {
    conditions.push('id != ?')
    params.push(excludeId)
  }
  const row = db.prepare(
    `SELECT COUNT(*) as cnt FROM projects WHERE ${conditions.join(' AND ')}`
  ).get(...params) as { cnt: number }
  return row.cnt > 0
}

export function create(input: CreateProjectInput): Project {
  const db = getSeisanDb()

  if (input.unit_number?.trim()) {
    if (checkDuplicate(input.project_name, input.model_type, input.part_number, input.unit_number)) {
      throw new Error('同じ名称・機種・図面番号(品番)・号機の案件がすでに登録されています')
    }
  }

  const id = generateId()
  const projectNo = generateProjectNo()
  const ts = now()
  const deadline = input.deadline ?? '9999-12-31'
  db.prepare(`
    INSERT INTO projects (
      id, project_no, received_at, input_by_user_id,
      company_id, project_name, request_content, deadline,
      group_id, status, priority,
      model_type, part_number, unit_number,
      revision,
      notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    projectNo,
    null,
    input.input_by_user_id,
    input.company_id,
    input.project_name ?? null,
    input.request_content ?? null,
    deadline,
    input.group_id ?? null,
    input.priority ?? 0,
    input.model_type ?? null,
    input.part_number ?? null,
    input.unit_number ?? null,
    input.revision ?? null,
    input.notes ?? null,
    ts,
    ts
  )
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project
  return row
}

export function update(input: UpdateProjectInput): Project {
  const db = getSeisanDb()
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(input.id) as Project | undefined
  if (!existing) throw new Error('案件が見つかりません')

  const finalName = input.project_name ?? existing.project_name
  const finalModel = input.model_type ?? existing.model_type
  const finalPart = input.part_number ?? existing.part_number
  const finalUnit = input.unit_number ?? existing.unit_number

  if (finalUnit?.trim()) {
    if (checkDuplicate(finalName, finalModel, finalPart, finalUnit, input.id)) {
      throw new Error('同じ名称・機種・図面番号(品番)・号機の案件がすでに登録されています')
    }
  }

  const ts = now()
  db.prepare(`
    UPDATE projects SET
      company_id = COALESCE(?, company_id),
      deadline = COALESCE(?, deadline),
      project_name = COALESCE(?, project_name),
      request_content = COALESCE(?, request_content),
      group_id = COALESCE(?, group_id),
      priority = COALESCE(?, priority),
      model_type = COALESCE(?, model_type),
      part_number = COALESCE(?, part_number),
      unit_number = COALESCE(?, unit_number),
      revision = COALESCE(?, revision),
      notes = COALESCE(?, notes),
      updated_at = ?
    WHERE id = ?
  `).run(
    input.company_id ?? null,
    input.deadline ?? null,
    input.project_name ?? null,
    input.request_content ?? null,
    input.group_id ?? null,
    input.priority ?? null,
    input.model_type ?? null,
    input.part_number ?? null,
    input.unit_number ?? null,
    input.revision ?? null,
    input.notes ?? null,
    ts,
    input.id
  )
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(input.id) as Project
  return row
}

function assertTransition(current: string, next: string): void {
  const allowed = PROJECT_STATUS_TRANSITIONS[current]
  if (!allowed || !allowed.includes(next)) {
    throw new Error(`ステータスを「${current}」から「${next}」に変更することはできません`)
  }
}

export function submit(id: string): Project {
  const db = getSeisanDb()
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined
  if (!existing) throw new Error('案件が見つかりません')
  assertTransition(existing.status, 'submitted')
  const ts = now()
  db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run('submitted', ts, id)
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project
}

export function approve(id: string): Project {
  const db = getSeisanDb()
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined
  if (!existing) throw new Error('案件が見つかりません')
  assertTransition(existing.status, 'approved')
  const ts = now()
  db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run('approved', ts, id)
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project
}

export function updateStatus(id: string, status: string): Project {
  const db = getSeisanDb()
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined
  if (!existing) throw new Error('案件が見つかりません')
  assertTransition(existing.status, status)
  const ts = now()
  const completedAt = status === 'done' ? ts : null
  db.prepare('UPDATE projects SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?').run(
    status,
    completedAt,
    ts,
    id
  )
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project
}

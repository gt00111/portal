import type { ProcessTemplate } from "@shared/seisan/processTemplate.js";

import { getSeisanDb } from "@main/db/seisanConnection.js";
import { generateId } from "@main/seisan/utils/id.js";
import { now } from "@main/seisan/utils/datetime.js";

export interface CreateProcessTemplateInput {
  name: string
  sort_order?: number
  default_days?: number
  color?: string | null
  is_active?: number
}

export interface UpdateProcessTemplateInput {
  id: string
  name?: string
  sort_order?: number
  default_days?: number
  color?: string | null
  is_active?: number
}

export function list(activeOnly = false): ProcessTemplate[] {
  const db = getSeisanDb()
  const sql = activeOnly
    ? `SELECT * FROM process_templates WHERE is_active = 1 ORDER BY sort_order ASC, name ASC`
    : `SELECT * FROM process_templates ORDER BY sort_order ASC, name ASC`
  return db.prepare(sql).all() as ProcessTemplate[]
}

export function create(input: CreateProcessTemplateInput): ProcessTemplate {
  const db = getSeisanDb()
  const id = generateId()
  const ts = now()
  const sortOrder = input.sort_order ?? 0
  const defaultDays = input.default_days ?? 1
  const isActive = input.is_active ?? 1
  db.prepare(`
    INSERT INTO process_templates (id, name, sort_order, default_days, color, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    sortOrder,
    defaultDays,
    input.color ?? null,
    isActive,
    ts,
    ts
  )
  return db.prepare('SELECT * FROM process_templates WHERE id = ?').get(id) as ProcessTemplate
}

export function update(input: UpdateProcessTemplateInput): ProcessTemplate {
  const db = getSeisanDb()
  const ts = now()
  const current = db.prepare('SELECT * FROM process_templates WHERE id = ?').get(input.id) as ProcessTemplate | undefined
  if (!current) throw new Error('工程テンプレートが見つかりません')
  db.prepare(`
    UPDATE process_templates SET
      name = COALESCE(?, name),
      sort_order = COALESCE(?, sort_order),
      default_days = COALESCE(?, default_days),
      color = ?,
      is_active = COALESCE(?, is_active),
      updated_at = ?
    WHERE id = ?
  `).run(
    input.name ?? null,
    input.sort_order ?? null,
    input.default_days ?? null,
    input.color !== undefined ? input.color : current.color,
    input.is_active ?? null,
    ts,
    input.id
  )
  return db.prepare('SELECT * FROM process_templates WHERE id = ?').get(input.id) as ProcessTemplate
}

export function remove(id: string): void {
  const db = getSeisanDb()
  const ref = db.prepare(
    'SELECT COUNT(*) as cnt FROM tasks WHERE process_template_id = ?'
  ).get(id) as { cnt: number }
  if (ref.cnt > 0) {
    throw new Error('この工程テンプレートは使用中のタスクがあるため削除できません')
  }
  db.prepare('DELETE FROM process_templates WHERE id = ?').run(id)
}

export function get(id: string): ProcessTemplate | null {
  const db = getSeisanDb()
  const row = db.prepare('SELECT * FROM process_templates WHERE id = ?').get(id) as ProcessTemplate | undefined
  return row ?? null
}

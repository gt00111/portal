import type { Task, TaskWithProject } from "@shared/seisan/task.js";

import { getSeisanDb } from "@main/db/seisanConnection.js";
import { generateId } from "@main/seisan/utils/id.js";
import { dateToStr, now, todayStr } from "@main/seisan/utils/datetime.js";

export interface TaskListFilter {
  status?: string[]
  resource_id?: string
  group_id?: string
  date_from?: string
  date_to?: string
  include_done?: boolean
  search?: string
}

export interface CreateTaskInput {
  project_id: string
  parent_task_id: string
  text: string
  start_date: string
  end_date: string
  task_type?: 'task' | 'milestone'
  sort_order?: number
  depends_on_task_id?: string
  process_template_id?: string | null
}

export interface UpdateTaskInput {
  id: string
  text?: string
  start_date?: string
  end_date?: string
  progress?: number
  status?: string
  sort_order?: number
  depends_on_task_id?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
}

export function listByProject(projectId: string, includeDone = false): Task[] {
  const db = getSeisanDb()
  const rows = db.prepare(`
    SELECT *
    FROM tasks
    WHERE project_id = ?
      AND (? = 1 OR status != 'done')
    ORDER BY sort_order ASC
  `).all(projectId, includeDone ? 1 : 0) as Task[]
  return rows
}

export function listAll(filter?: TaskListFilter): TaskWithProject[] {
  const db = getSeisanDb()
  const conditions: string[] = ["t.task_type IN ('project', 'task', 'milestone')"]
  const params: unknown[] = []

  if (filter?.status?.length) {
    const placeholders = filter.status.map(() => '?').join(',')
    conditions.push(`t.status IN (${placeholders})`)
    params.push(...filter.status)
  }
  if (filter?.date_from) {
    conditions.push('t.end_date >= ?')
    params.push(filter.date_from)
  }
  if (filter?.date_to) {
    conditions.push('t.start_date <= ?')
    params.push(filter.date_to)
  }
  if (!filter?.include_done) {
    conditions.push("t.status != 'done'")
    conditions.push("p.status != 'done'")
  }
  if (filter?.group_id) {
    conditions.push('p.group_id = ?')
    params.push(filter.group_id)
  }

  const sql = `
    SELECT
      t.*,
      p.project_no,
      p.company_id,
      p.project_name,
      p.model_type,
      p.part_number,
      p.unit_number,
      p.deadline AS project_deadline,
      p.group_id AS group_name,
      p.company_id AS company_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.start_date ASC
  `
  const rows = db.prepare(sql).all(...params) as TaskWithProject[]

  return rows
}

export function create(input: CreateTaskInput): Task {
  const db = getSeisanDb()
  const id = generateId()
  const ts = now()
  const sortOrder = input.sort_order ?? 0
  db.prepare(`
    INSERT INTO tasks (
      id, project_id, parent_task_id, task_type,
      text, start_date, end_date,
      progress, status, sort_order,
      depends_on_task_id, process_template_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'planned', ?, ?, ?, ?, ?)
  `).run(
    id,
    input.project_id,
    input.parent_task_id,
    input.task_type ?? 'task',
    input.text,
    input.start_date,
    input.end_date,
    sortOrder,
    input.depends_on_task_id ?? null,
    input.process_template_id ?? null,
    ts,
    ts
  )
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task
}

export function update(input: UpdateTaskInput): Task {
  const db = getSeisanDb()
  const ts = now()
  const current = db.prepare('SELECT * FROM tasks WHERE id = ?').get(input.id) as Task | undefined
  if (!current) throw new Error('タスクが見つかりません')
  db.prepare(`
    UPDATE tasks SET
      text = COALESCE(?, text),
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date),
      progress = COALESCE(?, progress),
      status = COALESCE(?, status),
      sort_order = COALESCE(?, sort_order),
      depends_on_task_id = ?,
      actual_start_date = COALESCE(?, actual_start_date),
      actual_end_date = COALESCE(?, actual_end_date),
      updated_at = ?
    WHERE id = ?
  `).run(
    input.text ?? null,
    input.start_date ?? null,
    input.end_date ?? null,
    input.progress ?? null,
    input.status ?? null,
    input.sort_order ?? null,
    input.depends_on_task_id !== undefined ? input.depends_on_task_id : current.depends_on_task_id,
    input.actual_start_date !== undefined ? input.actual_start_date : current.actual_start_date,
    input.actual_end_date !== undefined ? input.actual_end_date : current.actual_end_date,
    ts,
    input.id
  )
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(input.id) as Task
}

export function updateDates(id: string, startDate: string, endDate: string): Task {
  const db = getSeisanDb()
  const ts = now()

  const target = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
  if (!target) throw new Error('タスクが見つかりません')

  db.prepare('UPDATE tasks SET start_date = ?, end_date = ?, updated_at = ? WHERE id = ?').run(
    startDate, endDate, ts, id
  )

  if (target.task_type !== 'project') {
    const siblings = db.prepare(`
      SELECT * FROM tasks
      WHERE project_id = ? AND task_type = 'task' AND id != ?
      ORDER BY sort_order ASC
    `).all(target.project_id, id) as Task[]

    const toDate = (s: string) => new Date(s + 'T00:00:00')
    const toStr = (d: Date) => dateToStr(d)
    const addDays = (d: Date, n: number) => {
      const x = new Date(d); x.setDate(x.getDate() + n); return x
    }

    const newStart = toDate(startDate)
    const newEnd = toDate(endDate)

    const before = siblings.filter((s) => s.sort_order < target.sort_order)
      .sort((a, b) => b.sort_order - a.sort_order)
    const after = siblings.filter((s) => s.sort_order > target.sort_order)
      .sort((a, b) => a.sort_order - b.sort_order)

    let boundary = addDays(newStart, -1)
    for (const sib of before) {
      const sibEnd = toDate(sib.end_date)
      if (sibEnd.getTime() !== boundary.getTime()) {
        const sibStart = toDate(sib.start_date)
        const duration = Math.max(0, Math.floor((sibEnd.getTime() - sibStart.getTime()) / 86400000))
        const adjustedEnd = boundary
        const adjustedStart = addDays(adjustedEnd, -duration)
        db.prepare('UPDATE tasks SET start_date = ?, end_date = ?, updated_at = ? WHERE id = ?')
          .run(toStr(adjustedStart), toStr(adjustedEnd), ts, sib.id)
        boundary = addDays(adjustedStart, -1)
      } else {
        break
      }
    }

    boundary = addDays(newEnd, 1)
    for (const sib of after) {
      const sibStart = toDate(sib.start_date)
      if (sibStart.getTime() !== boundary.getTime()) {
        const sibEnd = toDate(sib.end_date)
        const duration = Math.max(0, Math.floor((sibEnd.getTime() - sibStart.getTime()) / 86400000))
        const adjustedStart = boundary
        const adjustedEnd = addDays(adjustedStart, duration)
        db.prepare('UPDATE tasks SET start_date = ?, end_date = ?, updated_at = ? WHERE id = ?')
          .run(toStr(adjustedStart), toStr(adjustedEnd), ts, sib.id)
        boundary = addDays(adjustedEnd, 1)
      } else {
        break
      }
    }

    refreshParentDates(target.project_id)
  }

  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task
}

function refreshParentDates(projectId: string): void {
  const db = getSeisanDb()
  const ts = now()
  const parent = db.prepare(`
    SELECT id FROM tasks WHERE project_id = ? AND task_type = 'project' LIMIT 1
  `).get(projectId) as { id: string } | undefined
  if (!parent) return

  const range = db.prepare(`
    SELECT MIN(start_date) AS min_start, MAX(end_date) AS max_end
    FROM tasks WHERE project_id = ? AND task_type = 'task'
  `).get(projectId) as { min_start: string | null; max_end: string | null }

  if (range.min_start && range.max_end) {
    db.prepare('UPDATE tasks SET start_date = ?, end_date = ?, updated_at = ? WHERE id = ?')
      .run(range.min_start, range.max_end, ts, parent.id)
  }
}

export function updateSort(tasks: { id: string; sort_order: number }[]): void {
  const db = getSeisanDb()
  const ts = now()
  const stmt = db.prepare('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?')
  const transaction = db.transaction(() => {
    for (const t of tasks) {
      stmt.run(t.sort_order, ts, t.id)
    }
  })
  transaction()
}

export function updateStatus(id: string, status: string): Task {
  const db = getSeisanDb()
  const ts = now()
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, ts, id)
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task
}

/**
 * 工程タスクを削除する。親タスク（project）は削除不可。
 * 削除対象に依存している他タスクの depends_on_task_id は null に更新する。
 */
export function remove(id: string): void {
  const db = getSeisanDb()
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
  if (!task) {
    throw new Error('タスクが見つかりません')
  }
  if (task.task_type === 'project') {
    throw new Error('親タスク（案件行）は削除できません')
  }
  const ts = now()
  db.transaction(() => {
    db.prepare('UPDATE tasks SET depends_on_task_id = NULL, updated_at = ? WHERE depends_on_task_id = ?').run(ts, id)
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  })()
}

export function createTasksFromTemplates(projectId: string): Task[] {
  const db = getSeisanDb()
  const ts = now()

  // 既に子タスクが存在する場合はスキップ
  const existingCount = db.prepare(`
    SELECT COUNT(*) as n FROM tasks
    WHERE project_id = ? AND parent_task_id IS NOT NULL
  `).get(projectId) as { n: number }
  if (existingCount.n > 0) return []

  const templates = db.prepare(`
    SELECT id, name, default_days FROM process_templates
    WHERE is_active = 1 ORDER BY sort_order ASC
  `).all() as { id: string; name: string; default_days: number }[]

  if (templates.length === 0) return []

  // 親タスクを取得または作成
  let parentTask = db.prepare(`
    SELECT id FROM tasks WHERE project_id = ? AND task_type = 'project' LIMIT 1
  `).get(projectId) as { id: string } | undefined

  if (!parentTask) {
    const initTask = initProjectTask(projectId)
    parentTask = { id: initTask.id }
  }

  const parentId = parentTask.id
  const created: Task[] = []
  let currentStart = todayStr()

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i]
    const days = Math.max(1, Math.ceil(t.default_days))
    const startDate = new Date(currentStart + 'T00:00:00')
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + days - 1)
    const endDateStr = dateToStr(endDate)

    const id = generateId()
    db.prepare(`
      INSERT INTO tasks (
        id, project_id, parent_task_id, task_type,
        text, start_date, end_date,
        progress, status, sort_order,
        process_template_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'task', ?, ?, ?, 0, 'planned', ?, ?, ?, ?)
    `).run(id, projectId, parentId, t.name, currentStart, endDateStr, i, t.id, ts, ts)

    created.push(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task)
    currentStart = dateToStr(new Date(endDate.getTime() + 86400000))
  }

  return created
}

export function initProjectTask(projectId: string): Task {
  const db = getSeisanDb()
  const id = generateId()
  const ts = now()
  const project = db.prepare('SELECT project_no FROM projects WHERE id = ?').get(projectId) as {
    project_no: string | null
  } | undefined
  if (!project) throw new Error('案件が見つかりません')
  const text = project.project_no ?? '案件'
  const today = todayStr()
  db.prepare(`
    INSERT INTO tasks (
      id, project_id, parent_task_id, task_type,
      text, start_date, end_date,
      progress, status, sort_order,
      created_at, updated_at
    ) VALUES (?, ?, NULL, 'project', ?, ?, ?, 0, 'planned', 0, ?, ?)
  `).run(id, projectId, text, today, today, ts, ts)
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task
}

/** 納期から逆算して工程を作成（バックワードスケジューリング） */
export function createTasksFromDeadlineBackward(
  projectId: string,
  meetingDate?: string
): { success: boolean; created: Task[]; error?: string } {
  const db = getSeisanDb()
  const ts = now()
  const meeting = meetingDate ?? todayStr()

  const project = db.prepare('SELECT deadline FROM projects WHERE id = ?').get(projectId) as {
    deadline: string
  } | undefined
  if (!project?.deadline) {
    return { success: false, created: [], error: '案件の納期が設定されていません' }
  }
  const deadline = project.deadline

  const existingCount = db.prepare(`
    SELECT COUNT(*) as n FROM tasks
    WHERE project_id = ? AND parent_task_id IS NOT NULL
  `).get(projectId) as { n: number }
  if (existingCount.n > 0) {
    return { success: false, created: [], error: '既に工程が存在します。先に削除してください' }
  }

  const templates = db.prepare(`
    SELECT id, name, default_days FROM process_templates
    WHERE is_active = 1 ORDER BY sort_order ASC
  `).all() as { id: string; name: string; default_days: number }[]

  if (templates.length === 0) {
    return { success: false, created: [], error: '工程テンプレートがありません' }
  }

  const toDate = (s: string) => new Date(s + 'T00:00:00')
  const toStr = (d: Date) => dateToStr(d)
  const addDays = (d: Date, n: number) => {
    const x = new Date(d)
    x.setDate(x.getDate() + n)
    return x
  }

  const reversed = [...templates].reverse()
  let totalDays = 0
  const daysPerTemplate = reversed.map((t) => {
    const d = Math.max(1, Math.ceil(t.default_days))
    totalDays += d
    return d
  })

  const deadlineDate = toDate(deadline)
  const meetingDateObj = toDate(meeting)
  const availableDays = Math.floor(
    (deadlineDate.getTime() - meetingDateObj.getTime()) / 86400000
  )

  if (availableDays < 1) {
    return { success: false, created: [], error: '納期が会議日以前です' }
  }

  let scale = 1
  if (totalDays > availableDays) {
    scale = availableDays / totalDays
  }

  const ranges: { start: string; end: string }[] = []
  let currentEnd = deadlineDate

  for (let i = 0; i < reversed.length; i++) {
    const rawDays = daysPerTemplate[i]
    const days = Math.max(1, Math.round(rawDays * scale))
    const end = currentEnd
    const start = addDays(end, -(days - 1))
    ranges.unshift({
      start: toStr(start),
      end: toStr(end),
    })
    currentEnd = addDays(start, -1)
  }

  const firstStart = toDate(ranges[0].start)
  if (firstStart < meetingDateObj) {
    return {
      success: false,
      created: [],
      error: `日数が足りません。合計${totalDays}日が必要ですが、会議日〜納期は${availableDays}日です`,
    }
  }

  let parentTask = db.prepare(`
    SELECT id FROM tasks WHERE project_id = ? AND task_type = 'project' LIMIT 1
  `).get(projectId) as { id: string } | undefined

  if (!parentTask) {
    const initTask = initProjectTask(projectId)
    parentTask = { id: initTask.id }
  }

  const parentId = parentTask.id
  const projectNo = db.prepare('SELECT project_no FROM projects WHERE id = ?').get(projectId) as {
    project_no: string | null
  }
  const parentText = projectNo?.project_no ?? '案件'

  db.prepare(`
    UPDATE tasks SET start_date = ?, end_date = ?, text = ?, updated_at = ?
    WHERE id = ?
  `).run(ranges[0].start, deadline, parentText, ts, parentId)

  const created: Task[] = []
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i]
    const { start, end } = ranges[i]
    const id = generateId()
    db.prepare(`
      INSERT INTO tasks (
        id, project_id, parent_task_id, task_type,
        text, start_date, end_date,
        progress, status, sort_order,
        process_template_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'task', ?, ?, ?, 0, 'planned', ?, ?, ?, ?)
    `).run(id, projectId, parentId, t.name, start, end, i, t.id, ts, ts)
    created.push(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task)
  }

  return { success: true, created }
}

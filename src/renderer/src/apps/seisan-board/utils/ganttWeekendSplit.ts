import type { ITask } from '@svar-ui/react-gantt'

const SEG_ID_SUFFIX = '__seg_'

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

/**
 * 開始〜終了の範囲を土日を除いた稼働日セグメントに分割する
 * 例: 金〜月 → [金], [月]
 */
export function getWorkingDaySegments(start: Date, end: Date): { start: Date; end: Date }[] {
  const segments: { start: Date; end: Date }[] = []
  let cur = startOfDay(start)
  const endD = startOfDay(end)

  while (cur <= endD) {
    if (isWeekend(cur)) {
      cur = addDays(cur, 1)
      continue
    }
    const segStart = new Date(cur)
    let segEnd = new Date(cur)
    while (cur <= endD) {
      if (isWeekend(cur)) break
      segEnd = new Date(cur)
      cur = addDays(cur, 1)
    }
    segments.push({ start: segStart, end: segEnd })
    cur = addDays(cur, 1)
  }
  return segments
}

/**
 * セグメントIDから元のタスクIDを取得
 * "abc123__seg_0" → "abc123"
 */
export function getOriginalTaskId(segmentId: string): string {
  const idx = segmentId.indexOf(SEG_ID_SUFFIX)
  return idx >= 0 ? segmentId.slice(0, idx) : segmentId
}

/**
 * タスクが土日をまたぐか
 */
function spansWeekend(start: Date, end: Date): boolean {
  let cur = startOfDay(start)
  const endD = startOfDay(end)
  while (cur <= endD) {
    if (isWeekend(cur)) return true
    cur = addDays(cur, 1)
  }
  return false
}

/**
 * タスクを土日で分割する。project・milestoneは分割しない。
 * 分割時は id に __seg_0, __seg_1 を付与する。
 */
export function splitTaskByWeekends(task: ITask): ITask[] {
  if (task.type === 'milestone') {
    return [task]
  }
  if (!task.start || !task.end) {
    return [task]
  }
  const start = task.start instanceof Date ? task.start : new Date(task.start)
  const end = task.end instanceof Date ? task.end : new Date(task.end)
  if (!spansWeekend(start, end)) {
    return [task]
  }
  const segments = getWorkingDaySegments(start, end)
  if (segments.length <= 1) return [task]

  return segments.map((seg, i) => ({
    ...task,
    id: `${task.id}${SEG_ID_SUFFIX}${i}`,
    start: seg.start,
    end: seg.end,
    text: i === 0 ? (task.text ?? '') : `${task.text ?? ''}（続き）`,
  }))
}

/**
 * 1行表示を維持したまま、土日でバーだけ分割するためのsegmentsを付与する。
 * SVAR Gantt の splitTasks + segments を利用する。
 */
export function segmentTaskByWeekends(task: ITask): ITask {
  if (task.type === 'milestone') return task
  if (!task.start || !task.end) return task

  const start = task.start instanceof Date ? task.start : new Date(task.start)
  const end = task.end instanceof Date ? task.end : new Date(task.end)
  const segments = getWorkingDaySegments(start, end)

  if (segments.length <= 1) {
    return { ...task, segments: undefined }
  }

  return {
    ...task,
    start: segments[0].start,
    end: segments[segments.length - 1].end,
    segments: segments.map((seg, i) => ({
      id: `${task.id}${SEG_ID_SUFFIX}${i}`,
      start: seg.start,
      end: seg.end,
      text: task.text,
    })),
  }
}

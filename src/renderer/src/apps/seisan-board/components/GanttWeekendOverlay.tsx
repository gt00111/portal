import { useEffect } from 'react'
import type { Task } from 'gantt-task-react'
import { ViewMode } from 'gantt-task-react'

const COLUMN_WIDTH = 65
const PRE_STEPS_COUNT = 1

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getDatesForDayView(tasks: Task[]): Date[] {
  if (tasks.length === 0) return []
  let start = tasks[0].start
  let end = tasks[0].end
  for (const t of tasks) {
    if (t.start < start) start = t.start
    if (t.end > end) end = t.end
  }
  start = startOfDay(start)
  start = addDays(start, -PRE_STEPS_COUNT)
  end = startOfDay(end)
  end = addDays(end, 19)
  const dates: Date[] = []
  let cur = new Date(start)
  while (cur < end) {
    dates.push(new Date(cur))
    cur = addDays(cur, 1)
  }
  return dates
}

const WEEKEND_GRID_COLOR = '#ffd6d6'
const WEEKEND_TEXT_COLOR = '#d32f2f'

/**
 * ガントチャートのグリッドに土日列の薄赤背景を注入し、
 * カレンダーヘッダーの土日テキストを赤くする
 */
export function useGanttWeekendOverlay(
  tasks: Task[],
  viewMode: ViewMode,
  containerRef: React.RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (viewMode !== ViewMode.Day) return
    const dates = getDatesForDayView(tasks)
    if (dates.length === 0) return

    const root = containerRef?.current ?? document
    const getElements = (sel: string) =>
      root === document
        ? document.querySelectorAll(sel)
        : (root as HTMLElement).querySelectorAll(sel)

    const applyWeekendStyles = () => {
      const gridBodies = getElements('.gridBody')
      gridBodies.forEach((gridBody) => {
        const existing = gridBody.querySelector('.gantt-weekend-columns')
        if (existing) existing.remove()

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        g.setAttribute('class', 'gantt-weekend-columns')

        const rowHeight = 40
        const rowCount = tasks.length
        const totalHeight = Math.max(rowHeight * rowCount, 1)

        let x = 0
        for (let i = 0; i < dates.length; i++) {
          const d = dates[i]
          const day = d.getDay()
          if (day === 0 || day === 6) {
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
            rect.setAttribute('x', String(x))
            rect.setAttribute('y', '0')
            rect.setAttribute('width', String(COLUMN_WIDTH))
            rect.setAttribute('height', String(totalHeight))
            rect.setAttribute('fill', WEEKEND_GRID_COLOR)
            rect.setAttribute('pointer-events', 'none')
            g.appendChild(rect)
          }
          x += COLUMN_WIDTH
        }

        gridBody.appendChild(g)
      })

      const allTexts = getElements('svg text')
      allTexts.forEach((el) => {
        const text = (el.textContent ?? '').trim()
        if (text.startsWith('土,') || text.startsWith('日,')) {
          ;(el as SVGTextElement).style.fill = WEEKEND_TEXT_COLOR
          ;(el as SVGTextElement).style.fontWeight = '600'
        }
      })
    }

    applyWeekendStyles()
    const rafId = window.requestAnimationFrame(() => applyWeekendStyles())

    return () => {
      window.cancelAnimationFrame(rafId)
      const r = containerRef?.current ?? document
      const bodies = r === document ? document.querySelectorAll('.gridBody') : (r as HTMLElement).querySelectorAll('.gridBody')
      bodies.forEach((el) => {
        const existing = el.querySelector('.gantt-weekend-columns')
        if (existing) existing.remove()
      })
    }
  }, [tasks, viewMode, containerRef])
}

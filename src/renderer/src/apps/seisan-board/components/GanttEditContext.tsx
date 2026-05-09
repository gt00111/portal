import { createContext, useContext } from 'react'
import type { Task } from 'gantt-task-react'

export interface GanttEditContextValue {
  onDateChange: (task: Task) => void | Promise<void>
  onDelete?: (task: Task) => void | Promise<boolean>
}

export const GanttEditContext = createContext<GanttEditContextValue | null>(null)

export function useGanttEdit() {
  const ctx = useContext(GanttEditContext)
  return ctx
}

import { useState, useCallback } from 'react'
import type { Task } from 'gantt-task-react'
import { DayPicker } from 'react-day-picker'
import { Trash2 } from 'lucide-react'
import { ja } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import { Input } from './ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { useGanttEdit } from './GanttEditContext'

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

/** グラフの枠数に合わせた期間（終了日を含めない） */
function calcDurationDays(start: Date, end: Date): number {
  const diff = Math.floor((end.getTime() - start.getTime()) / 86400000)
  return Math.max(1, diff)
}

function EditableDateCell({
  task,
  value,
  rawValue,
  field,
  editing,
  onEdit,
  onSave,
  canEdit,
}: {
  task: Task
  value: string
  rawValue: string
  field: EditField
  editing: { taskId: string; field: EditField; value: string } | null
  onEdit: (v: { taskId: string; field: EditField; value: string } | null) => void
  onSave: (task: Task, value: string) => void
  canEdit: boolean
}) {
  const isEditing = editing?.taskId === task.id && editing?.field === field
  const fallbackDate = field === 'start' ? task.start : task.end
  const selectedDate = isEditing
    ? (() => {
        const [y, m, d] = editing.value.split('-').map(Number)
        if (y && m && d) {
          const d2 = new Date(y, m - 1, d)
          if (!isNaN(d2.getTime())) return d2
        }
        return fallbackDate
      })()
    : fallbackDate

  if (!canEdit) {
    return (
      <div
        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap border-r border-[#c4c4c4] px-1 text-xs"
        title={value}
      >
        {value}
      </div>
    )
  }

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (open) onEdit({ taskId: task.id, field, value: rawValue })
        else onEdit(null)
      }}
    >
      <PopoverTrigger asChild>
        <div
          className="min-w-0 flex-1 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap border-r border-[#c4c4c4] px-1 text-xs hover:bg-muted/50"
          title={value}
          onClick={(e) => e.stopPropagation()}
        >
          {value}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        side="bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <DayPicker
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (date) {
              const str = toDateStr(date)
              onSave(task, str)
              onEdit(null)
            }
          }}
          defaultMonth={selectedDate}
          locale={ja}
        />
      </PopoverContent>
    </Popover>
  )
}

function EditableDurationCell({
  task,
  duration,
  editing,
  onEdit,
  onSave,
  canEdit,
}: {
  task: Task
  duration: number
  editing: { taskId: string; field: EditField; value: string } | null
  onEdit: (v: { taskId: string; field: EditField; value: string } | null) => void
  onSave: (task: Task, value: string) => void
  canEdit: boolean
}) {
  const isEditing = editing?.taskId === task.id && editing?.field === 'duration'

  if (isEditing) {
    const editValue = editing.value
    return (
      <div
        className="flex w-12 shrink-0 items-center px-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          type="number"
          min={1}
          className="h-7 w-14 text-right text-xs"
          value={editValue}
          onChange={(e) => onEdit({ ...editing, value: e.target.value })}
          autoFocus
          onBlur={() => {
            if (editValue) onSave(task, editValue)
            onEdit(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (editValue) onSave(task, editValue)
              onEdit(null)
            }
            if (e.key === 'Escape') onEdit(null)
          }}
        />
        <span className="ml-0.5 text-xs">日</span>
      </div>
    )
  }

  return (
    <div
      className={`w-12 shrink-0 px-1 text-right text-xs ${canEdit ? 'cursor-pointer hover:bg-muted/50' : ''}`}
      title={`${duration}日`}
      onClick={(e) => {
        e.stopPropagation()
        if (canEdit) onEdit({ taskId: task.id, field: 'duration', value: String(duration) })
      }}
    >
      {duration}日
    </div>
  )
}

/** 工程名・開始日・終了日・期間カラム用のカスタムヘッダー */
export function GanttTaskListHeader({
  headerHeight,
  rowWidth,
  fontFamily,
  fontSize,
}: {
  headerHeight: number
  rowWidth: string
  fontFamily: string
  fontSize: string
}) {
  return (
    <div
      className="flex border-b border-l border-[#e6e4e4]"
      style={{ fontFamily, fontSize, width: rowWidth }}
    >
      <div
        className="flex flex-[2] items-center border-r border-[#c4c4c4] px-1"
        style={{ height: headerHeight - 2 }}
      >
        工程名
      </div>
      <div
        className="flex flex-1 items-center border-r border-[#c4c4c4] px-1"
        style={{ height: headerHeight - 2 }}
      >
        開始日
      </div>
      <div
        className="flex flex-1 items-center border-r border-[#c4c4c4] px-1"
        style={{ height: headerHeight - 2 }}
      >
        終了日
      </div>
      <div
        className="flex w-12 shrink-0 items-center px-1"
        style={{ height: headerHeight - 2 }}
      >
        期間
      </div>
      <div
        className="flex w-8 shrink-0 items-center justify-center px-0.5"
        style={{ height: headerHeight - 2 }}
      />
    </div>
  )
}

type EditField = 'start' | 'end' | 'duration'

/** 工程名・開始日・終了日・期間カラム用のカスタムテーブル（工程名を折りたたみ式に） */
export function GanttTaskListTable({
  rowHeight,
  rowWidth,
  tasks,
  fontFamily,
  fontSize,
  locale,
  onExpanderClick,
}: {
  rowHeight: number
  rowWidth: string
  tasks: Task[]
  fontFamily: string
  fontSize: string
  locale: string
  selectedTaskId: string
  setSelectedTask: (taskId: string) => void
  onExpanderClick: (task: Task) => void
}) {
  const editCtx = useGanttEdit()
  const [editing, setEditing] = useState<{ taskId: string; field: EditField; value: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = useCallback(
    async (t: Task, e: React.MouseEvent) => {
      e.stopPropagation()
      if (t.type === 'project') return
      if (!editCtx?.onDelete) return
      if (deleting) return
      setDeleting(true)
      try {
        await editCtx.onDelete(t)
      } finally {
        setDeleting(false)
      }
    },
    [editCtx, deleting]
  )

  const handleSave = useCallback(
    async (task: Task, startStr: string, endStr: string) => {
      setEditing(null)
      const updated: Task = {
        ...task,
        start: new Date(startStr + 'T00:00:00'),
        end: new Date(endStr + 'T23:59:59'),
      }
      await editCtx?.onDateChange(updated)
    },
    [editCtx]
  )

  const handleEditStart = useCallback(
    (t: Task, value: string) => {
      const endStr = toDateStr(t.end)
      handleSave(t, value, endStr)
    },
    [handleSave]
  )

  const handleEditEnd = useCallback(
    (t: Task, value: string) => {
      const startStr = toDateStr(t.start)
      handleSave(t, startStr, value)
    },
    [handleSave]
  )

  const handleEditDuration = useCallback(
    (t: Task, value: string) => {
      const days = parseInt(value, 10)
      if (isNaN(days) || days < 1) return
      const start = t.start
      const end = new Date(start)
      end.setDate(end.getDate() + days)
      handleSave(t, toDateStr(start), toDateStr(end))
    },
    [handleSave]
  )

  return (
    <div
      className="border-b border-l border-[#e6e4e4]"
      style={{ fontFamily, fontSize, width: rowWidth }}
    >
      {tasks.map((t) => {
        const isProject = t.type === 'project'
        const expanderSymbol =
          isProject && t.hideChildren === false
            ? '▼'
            : isProject && t.hideChildren === true
              ? '▶'
              : ''
        const processName = t.name
        const startStr = formatDate(t.start, locale)
        const endStr = formatDate(t.end, locale)
        const duration = calcDurationDays(t.start, t.end)

        return (
          <div
            key={t.id + 'row'}
            className="flex border-b border-[#e6e4e4] even:bg-[#f5f5f5]"
            style={{ height: rowHeight }}
          >
            <div className="flex min-w-0 flex-[2] items-center overflow-hidden text-ellipsis whitespace-nowrap border-r border-[#c4c4c4] px-1">
              <div
                className={
                  expanderSymbol
                    ? 'cursor-pointer shrink-0 select-none px-0.5 text-[0.6rem] text-[#565656]'
                    : 'shrink-0 select-none pl-4 text-[0.6rem]'
                }
                onClick={() => expanderSymbol && onExpanderClick(t)}
              >
                {expanderSymbol}
              </div>
              <div className="min-w-0 flex-1 overflow-hidden text-ellipsis" title={processName}>
                {processName}
              </div>
            </div>
            <EditableDateCell
              task={t}
              value={startStr}
              rawValue={toDateStr(t.start)}
              field="start"
              editing={editing}
              onEdit={setEditing}
              onSave={handleEditStart}
              canEdit={!!editCtx}
            />
            <EditableDateCell
              task={t}
              value={endStr}
              rawValue={toDateStr(t.end)}
              field="end"
              editing={editing}
              onEdit={setEditing}
              onSave={handleEditEnd}
              canEdit={!!editCtx}
            />
            <EditableDurationCell
              task={t}
              duration={duration}
              editing={editing}
              onEdit={setEditing}
              onSave={handleEditDuration}
              canEdit={!!editCtx}
            />
            <div
              className="flex w-8 shrink-0 items-center justify-center px-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              {!isProject && editCtx?.onDelete && (
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-50"
                  title="工程を削除"
                  onClick={(e) => handleDelete(t, e)}
                  disabled={deleting}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Button } from './ui/button'
import { CalendarRange, Plus } from 'lucide-react'
import { showToast } from './Toaster'
import { TaskFormDialog } from './TaskFormDialog'
import { useAuth } from '../contexts/AuthContext'
import MyCustomGantt from './MyCustomGantt'
import type { Task as DbTask, ProcessTemplate, ProjectStatus } from 'shared'

interface ProjectGanttProps {
  projectId: string
  projectStatus: ProjectStatus
  projectNo?: string
  parentRowName?: string
  parentBarLabel?: string
  parentGroupName?: string | null
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseTaskDate(str: string | null | undefined, fallback: Date): Date {
  if (!str || typeof str !== 'string') return fallback
  const d = new Date(str + 'T00:00:00')
  return isNaN(d.getTime()) ? fallback : d
}

function getParentColorByGroup(groupName: string | null | undefined): string | undefined {
  if (groupName === 'キャビンG') return '#ca8a04'
  if (groupName === 'デッキG') return '#dc2626'
  return undefined
}

function taskToCustomFormat(
  t: DbTask,
  templateColorMap: Map<string, string>,
  parentRowName?: string,
  parentBarLabel?: string,
  parentGroupName?: string | null
) {
  const today = new Date()
  const start = parseTaskDate(t.start_date, today)
  const end = parseTaskDate(t.end_date, today)
  const endSafe = end.getTime() >= start.getTime() ? end : new Date(start.getTime() + 86400000)
  return {
    id: t.id,
    text: t.task_type === 'project' ? parentRowName ?? t.text : t.text,
    barLabel: t.task_type === 'project' ? parentBarLabel ?? parentRowName ?? t.text : undefined,
    start,
    end: endSafe,
    type: t.task_type,
    color:
      t.task_type === 'project'
        ? getParentColorByGroup(parentGroupName)
        : t.process_template_id
          ? templateColorMap.get(t.process_template_id)
          : undefined,
  }
}

export function ProjectGantt({
  projectId,
  projectStatus,
  parentRowName,
  parentBarLabel,
  parentGroupName,
}: ProjectGanttProps) {
  const { canEdit } = useAuth()
  const [tasks, setTasks] = useState<DbTask[]>([])
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [formParentId, setFormParentId] = useState<string>('')
  const [includeDone, setIncludeDone] = useState(false)
  const sortSaving = useRef(false)

  const approvedOrAbove = ['approved', 'in_planning', 'in_progress', 'done'].includes(projectStatus)

  const fetchTasks = useCallback(async () => {
    if (!window.api) return
    const res = await window.api.tasks.listByProject(projectId, includeDone)
    if (res.success && res.data) setTasks(res.data)
    setLoading(false)
  }, [projectId, includeDone])

  useEffect(() => {
    if (approvedOrAbove && window.api) {
      fetchTasks()
      window.api.processTemplates?.list?.(true).then((res) => {
        if (res.success && res.data) setTemplates(res.data)
      })
    } else {
      setLoading(false)
    }
  }, [approvedOrAbove, fetchTasks])

  useEffect(() => {
    const onRefresh = () => approvedOrAbove && fetchTasks()
    window.addEventListener('seisan:refresh', onRefresh)
    return () => window.removeEventListener('seisan:refresh', onRefresh)
  }, [approvedOrAbove, fetchTasks])

  const templateColorMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of templates) {
      if (t.color) m.set(t.id, t.color)
    }
    return m
  }, [templates])

  const parentTask = tasks.find((t) => t.task_type === 'project')

  const ganttTasks = useMemo(() => {
    return tasks
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((t) =>
        taskToCustomFormat(t, templateColorMap, parentRowName, parentBarLabel, parentGroupName)
      )
  }, [tasks, templateColorMap, parentRowName, parentBarLabel, parentGroupName])

  if (!approvedOrAbove) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-dashed p-12 text-muted-foreground">
        承認後に工程作成が可能です
      </div>
    )
  }

  if (loading) {
    return <div className="flex min-h-[300px] items-center justify-center p-8">読み込み中...</div>
  }

  const handleAddTask = async () => {
    let parentId = parentTask?.id
    if (!parentId) {
      const res = await window.api?.tasks.initProjectTask(projectId)
      if (res?.success && res.data) {
        parentId = res.data.id
        await fetchTasks()
      }
    }
    if (parentId) {
      setFormParentId(parentId)
      setFormOpen(true)
    }
  }

  const handleTaskCreated = () => {
    setFormOpen(false)
    fetchTasks()
  }

  const childTasks = tasks.filter((t) => t.task_type !== 'project')
  const canCreateFromDeadline = childTasks.length === 0

  const handleCreateFromDeadline = async () => {
    if (!window.api?.tasks?.createFromDeadline) return
    const meetingDate = new Date().toISOString().slice(0, 10)
    const res = await window.api.tasks.createFromDeadline(projectId, meetingDate)
    if (res.success) {
      fetchTasks()
      window.dispatchEvent(new Event('seisan:refresh'))
    } else {
      showToast(res.error ?? 'スケジュールの作成に失敗しました')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeDone}
            onChange={(e) => setIncludeDone(e.target.checked)}
          />
          <span className="text-sm">完了工程を含む</span>
        </label>
        {canEdit && (
          <div className="flex gap-2">
            {canCreateFromDeadline && (
              <Button variant="outline" onClick={handleCreateFromDeadline}>
                <CalendarRange className="mr-2 h-4 w-4" />
                納期からスケジュール作成
              </Button>
            )}
            <Button onClick={handleAddTask}>
              <Plus className="mr-2 h-4 w-4" />
              工程追加
            </Button>
          </div>
        )}
      </div>

      {ganttTasks.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <p className="mb-4 text-muted-foreground">工程がありません</p>
          {canEdit && (
            <div className="flex flex-wrap justify-center gap-2">
              {canCreateFromDeadline && (
                <Button variant="outline" onClick={handleCreateFromDeadline}>
                  <CalendarRange className="mr-2 h-4 w-4" />
                  納期からスケジュール作成
                </Button>
              )}
              <Button onClick={handleAddTask}>
                <Plus className="mr-2 h-4 w-4" />
                工程を追加
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="h-[500px] overflow-hidden rounded-lg border">
          <MyCustomGantt
            tasks={ganttTasks}
            readOnly={!canEdit}
            onTaskDateChange={async (taskId: string, start: Date, end: Date) => {
              if (!canEdit) {
                showToast('権限がありません。編集者以上の権限が必要です。', 'error')
                return
              }
              if (!window.api?.tasks?.updateDates) return
              await window.api.tasks.updateDates(taskId, toDateStr(start), toDateStr(end))
              await fetchTasks()
            }}
            onTaskDelete={async (taskId: string) => {
              if (!canEdit) {
                showToast('権限がありません。編集者以上の権限が必要です。', 'error')
                return
              }
              if (!window.api?.tasks?.delete) return
              const hit = tasks.find((t) => t.id === taskId)
              if (hit?.task_type === 'project') return
              const res = await window.api.tasks.delete(taskId)
              if (!res.success) {
                showToast(res.error ?? '削除に失敗しました')
                return
              }
              showToast('工程を削除しました')
              await fetchTasks()
            }}
            canDeleteTask={(task: { id: string }) => {
              if (!canEdit) return false
              const hit = tasks.find((t) => t.id === task.id)
              return hit?.task_type !== 'project'
            }}
            onChildOrderChange={async (orderedChildIds: string[]) => {
              if (!canEdit) {
                showToast('権限がありません。編集者以上の権限が必要です。', 'error')
                return
              }
              if (!window.api?.tasks?.updateSort || sortSaving.current) return
              sortSaving.current = true

              const parent = tasks.find((t) => t.task_type === 'project')
              const childById = new Map(
                tasks.filter((t) => t.task_type !== 'project').map((t) => [t.id, t])
              )
              const orderedChildren = orderedChildIds
                .map((id) => childById.get(id))
                .filter(Boolean) as DbTask[]
              const remainingChildren = tasks.filter(
                (t) => t.task_type !== 'project' && !orderedChildIds.includes(t.id)
              )
              const reordered = parent
                ? [parent, ...orderedChildren, ...remainingChildren]
                : [...orderedChildren, ...remainingChildren]
              const updates = reordered.map((t, idx) => ({ id: t.id, sort_order: idx }))

              // 先にUI反映し、保存失敗時に再取得で巻き戻す
              setTasks((prev) => {
                const orderMap = new Map(updates.map((u) => [u.id, u.sort_order]))
                return prev
                  .map((t) => ({
                    ...t,
                    sort_order: orderMap.get(t.id) ?? t.sort_order,
                  }))
                  .sort((a, b) => a.sort_order - b.sort_order)
              })

              try {
                const res = await window.api.tasks.updateSort(updates)
                if (!res.success) {
                  showToast(res.error ?? '並び順の保存に失敗しました')
                  await fetchTasks()
                }
              } finally {
                sortSaving.current = false
              }
            }}
          />
        </div>
      )}

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        projectId={projectId}
        parentTaskId={formParentId}
        onCreated={handleTaskCreated}
      />
    </div>
  )
}

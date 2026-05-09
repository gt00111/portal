import { useEffect, useState, useMemo, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { Printer, Search } from 'lucide-react'
import { showToast } from '../components/Toaster'
import { useAuth } from '../contexts/AuthContext'
import MyCustomGantt from '../components/MyCustomGantt'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { Input } from '../components/ui/input'
import type { ProcessTemplate, TaskWithProject } from 'shared'

function parseDate(str: string | null | undefined, fallback: Date): Date {
  if (!str || typeof str !== 'string') return fallback
  const d = new Date(str + 'T00:00:00')
  return isNaN(d.getTime()) ? fallback : d
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getParentColorByGroup(groupName: string | null | undefined): string | undefined {
  if (groupName === 'キャビンG') return '#ca8a04'
  if (groupName === 'デッキG') return '#dc2626'
  return undefined
}

/** 全案件の工程を案件ごとの親子構造に整形 */
function buildFlatGanttTasks(tasks: TaskWithProject[], templateColorMap: Map<string, string>) {
  const byProject = new Map<string, TaskWithProject[]>()
  for (const t of tasks) {
    const list = byProject.get(t.project_id) ?? []
    list.push(t)
    byProject.set(t.project_id, list)
  }

  const today = new Date()
  const result: {
    id: string
    text: string
    start: Date
    end: Date
    type: string
    color?: string
    parentId?: string
    barLabel?: string
    projectName?: string | null
    modelType?: string | null
    partNumber?: string | null
    unitNumber?: string | null
    linkTo?: string
  }[] = []
  for (const [, projectTasks] of byProject) {
    const sorted = [...projectTasks].sort((a, b) => a.sort_order - b.sort_order)
    const projectName = `${sorted[0].project_no ?? '案件'} - ${sorted[0].company_name}`
    const projectRow = sorted.find((t) => t.task_type === 'project')
    const children = sorted.filter((t) => t.task_type !== 'project')
    if (children.length === 0) continue

    let parentId = projectRow?.id ?? `__overview_parent__${sorted[0].project_id}`
    let parentStart = parseDate(projectRow?.start_date, parseDate(children[0].start_date, today))
    let parentEnd = parseDate(projectRow?.end_date, parseDate(children[children.length - 1].end_date, today))

    for (const c of children) {
      const s = parseDate(c.start_date, today)
      const e = parseDate(c.end_date, today)
      if (s < parentStart) parentStart = s
      if (e > parentEnd) parentEnd = e
    }
    if (parentEnd < parentStart) parentEnd = parentStart

    result.push({
      id: parentId,
      text: projectName,
      barLabel: sorted[0].part_number ?? sorted[0].project_no ?? '案件',
      start: parentStart,
      end: parentEnd,
      type: 'project',
      color: getParentColorByGroup(sorted[0].group_name),
      projectName: sorted[0].project_name,
      modelType: sorted[0].model_type,
      partNumber: sorted[0].part_number,
      unitNumber: sorted[0].unit_number,
      linkTo: `/projects/${sorted[0].project_id}`,
    })

    for (const t of children) {
      const start = parseDate(t.start_date, today)
      const end = parseDate(t.end_date, today)
      const endSafe = end.getTime() >= start.getTime() ? end : new Date(start.getTime() + 86400000)
      result.push({
        id: t.id,
        text: t.text,
        start,
        end: endSafe,
        type: t.task_type === 'milestone' ? 'milestone' : 'task',
        color: t.process_template_id ? templateColorMap.get(t.process_template_id) : undefined,
        parentId,
        projectName: t.project_name,
        modelType: t.model_type,
        partNumber: t.part_number,
        unitNumber: t.unit_number,
        linkTo: `/projects/${t.project_id}`,
      })
    }
  }
  return result
}

export function GanttOverviewPage() {
  const { canEdit } = useAuth()
  const [tasks, setTasks] = useState<TaskWithProject[]>([])
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [groupOptions, setGroupOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [includeDone, setIncludeDone] = useState(false)
  const [groupFilterId, setGroupFilterId] = useState<string | undefined>(undefined)
  const [isPrinting, setIsPrinting] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [printFrom, setPrintFrom] = useState('')
  const [printTo, setPrintTo] = useState('')
  const [printError, setPrintError] = useState<string | null>(null)
  const [printRange, setPrintRange] = useState<{ start: string; end: string } | null>(null)
  const [pendingPrint, setPendingPrint] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const fetchTasks = useCallback(async () => {
    if (!window.api) return
    const res = await window.api.tasks.listAll({
      include_done: includeDone,
      group_id: groupFilterId,
    })
    if (res.success && res.data) setTasks(res.data)
    setLoading(false)
  }, [includeDone, groupFilterId])

  useEffect(() => {
    fetchTasks()
    window.api?.processTemplates?.list?.(true).then((res) => {
      if (res.success && res.data) setTemplates(res.data)
    })
    window.api?.masterData?.distinctGroups?.().then((res) => {
      if (res.success && res.data) setGroupOptions(res.data)
    })
  }, [fetchTasks])

  useEffect(() => {
    const onRefresh = () => fetchTasks()
    window.addEventListener('seisan:refresh', onRefresh)
    return () => window.removeEventListener('seisan:refresh', onRefresh)
  }, [fetchTasks])

  useEffect(() => {
    const onBeforePrint = () => setIsPrinting(true)
    const onAfterPrint = () => {
      setIsPrinting(false)
      setPendingPrint(false)
      document.body.classList.remove('print-gantt')
    }
    window.addEventListener('beforeprint', onBeforePrint)
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [])

  const templateColorMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of templates) {
      if (t.color) m.set(t.id, t.color)
    }
    return m
  }, [templates])

  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks
    const q = searchQuery.trim().toLowerCase()
    const matchingProjectIds = new Set<string>()
    for (const t of tasks) {
      const haystack = [
        t.project_no,
        t.company_name,
        t.part_number,
        t.project_name,
        t.model_type,
        t.unit_number,
        t.text,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (haystack.includes(q)) matchingProjectIds.add(t.project_id)
    }
    return tasks.filter((t) => matchingProjectIds.has(t.project_id))
  }, [tasks, searchQuery])

  const ganttTasks = useMemo(() => buildFlatGanttTasks(filteredTasks, templateColorMap), [filteredTasks, templateColorMap])

  const allRange = useMemo(() => {
    if (ganttTasks.length === 0) return null
    const min = ganttTasks.reduce((a, b) => (a.start < b.start ? a : b)).start
    const max = ganttTasks.reduce((a, b) => (a.end > b.end ? a : b)).end
    return {
      start: toDateStr(min),
      end: toDateStr(max),
    }
  }, [ganttTasks])

  const openPrintDialog = () => {
    if (!allRange) return
    setPrintFrom(allRange.start)
    setPrintTo(allRange.end)
    setPrintError(null)
    setPrintDialogOpen(true)
  }

  const handlePrint = () => {
    if (!printFrom || !printTo) {
      setPrintError('開始日と終了日を指定してください')
      return
    }
    if (printTo < printFrom) {
      setPrintError('終了日は開始日以降を指定してください')
      return
    }
    flushSync(() => {
      setPrintRange({ start: printFrom, end: printTo })
      setPrintDialogOpen(false)
      setPrintError(null)
      setPendingPrint(true)
    })
  }

  useEffect(() => {
    if (!pendingPrint || printDialogOpen) return
    // Dialog のクローズアニメーションと Portal のアンマウント待ち
    const timer = setTimeout(() => {
      flushSync(() => {
        setIsPrinting(true)
      })
      document.body.classList.add('print-gantt')
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.print()
        })
      })
    }, 280)
    return () => clearTimeout(timer)
  }, [pendingPrint, printDialogOpen])

  if (loading) {
    return <div className="flex min-h-[300px] items-center justify-center p-8">読み込み中...</div>
  }

  return (
    <div className="gantt-overview-page space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 print:gap-2">
        <h1 className="text-2xl font-bold">全案件の工程スケジュール</h1>
        <div className="print-hide flex flex-wrap items-center gap-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="案件番号・客先・図面番号(品番)で検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-[240px] pl-8"
            />
          </div>
          
          <Select
            value={groupFilterId ?? '__all__'}
            onValueChange={(v) => setGroupFilterId(v === '__all__' ? undefined : v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="グループ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">すべてのグループ</SelectItem>
              {groupOptions.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" onClick={openPrintDialog}>
            <Printer className="mr-2 h-4 w-4" />
            印刷（A3横）
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeDone}
              onChange={(e) => setIncludeDone(e.target.checked)}
            />
            完了工程を含む
          </label>
        </div>
      </div>
      <p className="print-hide text-sm text-muted-foreground">
        各案件の作業工程と納期を一覧表示。いつまでに終わらせ次工程に回すか確認できます。グループで絞り込めます。
      </p>
      {isPrinting ? (
        <p className="hidden text-xs text-slate-600 print:block">
          出力日時: {new Date().toLocaleString('ja-JP')} / グループ: {groupFilterId ?? 'すべて'}
        </p>
      ) : null}
      <div className={`rounded-lg border ${isPrinting ? 'overflow-visible' : 'h-[calc(100vh-220px)]'}`}>
        {ganttTasks.length === 0 ? (
          <div className="flex h-full min-h-[300px] items-center justify-center text-muted-foreground">
            工程がありません。案件詳細で工程を追加してください。
          </div>
        ) : (
          <MyCustomGantt
            tasks={ganttTasks}
            readOnly={!canEdit}
            collapseScheduleColumnsByDefault
            showProjectMetaColumns
            printMode={isPrinting}
            maxVisibleDays={isPrinting ? 2000 : 420}
            printTimeScale="day"
            forceViewStart={isPrinting ? printRange?.start : undefined}
            forceViewEnd={isPrinting ? printRange?.end : undefined}
            onTaskDateChange={async (taskId: string, start: Date, end: Date) => {
              if (!canEdit) {
                showToast('権限がありません。編集者以上の権限が必要です。', 'error')
                return
              }
              if (taskId.startsWith('__overview_parent__')) return
              if (!window.api?.tasks?.updateDates) return
              await window.api.tasks.updateDates(taskId, toDateStr(start), toDateStr(end))
              await fetchTasks()
            }}
            onTaskDelete={async (taskId: string) => {
              if (!canEdit) {
                showToast('権限がありません。編集者以上の権限が必要です。', 'error')
                return
              }
              if (taskId.startsWith('__overview_parent__')) return
              if (!window.api?.tasks?.delete) return
              const res = await window.api.tasks.delete(taskId)
              if (!res.success) {
                showToast(res.error ?? '削除に失敗しました')
                return
              }
              await fetchTasks()
            }}
            canDeleteTask={(task: { type?: string; id: string }) =>
              canEdit && task.type !== 'project' && !task.id.startsWith('__overview_parent__')
            }
          />
        )}
      </div>
      {!isPrinting && !pendingPrint ? (
        <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>印刷期間を指定</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>開始日</Label>
                <Input type="date" value={printFrom} onChange={(e) => setPrintFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>終了日</Label>
                <Input type="date" value={printTo} onChange={(e) => setPrintTo(e.target.value)} />
              </div>
            </div>
            {printError ? <p className="text-sm text-destructive">{printError}</p> : null}
            <p className="text-xs text-muted-foreground">
              A3横向きで日単位カラムを印刷します。期間を絞ると見やすくなります。
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPrintDialogOpen(false)}>
                キャンセル
              </Button>
              <Button type="button" onClick={handlePrint}>
                印刷
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

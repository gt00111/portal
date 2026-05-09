import { useMemo, useState } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import type { ProjectWithRelations } from 'shared'

interface ProjectTableProps {
  projects: ProjectWithRelations[]
  onRowClick: (project: ProjectWithRelations) => void
}

type SortKey = 'project_no' | 'company_name' | 'unit_number' | 'deadline' | 'status' | 'group_name'
type SortDir = 'asc' | 'desc'

const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  submitted: 1,
  approved: 2,
  in_progress: 3,
  done: 4,
}

const GROUP_COLORS: Record<string, string> = {
  'キャビンG': '#ca8a04',
  'デッキG': '#dc2626',
  'フロアG': '#3b82f6',
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'deadline', label: '納期順' },
  { key: 'project_no', label: '案件番号順' },
  { key: 'company_name', label: '客先順' },
  { key: 'unit_number', label: '号機順' },
  { key: 'status', label: 'ステータス順' },
  { key: 'group_name', label: 'グループ順' },
]

function parseUnitNumber(s: string | null | undefined): number {
  if (!s) return Infinity
  const m = s.match(/\d+/)
  return m ? parseInt(m[0], 10) : Infinity
}

function getSortValue(p: ProjectWithRelations, key: SortKey): string | number {
  switch (key) {
    case 'project_no': return p.project_no ?? ''
    case 'company_name': return p.company_name ?? ''
    case 'unit_number': return parseUnitNumber(p.unit_number)
    case 'deadline': return p.deadline === '9999-12-31' ? '9999-12-31' : p.deadline
    case 'status': return STATUS_ORDER[p.status] ?? 99
    case 'group_name': return p.group_name ?? ''
    default: return ''
  }
}

function diffDays(deadline: string): number | null {
  if (deadline === '9999-12-31') return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dl = new Date(deadline + 'T00:00:00')
  return Math.ceil((dl.getTime() - today.getTime()) / 86400000)
}

const SORT_STORAGE_KEY = 'seisan:project-sort'

function loadSort(): { key: SortKey; dir: SortDir } {
  try {
    const raw = sessionStorage.getItem(SORT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.key && parsed.dir) return parsed
    }
  } catch { /* ignore */ }
  return { key: 'deadline', dir: 'asc' }
}

function saveSort(key: SortKey, dir: SortDir) {
  sessionStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ key, dir }))
}

export function ProjectTable({ projects, onRowClick }: ProjectTableProps) {
  const initial = loadSort()
  const [sortKey, setSortKey] = useState<SortKey>(initial.key)
  const [sortDir, setSortDir] = useState<SortDir>(initial.dir)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      const newDir = sortDir === 'asc' ? 'desc' : 'asc'
      setSortDir(newDir)
      saveSort(key, newDir)
    } else {
      setSortKey(key)
      setSortDir('asc')
      saveSort(key, 'asc')
    }
  }

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      const va = getSortValue(a, sortKey)
      const vb = getSortValue(b, sortKey)
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [projects, sortKey, sortDir])

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border py-12 text-center text-muted-foreground">
        案件がありません
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>並び替え:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`inline-flex items-center rounded-full px-2.5 py-1 transition-colors ${
              sortKey === opt.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-accent'
            }`}
            onClick={() => handleSort(opt.key)}
          >
            {opt.label}
            {sortKey === opt.key ? (
              sortDir === 'asc' ? (
                <ArrowUp className="ml-0.5 h-3 w-3" />
              ) : (
                <ArrowDown className="ml-0.5 h-3 w-3" />
              )
            ) : (
              <ArrowUpDown className="ml-0.5 h-3 w-3 opacity-30" />
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((p) => {
          const remaining = diffDays(p.deadline)
          const groupColor = GROUP_COLORS[p.group_name ?? ''] ?? '#6b7280'

          return (
            <div
              key={p.id}
              className="group relative cursor-pointer overflow-hidden rounded-lg border bg-card transition-all hover:shadow-md hover:ring-1 hover:ring-primary/30"
              style={{ borderLeft: `4px solid ${groupColor}` }}
              onClick={() => onRowClick(p)}
            >
              <div className="p-3.5">
                {/* 上段: 案件番号 + ステータス */}
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-foreground">
                    {p.project_no ?? '—'}
                  </span>
                  <StatusBadge status={p.status} type="project" />
                </div>

                {/* 客先 */}
                <p className="mb-1.5 truncate text-sm font-medium text-foreground">
                  {p.company_name}
                </p>

                {/* 製品情報 */}
                <div className="mb-2 space-y-0.5 text-xs text-muted-foreground">
                  {p.part_number ? (
                    <p className="truncate">
                      <span className="text-muted-foreground/60">図面番号(品番)</span>{' '}
                      {p.part_number}
                    </p>
                  ) : null}
                  {p.unit_number ? (
                    <p className="truncate">
                      <span className="text-muted-foreground/60">号機</span>{' '}
                      {p.unit_number}
                    </p>
                  ) : null}
                  {p.project_name ? (
                    <p className="truncate">
                      <span className="text-muted-foreground/60">名称</span>{' '}
                      {p.project_name}
                    </p>
                  ) : null}
                  {p.model_type ? (
                    <p className="truncate">
                      <span className="text-muted-foreground/60">機種</span>{' '}
                      {p.model_type}
                    </p>
                  ) : null}
                </div>

                {/* 下段: 納期 + グループ */}
                <div className="flex items-center justify-between border-t pt-2">
                  <div className="text-xs">
                    {p.deadline === '9999-12-31' ? (
                      <span className="text-muted-foreground">納期未定</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">納期</span>
                        <span className="font-medium">{p.deadline}</span>
                        {remaining !== null && p.status !== 'done' && p.status !== 'canceled' ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white ${
                              remaining <= 0
                                ? 'bg-red-500'
                                : remaining <= 7
                                  ? 'bg-red-400'
                                  : remaining <= 14
                                    ? 'bg-yellow-500'
                                    : 'bg-green-500'
                            }`}
                          >
                            {remaining <= 0 ? `${Math.abs(remaining)}日超過` : `${remaining}日`}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: groupColor }}
                  >
                    {p.group_name ?? '未分類'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

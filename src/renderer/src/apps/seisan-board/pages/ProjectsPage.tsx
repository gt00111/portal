import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileUp, Download, Loader2, AlertTriangle } from 'lucide-react'
import { showToast } from '../components/Toaster'
import { Button } from '../components/ui/button'
import { ProjectTable } from '../components/ProjectTable'
import { ProjectFormDialog } from '../components/ProjectFormDialog'
import { CsvImportDialog } from '../components/CsvImportDialog'
import { FilterBar } from '../components/FilterBar'
import { useAuth } from '../contexts/AuthContext'
import type { ProjectWithRelations } from 'shared'
import { seisanPath } from '../paths'

const PAGE_SIZE = 20
const FILTER_STORAGE_KEY = 'seisan:project-filters'

interface ProjectListFilter {
  project_status?: string[]
  company_id?: string
  group_id?: string
  search?: string
  created_month?: string
}

function loadFilters(): ProjectListFilter {
  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveFilters(f: ProjectListFilter) {
  sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(f))
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const { canEdit } = useAuth()
  const [projects, setProjects] = useState<ProjectWithRelations[]>([])
  const [companyOptions, setCompanyOptions] = useState<string[]>([])
  const [groupOptions, setGroupOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [includeDone, setIncludeDone] = useState(false)
  const [filters, setFilters] = useState<ProjectListFilter>(loadFilters)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)

  const buildApiFilter = useCallback((offset: number) => {
    let created_from: string | undefined
    let created_to: string | undefined
    if (filters.created_month) {
      const [y, m] = filters.created_month.split('-').map(Number)
      created_from = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      created_to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`
    }
    const status = filters.project_status ??
      (includeDone ? undefined : ['draft', 'submitted', 'approved', 'in_planning', 'in_progress', 'canceled'])
    return {
      status,
      company_id: filters.company_id,
      group_id: filters.group_id,
      search: filters.search,
      created_from,
      created_to,
      limit: PAGE_SIZE,
      offset,
    }
  }, [filters, includeDone])

  const fetchInitial = useCallback(async () => {
    if (!window.api) return
    setLoading(true)
    setFetchError(null)
    offsetRef.current = 0
    try {
      const [projectsRes, companiesRes, groupsRes] = await Promise.all([
        window.api.projects.list(buildApiFilter(0)),
        window.api.masterData.distinctCompanies(),
        window.api.masterData.distinctGroups(),
      ])
      if (projectsRes.success && projectsRes.data) {
        setProjects(projectsRes.data.items)
        setTotal(projectsRes.data.total)
        setHasMore(projectsRes.data.items.length < projectsRes.data.total)
        offsetRef.current = projectsRes.data.items.length
      } else {
        setFetchError(projectsRes.error ?? 'データの取得に失敗しました')
      }
      if (companiesRes.success && companiesRes.data) setCompanyOptions(companiesRes.data)
      if (groupsRes.success && groupsRes.data) setGroupOptions(groupsRes.data)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'データの取得に失敗しました')
    }
    setLoading(false)
  }, [buildApiFilter])

  const fetchMore = useCallback(async () => {
    if (!window.api || loadingMore || !hasMore) return
    setLoadingMore(true)
    const res = await window.api.projects.list(buildApiFilter(offsetRef.current))
    if (res.success && res.data) {
      setProjects((prev) => [...prev, ...res.data!.items])
      setTotal(res.data.total)
      offsetRef.current += res.data.items.length
      setHasMore(offsetRef.current < res.data.total)
    }
    setLoadingMore(false)
  }, [buildApiFilter, loadingMore, hasMore])

  useEffect(() => {
    fetchInitial()
  }, [fetchInitial])

  useEffect(() => {
    const onRefresh = () => fetchInitial()
    window.addEventListener('seisan:refresh', onRefresh)
    return () => window.removeEventListener('seisan:refresh', onRefresh)
  }, [fetchInitial])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          fetchMore()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, fetchMore])

  const handleSave = async () => {
    setFormOpen(false)
    fetchInitial()
  }

  const STATUS_LABELS: Record<string, string> = {
    draft: '下書き', submitted: '提出済', approved: '承認済',
    in_planning: '計画中', in_progress: '進行中', done: '完了', canceled: '取消',
  }

  const handleExport = useCallback(async () => {
    if (!window.api?.import?.exportCsv || projects.length === 0) return
    const headers = ['案件番号', '客先', '機種', '図面番号(品番)', '名称', '号機', 'リビジョン', '納期', '内容', 'グループ', 'ステータス', '登録日']
    const escCsv = (v: string) => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return `"${v.replace(/"/g, '""')}"`
      }
      return v
    }
    const rows = projects.map((p) => [
      p.project_no ?? '',
      p.company_name ?? '',
      p.model_type ?? '',
      p.part_number ?? '',
      p.project_name ?? '',
      p.unit_number ?? '',
      p.revision ?? '',
      p.deadline === '9999-12-31' ? '未定' : p.deadline,
      p.request_content ?? '',
      p.group_name ?? '',
      STATUS_LABELS[p.status] ?? p.status,
      p.created_at?.slice(0, 10) ?? '',
    ].map(escCsv).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const res = await window.api.import.exportCsv(csv)
    if (res?.success) showToast('CSVをエクスポートしました')
  }, [projects])

  if (loading) {
    return <div className="flex items-center justify-center p-8">読み込み中...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">案件一覧</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={projects.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            CSVエクスポート
          </Button>
          {canEdit && (
            <Button variant="outline" onClick={() => setCsvOpen(true)}>
              <FileUp className="mr-2 h-4 w-4" />
              CSVインポート
            </Button>
          )}
          {canEdit && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              新規案件
            </Button>
          )}
        </div>
      </div>
      {fetchError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {fetchError}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <FilterBar
          companyOptions={companyOptions}
          groupOptions={groupOptions}
          filters={filters}
          onFilterChange={(f) => { setFilters(f); saveFilters(f) }}
        />
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <input
            type="checkbox"
            checked={includeDone}
            onChange={(e) => setIncludeDone(e.target.checked)}
          />
          完了案件を含む
        </label>
      </div>

      {total > 0 && (
        <p className="text-xs text-muted-foreground">
          {total}件中 {projects.length}件を表示
        </p>
      )}

      <ProjectTable
        projects={projects}
        onRowClick={(p) => navigate(seisanPath(`projects/${p.id}`))}
      />

      <div ref={sentinelRef} className="h-1" />

      {loadingMore && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">読み込み中...</span>
        </div>
      )}

      {!hasMore && projects.length > 0 && projects.length >= PAGE_SIZE && (
        <p className="py-2 text-center text-xs text-muted-foreground">
          すべての案件を表示しました
        </p>
      )}

      <ProjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={handleSave}
      />
      <CsvImportDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        onImported={() => {
          setCsvOpen(false)
          fetchInitial()
        }}
      />
    </div>
  )
}

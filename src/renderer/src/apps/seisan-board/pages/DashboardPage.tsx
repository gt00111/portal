import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HelpCircle, RefreshCw, AlertTriangle } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import type { ProjectWithRelations } from 'shared'
import { PROJECT_STATUS_LABELS } from 'shared'
import { seisanPath } from '../paths'

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function diffDays(a: string, b: string): number {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8',
  submitted: '#60a5fa',
  approved: '#a78bfa',
  in_planning: '#818cf8',
  in_progress: '#3b82f6',
  done: '#22c55e',
  canceled: '#ef4444',
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithRelations[]>([])
  const [groupOptions, setGroupOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [groupFilterId, setGroupFilterId] = useState<string | undefined>(undefined)
  const [helpOpen, setHelpOpen] = useState(false)

  const fetchData = useCallback(async () => {
    if (!window.api) return
    setFetchError(null)
    try {
      const [pRes, gRes] = await Promise.all([
        window.api.projects.list({ limit: 9999 }),
        window.api.masterData.distinctGroups(),
      ])
      if (pRes.success && pRes.data) {
        setProjects(pRes.data.items)
      } else {
        setFetchError(pRes.error ?? 'データの取得に失敗しました')
      }
      if (gRes.success && gRes.data) setGroupOptions(gRes.data)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'データの取得に失敗しました')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filtered = useMemo(() => {
    if (!groupFilterId) return projects
    return projects.filter((p) => p.group_id === groupFilterId)
  }, [projects, groupFilterId])

  const today = toYmd(new Date())
  const thisMonthStart = toYmd(startOfMonth(new Date()))
  const thisMonthEnd = toYmd(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))

  // --- KPIs ---
  const kpis = useMemo(() => {
    const inProgress = filtered.filter((p) => p.status === 'in_progress').length
    const deadlineThisMonth = filtered.filter(
      (p) => p.status === 'in_progress' && p.deadline >= thisMonthStart && p.deadline <= thisMonthEnd
    ).length
    const overdue = filtered.filter(
      (p) => p.deadline < today && p.status !== 'done' && p.status !== 'canceled' && p.deadline !== '9999-12-31'
    ).length
    const doneThisMonth = filtered.filter(
      (p) => p.status === 'done' && p.completed_at && p.completed_at >= thisMonthStart
    ).length
    return { inProgress, deadlineThisMonth, overdue, doneThisMonth }
  }, [filtered, today, thisMonthStart, thisMonthEnd])

  // --- グループ別案件負荷（横棒） ---
  const groupBarData = useMemo(() => {
    const map = new Map<string, { name: string; 承認済: number; 進行中: number; 完了: number }>()
    for (const p of filtered) {
      const key = p.group_id ?? '__none__'
      if (!map.has(key)) {
        map.set(key, { name: key === '__none__' ? '未分類' : key, 承認済: 0, 進行中: 0, 完了: 0 })
      }
      const row = map.get(key)!
      if (p.status === 'approved' || p.status === 'in_planning') row['承認済'] += 1
      else if (p.status === 'in_progress') row['進行中'] += 1
      else if (p.status === 'done') row['完了'] += 1
    }
    return Array.from(map.values()).filter((r) => r['承認済'] + r['進行中'] + r['完了'] > 0)
  }, [filtered])

  // --- ステータス分布（ドーナツ） ---
  const statusDonutData = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of filtered) {
      counts.set(p.status, (counts.get(p.status) ?? 0) + 1)
    }
    const order = ['draft', 'submitted', 'approved', 'in_planning', 'in_progress', 'done', 'canceled']
    return order
      .filter((s) => (counts.get(s) ?? 0) > 0)
      .map((s) => ({
        name: PROJECT_STATUS_LABELS[s as keyof typeof PROJECT_STATUS_LABELS] ?? s,
        value: counts.get(s) ?? 0,
        status: s,
      }))
  }, [filtered])

  // --- 月別案件推移（折れ線） ---
  const monthlyTrend = useMemo(() => {
    const now = new Date()
    const months: { key: string; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${d.getMonth() + 1}月`,
      })
    }
    return months.map((m) => {
      const newCount = filtered.filter((p) => p.created_at?.startsWith(m.key)).length
      const doneCount = filtered.filter(
        (p) => p.status === 'done' && p.completed_at && p.completed_at.startsWith(m.key)
      ).length
      return { name: m.label, 新規: newCount, 完了: doneCount }
    })
  }, [filtered])

  // --- 直近納期リスト ---
  const upcomingDeadlines = useMemo(() => {
    const in30 = toYmd(new Date(Date.now() + 30 * 86400000))
    return filtered
      .filter(
        (p) =>
          p.status !== 'done' &&
          p.status !== 'canceled' &&
          p.deadline !== '9999-12-31' &&
          p.deadline <= in30
      )
      .map((p) => ({
        ...p,
        remainingDays: diffDays(today, p.deadline),
      }))
      .sort((a, b) => a.remainingDays - b.remainingDays)
  }, [filtered, today])

  if (loading) {
    return <div className="flex min-h-[300px] items-center justify-center">読み込み中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="min-w-0 text-xl font-bold sm:text-2xl">ダッシュボード</h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <Select
            value={groupFilterId ?? '__all__'}
            onValueChange={(v) => setGroupFilterId(v === '__all__' ? undefined : v)}
          >
            <SelectTrigger className="w-full min-w-0 max-w-full sm:w-[180px] sm:max-w-[180px]">
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
          <Button variant="outline" size="icon" onClick={fetchData} title="再読込">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setHelpOpen(true)} title="ヘルプ">
            <HelpCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-h-[80vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ダッシュボードの見方</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h3 className="mb-1 font-semibold text-foreground">KPIカード（上段の数値）</h3>
              <ul className="list-inside list-disc space-y-1">
                <li><span className="font-medium text-blue-600">進行中案件</span> ― 現在「進行中」ステータスの案件数。今どれだけ仕事が動いているかの指標。</li>
                <li><span className="font-medium text-yellow-600">今月納期</span> ― 今月中に納期がある進行中案件の数。月末に向けて注意すべき案件。</li>
                <li><span className="font-medium text-red-600">納期遅延</span> ― 納期を過ぎてもまだ完了していない案件の数。ゼロが理想。</li>
                <li><span className="font-medium text-green-600">今月完了</span> ― 今月中に完了した案件の数。チームの成果を確認できます。</li>
              </ul>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-foreground">グループ別 案件負荷（横棒グラフ）</h3>
              <p>各グループが抱えている案件数をステータスごとに色分けして表示します。棒が長いグループほど仕事量が多く、負荷が偏っていないか確認できます。</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li><span className="text-purple-500">紫</span> = 承認済（これから着手する案件）</li>
                <li><span className="text-blue-500">青</span> = 進行中（現在作業中）</li>
                <li><span className="text-green-500">緑</span> = 完了</li>
              </ul>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-foreground">ステータス別 案件分布（ドーナツチャート）</h3>
              <p>全案件がどのステータスに分布しているかを円グラフで表示します。「進行中」が極端に多い場合はボトルネックの可能性があります。</p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-foreground">月別 案件推移（折れ線グラフ）</h3>
              <p>過去6ヶ月間の新規登録数と完了数の推移を表示します。完了数が新規数に追いついていない場合、仕事が溜まっている状態です。</p>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-foreground">直近の納期（テーブル）</h3>
              <p>今日から30日以内に納期がある未完了案件を一覧表示します。残日数に応じて色分けされています。</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li><span className="rounded bg-red-500 px-1.5 py-0.5 text-xs text-white">赤</span> = 7日以内または超過</li>
                <li><span className="rounded bg-yellow-500 px-1.5 py-0.5 text-xs text-white">黄</span> = 14日以内</li>
                <li><span className="rounded bg-green-500 px-1.5 py-0.5 text-xs text-white">緑</span> = 15日以上</li>
              </ul>
            </section>
            <section>
              <h3 className="mb-1 font-semibold text-foreground">グループフィルタ</h3>
              <p>右上のグループ選択で、特定のグループだけに絞り込めます。全てのグラフとテーブルが連動してフィルタリングされます。</p>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      {fetchError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {fetchError}
        </div>
      )}

      {/* KPIカード */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="進行中案件" value={kpis.inProgress} color="bg-blue-500" />
        <KpiCard label="今月納期" value={kpis.deadlineThisMonth} color="bg-yellow-500" />
        <KpiCard label="納期遅延" value={kpis.overdue} color="bg-red-500" />
        <KpiCard label="今月完了" value={kpis.doneThisMonth} color="bg-green-500" />
      </div>

      {/* チャート2段 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* グループ別案件負荷 */}
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">グループ別 案件負荷</h2>
          {groupBarData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">データなし</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={groupBarData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="承認済" stackId="a" fill="#a78bfa" />
                <Bar dataKey="進行中" stackId="a" fill="#3b82f6" />
                <Bar dataKey="完了" stackId="a" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ステータス分布 */}
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">ステータス別 案件分布</h2>
          {statusDonutData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">データなし</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusDonutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name} ${value}`}
                >
                  {statusDonutData.map((entry) => (
                    <Cell
                      key={entry.status}
                      fill={STATUS_COLORS[entry.status] ?? '#94a3b8'}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 月別推移 */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">月別 案件推移（過去6ヶ月）</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthlyTrend} margin={{ left: 10, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="新規" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="完了" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 直近納期リスト */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">直近の納期（30日以内）</h2>
        {upcomingDeadlines.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            30日以内に納期がある進行中案件はありません
          </p>
        ) : (
          <div className="max-h-[300px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>案件番号</TableHead>
                  <TableHead>客先</TableHead>
                  <TableHead>図面番号(品番)</TableHead>
                  <TableHead>納期</TableHead>
                  <TableHead>グループ</TableHead>
                  <TableHead className="text-right">残日数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingDeadlines.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => navigate(seisanPath(`projects/${p.id}`))}
                  >
                    <TableCell className="font-medium">{p.project_no ?? '-'}</TableCell>
                    <TableCell>{p.company_name}</TableCell>
                    <TableCell>{p.part_number ?? '-'}</TableCell>
                    <TableCell>{p.deadline}</TableCell>
                    <TableCell>{p.group_name ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white ${
                          p.remainingDays <= 0
                            ? 'bg-red-500'
                            : p.remainingDays <= 7
                              ? 'bg-red-400'
                              : p.remainingDays <= 14
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                        }`}
                      >
                        {p.remainingDays <= 0 ? `${Math.abs(p.remainingDays)}日超過` : `${p.remainingDays}日`}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className={`h-3 w-3 rounded-full ${color}`} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  )
}

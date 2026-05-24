import {
  AlertTriangle,
  Clock,
  HelpCircle,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { canAppWrite, getAppRole, type AppRole } from "@shared/auth.js";
import type { MasterRow } from "@shared/master.js";
import {
  PART_LINE_STATUSES,
  PART_LINE_STATUS_LABELS,
  PART_SOURCE_TYPES,
  PART_SOURCE_TYPE_LABELS,
  type PartLineRisk,
  type PartLineStatus,
  type PartSourceType,
  type ProjectPartLine,
  type ProjectPartLineUpsertInput,
  type ProjectPartSummary,
} from "@shared/partsTracker.js";
import type { SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { DataTable, type Column } from "@renderer/components/ui/DataTable.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { Select } from "@renderer/components/ui/Select.js";
import { TextField } from "@renderer/components/ui/TextField.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { PortalAppHeaderLogo } from "@renderer/components/PortalAppHeaderLogo.js";
import { invoke } from "@renderer/lib/api.js";
import { cn } from "@renderer/lib/cn.js";
import {
  HELP_ADD_EDIT,
  HELP_DB_PATH_LABEL,
  HELP_DB_STORAGE_NOTE,
  HELP_FUTURE,
  HELP_MASTER,
  HELP_OVERVIEW,
  HELP_PROJECT_SELECT,
  HELP_RISK,
  HELP_ROLES_EDITOR,
  HELP_ROLES_VIEWER,
  PARTS_TRACKER_PAGE_TAGLINE,
} from "@renderer/routes/parts-tracker/partsTrackerHelpCopy.js";

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "管理者",
  editor: "編集者",
  viewer: "閲覧者",
};

const PAGE_SIZES = [20, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

type RiskFilter = "all" | PartLineRisk;

interface ProjectOption {
  id: string;
  projectNo: string | null;
  projectName: string | null;
  companyName: string;
  deadline: string;
}

interface Props {
  session: SessionUser;
}

function projectLabel(p: ProjectOption): string {
  const no = p.projectNo ? `${p.projectNo} · ` : "";
  const name = p.projectName ?? "（名称未設定）";
  return `${no}${name} — ${p.companyName}`;
}

function riskRank(risk: PartLineRisk): number {
  if (risk === "delayed") return 0;
  if (risk === "need_order") return 1;
  return 2;
}

function riskBadge(risk: ProjectPartLine["risk"]): JSX.Element {
  if (risk === "delayed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-state-danger/15 px-2 py-0.5 text-xs font-medium text-state-danger">
        <AlertTriangle className="h-3 w-3" aria-hidden />
        遅延
      </span>
    );
  }
  if (risk === "need_order") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
        <Clock className="h-3 w-3" aria-hidden />
        要発注
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-bg-elevated px-2 py-0.5 text-xs text-fg-muted">
      問題なし
    </span>
  );
}

const emptyLineForm = (projectId: string, defaultRequiredDate: string): ProjectPartLineUpsertInput => ({
  seisanProjectId: projectId,
  partNumber: "",
  partName: "",
  quantity: 1,
  sourceType: "purchase",
  supplierId: null,
  leadTimeDays: undefined,
  requiredDate: defaultRequiredDate,
  status: "planned",
  note: "",
});

export function PartsTrackerApp({ session }: Props): JSX.Element {
  const toast = useToast();
  const role = getAppRole(session, "parts-tracker");
  const writable = canAppWrite(session, "parts-tracker");

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [suppliers, setSuppliers] = useState<MasterRow[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [lines, setLines] = useState<ProjectPartLine[]>([]);
  const [summary, setSummary] = useState<ProjectPartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProjectPartLine | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ProjectPartLineUpsertInput>(emptyLineForm("", ""));
  const [saving, setSaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [lineSearch, setLineSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(20);

  const loadProjects = useCallback(async () => {
    try {
      const [projectList, supplierList, status] = await Promise.all([
        invoke<ProjectOption[]>("parts-tracker:projectList"),
        invoke<MasterRow[]>("master:list", { table: "m_suppliers" }),
        invoke<{ connected: boolean; path: string | null }>("parts-tracker:status"),
      ]);
      setProjects(projectList);
      setSuppliers(supplierList.filter((s) => s.isActive));
      setDbPath(status.path);
      setProjectId((prev) => prev || projectList[0]?.id || "");
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }, [toast]);

  const loadLines = useCallback(async () => {
    if (!projectId) {
      setLines([]);
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [lineList, sum] = await Promise.all([
        invoke<ProjectPartLine[]>("parts-tracker:line:list", { seisanProjectId: projectId }),
        invoke<ProjectPartSummary>("parts-tracker:summary", { seisanProjectId: projectId }),
      ]);
      setLines(lineList);
      setSummary(sum);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadLines();
  }, [loadLines]);

  useEffect(() => {
    setPage(1);
  }, [projectId, lineSearch, riskFilter, pageSize]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => projectLabel(p).toLowerCase().includes(q));
  }, [projects, projectQuery]);

  const filteredLines = useMemo(() => {
    const q = lineSearch.trim().toLowerCase();
    let list = lines;
    if (riskFilter !== "all") {
      list = list.filter((l) => l.risk === riskFilter);
    }
    if (q) {
      list = list.filter((l) => {
        const hay = [
          l.partNumber,
          l.partName,
          l.supplierName ?? "",
          l.note ?? "",
          PART_SOURCE_TYPE_LABELS[l.sourceType],
          PART_LINE_STATUS_LABELS[l.status],
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return [...list].sort((a, b) => {
      const rd = riskRank(a.risk) - riskRank(b.risk);
      if (rd !== 0) return rd;
      const oa = a.orderByDate ?? "";
      const ob = b.orderByDate ?? "";
      return oa.localeCompare(ob);
    });
  }, [lines, lineSearch, riskFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLines.length / pageSize));
  const pagedLines = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLines.slice(start, start + pageSize);
  }, [filteredLines, page, pageSize]);

  async function suggestLeadTime(next: ProjectPartLineUpsertInput): Promise<void> {
    try {
      const resolved = await invoke<{ leadTimeDays: number }>("parts-tracker:suggestLeadTime", {
        sourceType: next.sourceType,
        supplierId: next.supplierId,
        skuId: next.skuId,
        partNumber: next.partNumber,
      });
      setForm((f) => ({ ...f, leadTimeDays: resolved.leadTimeDays }));
    } catch {
      /* 手入力可 */
    }
  }

  function openCreate(): void {
    const deadline = selectedProject?.deadline ?? "";
    setCreating(true);
    setEditing(null);
    setForm(emptyLineForm(projectId, deadline));
  }

  async function handleDelete(line: ProjectPartLine): Promise<void> {
    if (!window.confirm(`「${line.partNumber}」を削除します。よろしいですか？`)) return;
    try {
      await invoke("parts-tracker:line:delete", { id: line.id });
      toast.push("success", "削除しました。");
      await loadLines();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, seisanProjectId: projectId };
      if (editing) {
        await invoke("parts-tracker:line:update", { id: editing.id, input: payload });
        toast.push("success", "更新しました。");
      } else {
        await invoke("parts-tracker:line:create", payload);
        toast.push("success", "登録しました。");
      }
      setEditing(null);
      setCreating(false);
      await loadLines();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<Array<Column<ProjectPartLine>>>(() => {
    const base: Array<Column<ProjectPartLine>> = [
      {
        key: "risk",
        header: "リスク",
        width: "100px",
        render: (l) => riskBadge(l.risk),
      },
      {
        key: "partNumber",
        header: "品番",
        width: "120px",
        render: (l) => <span className="font-mono text-xs">{l.partNumber}</span>,
      },
      { key: "partName", header: "部品名称", render: (l) => l.partName },
      {
        key: "quantity",
        header: "数量",
        width: "72px",
        align: "right",
        render: (l) => l.quantity,
      },
      {
        key: "sourceType",
        header: "区分",
        width: "88px",
        render: (l) => PART_SOURCE_TYPE_LABELS[l.sourceType],
      },
      {
        key: "supplier",
        header: "商社",
        width: "120px",
        render: (l) => <span className="text-fg-muted">{l.supplierName ?? "—"}</span>,
      },
      {
        key: "leadTimeDays",
        header: "LT",
        width: "56px",
        align: "right",
        render: (l) => `${l.leadTimeDays}日`,
      },
      {
        key: "requiredDate",
        header: "必要着日",
        width: "108px",
        render: (l) => l.requiredDate,
      },
      {
        key: "orderByDate",
        header: "発注期限",
        width: "108px",
        render: (l) => (
          <span className={cn(l.risk === "need_order" && "font-medium text-amber-700 dark:text-amber-300")}>
            {l.orderByDate ?? "—"}
          </span>
        ),
      },
      {
        key: "status",
        header: "状態",
        width: "88px",
        render: (l) => PART_LINE_STATUS_LABELS[l.status],
      },
      {
        key: "note",
        header: "備考",
        render: (l) => (
          <span className="line-clamp-2 max-w-[12rem] text-xs text-fg-muted">{l.note ?? "—"}</span>
        ),
      },
    ];
    if (writable) {
      base.push({
        key: "actions",
        header: "",
        width: "88px",
        align: "right",
        render: (l) => (
          <div className="flex justify-end gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title="編集"
              onClick={() => {
                setEditing(l);
                setCreating(false);
                setForm({
                  seisanProjectId: l.seisanProjectId,
                  partNumber: l.partNumber,
                  partName: l.partName,
                  quantity: l.quantity,
                  sourceType: l.sourceType,
                  supplierId: l.supplierId,
                  leadTimeDays: l.leadTimeDays,
                  requiredDate: l.requiredDate,
                  status: l.status,
                  note: l.note ?? "",
                });
              }}
            >
              <Pencil size={14} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title="削除"
              onClick={() => void handleDelete(l)}
            >
              <Trash2 size={14} className="text-state-danger" aria-hidden />
            </Button>
          </div>
        ),
      });
    }
    return base;
  }, [writable]);

  const modalOpen = creating || editing !== null;
  const defaultRequired = selectedProject?.deadline ?? "";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-base">
      <header className="sticky top-0 z-40 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-border-subtle bg-bg-surface px-3 py-2 sm:flex-nowrap sm:px-4 sm:py-0">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <PortalAppHeaderLogo
            appId="parts-tracker"
            className="h-8 w-auto max-h-9 max-w-[min(200px,50vw)] shrink-0 object-contain sm:h-9 sm:max-w-[min(200px,28vw)]"
          />
          <div className="flex min-w-0 items-center gap-2">
            <Package className="h-5 w-5 shrink-0 text-accent-primary sm:hidden" aria-hidden />
            <h1 className="truncate text-base font-semibold text-fg-primary sm:text-lg">部材管理</h1>
          </div>
        </div>
        <div className="flex w-full min-w-0 shrink-0 items-center justify-end gap-2 text-sm text-fg-muted sm:w-auto">
          <User className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="max-w-[min(8rem,35vw)] truncate sm:max-w-[8rem]">{session.username}</span>
          <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-subtle">
            {ROLE_LABELS[role ?? "viewer"]}
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="max-w-3xl text-sm leading-relaxed text-fg-muted">{PARTS_TRACKER_PAGE_TAGLINE}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
              <HelpCircle size={16} aria-hidden />
              ヘルプ
            </Button>
          </div>

          {!writable && (
            <div className="rounded-lg border border-border-subtle bg-bg-surface/80 px-4 py-3 text-sm text-fg-muted">
              閲覧者モードです。部品行の追加・編集はできません。
            </div>
          )}

          <Card className="space-y-4 p-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <div className="space-y-2">
                <label className="text-sm text-fg-muted">案件を検索</label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                    aria-hidden
                  />
                  <input
                    type="search"
                    placeholder="製番・案件名・客先"
                    value={projectQuery}
                    onChange={(e) => setProjectQuery(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border-strong bg-bg-surface pl-9 pr-3 text-sm placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                  />
                </div>
              </div>
              <Select
                label="生産案件"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                options={[
                  { value: "", label: "（案件を選択）" },
                  ...filteredProjects.map((p) => ({ value: p.id, label: projectLabel(p) })),
                ]}
              />
              <div className="flex flex-wrap gap-2 lg:pb-0.5">
                <Button type="button" variant="secondary" size="sm" onClick={() => void loadLines()} disabled={loading}>
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden />
                  更新
                </Button>
                {writable && projectId && (
                  <Button type="button" size="sm" onClick={openCreate}>
                    <Plus size={16} aria-hidden />
                    部品行を追加
                  </Button>
                )}
              </div>
            </div>

            {selectedProject && (
              <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4">
                <StatChip label="案件納期" value={selectedProject.deadline} />
                <StatChip label="部品行" value={`${summary?.totalLines ?? 0} 件`} />
                <StatChip
                  label="遅延"
                  value={`${summary?.delayedCount ?? 0} 件`}
                  tone={(summary?.delayedCount ?? 0) > 0 ? "danger" : "neutral"}
                />
                <StatChip
                  label="要発注"
                  value={`${summary?.needOrderCount ?? 0} 件`}
                  tone={(summary?.needOrderCount ?? 0) > 0 ? "warning" : "neutral"}
                />
                <StatChip label="未着手" value={`${summary?.plannedCount ?? 0} 件`} />
              </div>
            )}
          </Card>

          {projectId && (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="relative min-w-[200px] flex-1 sm:max-w-md">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                  aria-hidden
                />
                <input
                  type="search"
                  placeholder="品番・名称・商社・備考で検索"
                  value={lineSearch}
                  onChange={(e) => setLineSearch(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border-strong bg-bg-surface pl-9 pr-3 text-sm placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                />
              </div>
              <div>
                <span className="mb-1 block text-xs text-fg-subtle">リスク</span>
                <div className="flex rounded-md border border-border-subtle bg-bg-surface p-0.5">
                  {(
                    [
                      ["all", "すべて"],
                      ["need_order", "要発注"],
                      ["delayed", "遅延"],
                      ["ok", "問題なし"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={cn(
                        "rounded px-2.5 py-1.5 text-xs font-medium sm:px-3",
                        riskFilter === id ? "bg-accent-primary text-bg-base" : "text-fg-muted hover:text-fg-primary"
                      )}
                      onClick={() => setRiskFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!projectId ? (
            <Card className="p-8 text-center text-sm text-fg-muted">
              生産案件を選択すると、部品表が表示されます。
            </Card>
          ) : loading ? (
            <Card className="p-8 text-center text-sm text-fg-muted">読み込み中...</Card>
          ) : lines.length === 0 ? (
            <Card className="space-y-3 p-8 text-center">
              <p className="text-sm text-fg-muted">この案件には部品行がまだありません。</p>
              {writable && (
                <Button type="button" size="sm" onClick={openCreate}>
                  <Plus size={16} aria-hidden />
                  最初の部品行を追加
                </Button>
              )}
            </Card>
          ) : filteredLines.length === 0 ? (
            <Card className="p-8 text-center text-sm text-fg-muted">
              条件に一致する部品行がありません。検索またはリスクフィルタを変更してください。
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <DataTable columns={columns} rows={pagedLines} keyOf={(r) => r.id} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3 text-sm text-fg-muted">
                <span>
                  {filteredLines.length} 件中 {(page - 1) * pageSize + 1}–
                  {Math.min(page * pageSize, filteredLines.length)} 件を表示
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    表示件数
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
                      className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-sm text-fg-primary"
                    >
                      {PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    前へ
                  </Button>
                  <span className="text-xs">
                    {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    次へ
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </main>

      <Modal open={helpOpen} title="部材管理のヘルプ" onClose={() => setHelpOpen(false)} width="lg">
        <div className="space-y-4 text-sm leading-relaxed text-fg-primary">
          {dbPath ? (
            <div>
              <p>{HELP_DB_STORAGE_NOTE}</p>
              <p className="mt-2 text-xs font-medium text-fg-muted">{HELP_DB_PATH_LABEL}</p>
              <p className="mt-1 break-all font-mono text-xs text-fg-muted">{dbPath}</p>
            </div>
          ) : (
            <p>{HELP_DB_STORAGE_NOTE}</p>
          )}
          <p>{HELP_OVERVIEW}</p>
          <p>{HELP_PROJECT_SELECT}</p>
          <p>{HELP_ADD_EDIT}</p>
          <p>{HELP_RISK}</p>
          <p>{HELP_MASTER}</p>
          <p>{writable ? HELP_ROLES_EDITOR : HELP_ROLES_VIEWER}</p>
          <p className="text-xs text-fg-muted">{HELP_FUTURE}</p>
        </div>
      </Modal>

      <Modal
        open={modalOpen}
        title={editing ? "部品行を編集" : "部品行を追加"}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        width="lg"
      >
        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="品番"
            value={form.partNumber}
            onChange={(e) => {
              const next = { ...form, partNumber: e.target.value };
              setForm(next);
              void suggestLeadTime(next);
            }}
            required
          />
          <TextField
            label="部品名称"
            value={form.partName}
            onChange={(e) => setForm((f) => ({ ...f, partName: e.target.value }))}
            required
          />
          <TextField
            label="数量"
            type="number"
            min={0}
            step="any"
            value={String(form.quantity ?? 1)}
            onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) || 0 }))}
          />
          <Select
            label="調達区分"
            value={form.sourceType}
            onChange={(e) => {
              const next = { ...form, sourceType: e.target.value as PartSourceType };
              setForm(next);
              void suggestLeadTime(next);
            }}
            options={PART_SOURCE_TYPES.map((t) => ({
              value: t,
              label: PART_SOURCE_TYPE_LABELS[t],
            }))}
          />
          {form.sourceType === "purchase" && (
            <div className="sm:col-span-2">
              <Select
                label="商社"
                value={form.supplierId != null ? String(form.supplierId) : ""}
                onChange={(e) => {
                  const next = {
                    ...form,
                    supplierId: e.target.value ? Number(e.target.value) : null,
                  };
                  setForm(next);
                  void suggestLeadTime(next);
                }}
                options={[
                  { value: "", label: "（選択）" },
                  ...suppliers.map((s) => ({ value: String(s.id), label: `${s.code} : ${s.name}` })),
                ]}
              />
            </div>
          )}
          <TextField
            label="リードタイム（日）"
            type="number"
            min={0}
            value={form.leadTimeDays != null ? String(form.leadTimeDays) : ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                leadTimeDays: e.target.value === "" ? undefined : Number(e.target.value) || 0,
              }))
            }
            placeholder="空欄で標準 LT を自動提案"
          />
          <TextField
            label="必要着日"
            type="date"
            value={form.requiredDate}
            onChange={(e) => setForm((f) => ({ ...f, requiredDate: e.target.value }))}
            required
          />
          {defaultRequired && !editing && (
            <p className="text-xs text-fg-muted">
              案件納期（{defaultRequired}）を初期値にしています。部品ごとに調整してください。
            </p>
          )}
          <Select
            label="状態"
            value={form.status ?? "planned"}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PartLineStatus }))}
            options={PART_LINE_STATUSES.map((s) => ({
              value: s,
              label: PART_LINE_STATUS_LABELS[s],
            }))}
          />
          <TextField
            label="備考"
            value={form.note ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger" | "warning";
}): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs",
        tone === "danger" && "border-state-danger/30 bg-state-danger/5 text-state-danger",
        tone === "warning" && "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200",
        tone === "neutral" && "border-border-subtle bg-bg-elevated/50 text-fg-muted"
      )}
    >
      <span className="text-fg-subtle">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

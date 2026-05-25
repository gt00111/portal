import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Diff,
  Download,
  EyeOff,
  FileSpreadsheet,
  HelpCircle,
  Layers,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { BomDiffResult } from "@shared/bomDiff.js";
import { BOM_DIFF_CHANGE_LABELS } from "@shared/bomDiff.js";
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
import type {
  BomCsvImportCommitResult,
  BomCsvPreviewResult,
  ImportDuplicatePolicy,
} from "@shared/partsTrackerCsvFormat.js";
import type {
  ExpandDuplicatePolicy,
  ProductBomExpandPreview,
  ProductBomExpandResult,
} from "@shared/productBom.js";
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
  HELP_ARRANGED,
  HELP_BOM_DIFF,
  HELP_CSV_IMPORT,
  HELP_DB_PATH_LABEL,
  HELP_DB_STORAGE_NOTE,
  HELP_FUTURE,
  HELP_HIDDEN,
  HELP_MASTER,
  HELP_OVERVIEW,
  HELP_PRODUCT_BOM,
  HELP_PROJECT_SELECT,
  HELP_REVISION,
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
  partNumber: string | null;
}

interface ProductBomMatch {
  productId: number;
  productPartNumber: string;
  productName: string;
  productBomId: number;
  revision: string;
  status: string;
  updatedAt: string;
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
  revision: null,
  quantity: 1,
  sourceType: "purchase",
  supplierId: null,
  leadTimeDays: undefined,
  requiredDate: defaultRequiredDate,
  status: "planned",
  note: "",
});

function arrangedBadge(line: ProjectPartLine): JSX.Element {
  if (!line.isArranged) {
    return <span className="text-fg-subtle">—</span>;
  }
  const who = line.arrangedByUsername ?? "（不明）";
  const when = (line.arrangedAt ?? "").replace("T", " ").slice(0, 16);
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-state-success"
      title={`${who} / ${when}`}
    >
      <CheckCircle2 size={12} aria-hidden />
      <span className="hidden sm:inline">{who}</span>
    </span>
  );
}

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
  const [showHidden, setShowHidden] = useState(false);
  const [arrangedFilter, setArrangedFilter] = useState<"all" | "unarranged" | "arranged">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [productBomMatches, setProductBomMatches] = useState<ProductBomMatch[]>([]);

  // 5-B: CSV 取込モーダル
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<BomCsvPreviewResult | null>(null);
  const [csvPolicy, setCsvPolicy] = useState<ImportDuplicatePolicy>("updateOnRevision");
  const [csvBusy, setCsvBusy] = useState(false);

  // 5-E: 展開モーダル
  const [expandOpen, setExpandOpen] = useState(false);
  const [expandBomId, setExpandBomId] = useState<number | null>(null);
  const [expandPreview, setExpandPreview] = useState<ProductBomExpandPreview | null>(null);
  const [expandPolicy, setExpandPolicy] = useState<ExpandDuplicatePolicy>("skip");
  const [expandMultiplier, setExpandMultiplier] = useState(1);
  const [expandBusy, setExpandBusy] = useState(false);

  // 5-F: 差分モーダル
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffResult, setDiffResult] = useState<BomDiffResult | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);

  // 非表示理由入力
  const [hidingLine, setHidingLine] = useState<ProjectPartLine | null>(null);
  const [hideReason, setHideReason] = useState("");

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
        invoke<ProjectPartLine[]>("parts-tracker:line:list", {
          seisanProjectId: projectId,
          includeHidden: true,
        }),
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

  const loadProductBomMatches = useCallback(async () => {
    const sel = projects.find((p) => p.id === projectId);
    const pn = sel?.partNumber?.trim();
    if (!pn) {
      setProductBomMatches([]);
      return;
    }
    try {
      const matches = await invoke<ProductBomMatch[]>("parts-tracker:productBom:match", {
        partNumber: pn,
      });
      setProductBomMatches(matches);
    } catch {
      setProductBomMatches([]);
    }
  }, [projectId, projects]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadLines();
  }, [loadLines]);

  useEffect(() => {
    void loadProductBomMatches();
  }, [loadProductBomMatches]);

  useEffect(() => {
    setPage(1);
  }, [projectId, lineSearch, riskFilter, arrangedFilter, showHidden, pageSize]);

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
    if (!showHidden) {
      list = list.filter((l) => !l.isHidden);
    }
    if (arrangedFilter === "unarranged") list = list.filter((l) => !l.isArranged);
    if (arrangedFilter === "arranged") list = list.filter((l) => l.isArranged);
    if (riskFilter !== "all") {
      list = list.filter((l) => l.risk === riskFilter);
    }
    if (q) {
      list = list.filter((l) => {
        const hay = [
          l.partNumber,
          l.partName,
          l.revision ?? "",
          l.supplierName ?? "",
          l.note ?? "",
          l.assemblyPath ?? "",
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
  }, [lines, lineSearch, riskFilter, arrangedFilter, showHidden]);

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

  async function handleSetArranged(line: ProjectPartLine, next: boolean): Promise<void> {
    try {
      await invoke<ProjectPartLine>("parts-tracker:line:setArranged", {
        id: line.id,
        arranged: next,
      });
      await loadLines();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleConfirmHide(): Promise<void> {
    if (!hidingLine) return;
    try {
      await invoke("parts-tracker:line:setHidden", {
        id: hidingLine.id,
        hidden: true,
        reason: hideReason || null,
      });
      setHidingLine(null);
      setHideReason("");
      await loadLines();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDownloadTemplate(): Promise<void> {
    try {
      const res = await invoke<{ csv: string; fileName: string }>(
        "parts-tracker:import:downloadTemplate"
      );
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCsvFile(file: File): Promise<void> {
    setCsvFileName(file.name);
    const text = await file.text();
    try {
      const preview = await invoke<BomCsvPreviewResult>("parts-tracker:import:preview", {
        csvText: text,
      });
      setCsvPreview(preview);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
      setCsvPreview(null);
    }
  }

  async function handleCsvCommit(): Promise<void> {
    if (!csvPreview || !projectId) return;
    if (csvPreview.errorCount > 0) {
      toast.push("error", "エラー行があります。CSV を修正してください。");
      return;
    }
    setCsvBusy(true);
    try {
      const rows = csvPreview.rows
        .filter((r) => r.issues.every((i) => i.level !== "error"))
        .map((r) => ({
          partNumber: r.partNumber,
          partName: r.partName,
          quantity: r.quantity,
          revision: r.revision,
          sourceType: r.sourceType,
          supplierId: r.matchedSupplierId,
          assemblyLevel: r.assemblyLevel,
          parentAssemblyPartNumber: r.parentAssemblyPartNumber,
          note: r.note,
        }));
      const res = await invoke<BomCsvImportCommitResult>("parts-tracker:import:commit", {
        seisanProjectId: projectId,
        fileName: csvFileName,
        duplicatePolicy: csvPolicy,
        requiredDate: selectedProject?.deadline ?? null,
        rows,
      });
      toast.push(
        "success",
        `取込: 追加 ${res.insertedCount} / 更新 ${res.updatedCount} / スキップ ${res.skippedCount}`
      );
      setCsvOpen(false);
      setCsvPreview(null);
      setCsvFileName(null);
      if (csvInputRef.current) csvInputRef.current.value = "";
      await loadLines();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setCsvBusy(false);
    }
  }

  async function openExpand(bomId: number): Promise<void> {
    setExpandBomId(bomId);
    setExpandOpen(true);
    setExpandPreview(null);
    try {
      const preview = await invoke<ProductBomExpandPreview>(
        "parts-tracker:productBom:previewExpand",
        { productBomId: bomId, multiplier: expandMultiplier }
      );
      setExpandPreview(preview);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function refreshExpandPreview(nextMultiplier: number): Promise<void> {
    if (!expandBomId) return;
    try {
      const preview = await invoke<ProductBomExpandPreview>(
        "parts-tracker:productBom:previewExpand",
        { productBomId: expandBomId, multiplier: nextMultiplier }
      );
      setExpandPreview(preview);
    } catch {
      /* noop */
    }
  }

  async function handleExpandCommit(): Promise<void> {
    if (!expandBomId || !projectId) return;
    setExpandBusy(true);
    try {
      const res = await invoke<ProductBomExpandResult>("parts-tracker:productBom:expand", {
        seisanProjectId: projectId,
        productBomId: expandBomId,
        duplicatePolicy: expandPolicy,
        multiplier: expandMultiplier,
        requiredDate: selectedProject?.deadline ?? null,
      });
      toast.push(
        "success",
        `展開: 追加 ${res.insertedCount} / 更新 ${res.updatedCount} / スキップ ${res.skippedCount}`
      );
      setExpandOpen(false);
      await loadLines();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setExpandBusy(false);
    }
  }

  async function handleOpenLatestDiff(): Promise<void> {
    if (!projectId) return;
    setDiffOpen(true);
    setDiffResult(null);
    setDiffBusy(true);
    try {
      const res = await invoke<BomDiffResult | null>(
        "parts-tracker:bomDiff:currentVsLatest",
        { seisanProjectId: projectId }
      );
      if (!res) {
        toast.push("info", "比較対象がありません（最新 Rev = 現在の Rev か、製品 BOM 未登録）。");
        setDiffOpen(false);
        return;
      }
      setDiffResult(res);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
      setDiffOpen(false);
    } finally {
      setDiffBusy(false);
    }
  }

  const columns = useMemo<Array<Column<ProjectPartLine>>>(() => {
    const base: Array<Column<ProjectPartLine>> = [
      {
        key: "arranged",
        header: "手配済",
        width: "112px",
        render: (l) => (
          <div className="flex items-center gap-2">
            {writable ? (
              <input
                type="checkbox"
                checked={l.isArranged}
                onChange={(e) => void handleSetArranged(l, e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-state-success"
                aria-label="手配済"
              />
            ) : (
              <CheckCircle2
                size={14}
                className={l.isArranged ? "text-state-success" : "text-fg-subtle"}
                aria-hidden
              />
            )}
            {arrangedBadge(l)}
          </div>
        ),
      },
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
        render: (l) => (
          <div className="flex flex-col">
            <span className="font-mono text-xs">{l.partNumber}</span>
            {l.assemblyPath && l.bomLevel > 0 && (
              <span
                className="truncate font-mono text-[10px] text-fg-subtle"
                title={l.assemblyPath}
              >
                L{l.bomLevel} · {l.parentAssemblyPartNumber ?? "—"}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "revision",
        header: "Rev",
        width: "60px",
        render: (l) =>
          l.revision ? (
            <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px]">
              {l.revision}
            </span>
          ) : (
            <span className="text-fg-subtle">—</span>
          ),
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
        width: "128px",
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
                  revision: l.revision,
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
              title={l.isHidden ? "再表示" : "非表示にする"}
              onClick={() => {
                if (l.isHidden) {
                  void invoke("parts-tracker:line:setHidden", { id: l.id, hidden: false }).then(
                    () => loadLines()
                  );
                } else {
                  setHidingLine(l);
                  setHideReason("");
                }
              }}
            >
              <EyeOff
                size={14}
                className={l.isHidden ? "text-fg-subtle" : "text-amber-700 dark:text-amber-300"}
                aria-hidden
              />
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                {writable && projectId && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setCsvOpen(true);
                      setCsvPreview(null);
                      setCsvFileName(null);
                    }}
                  >
                    <FileSpreadsheet size={16} aria-hidden />
                    BOM CSV 取込
                  </Button>
                )}
                {projectId && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleOpenLatestDiff()}
                    title="現在の案件 BOM と、製品マスタの最新 Rev を比較"
                  >
                    <Diff size={16} aria-hidden />
                    最新 Rev と比較
                  </Button>
                )}
              </div>
            </div>

            {selectedProject && (
              <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4">
                <StatChip label="案件納期" value={selectedProject.deadline} />
                <StatChip
                  label="部品行"
                  value={`${summary?.visibleLines ?? 0} 件 / 全 ${summary?.totalLines ?? 0}`}
                />
                <StatChip
                  label="手配済"
                  value={`${summary?.arrangedCount ?? 0} 件`}
                  tone={
                    summary && summary.visibleLines > 0 && summary.arrangedCount === summary.visibleLines
                      ? "neutral"
                      : "neutral"
                  }
                />
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
                {(summary?.hiddenLines ?? 0) > 0 && (
                  <StatChip label="非表示" value={`${summary?.hiddenLines ?? 0} 件`} />
                )}
              </div>
            )}

            {writable && selectedProject?.partNumber && productBomMatches.length > 0 && (
              <div className="rounded-lg border border-accent-secondary/30 bg-accent-secondary/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-accent-secondary">
                  <Layers size={16} aria-hidden />
                  製品 BOM テンプレート（親番: {selectedProject.partNumber}）
                </div>
                <div className="flex flex-wrap gap-2">
                  {productBomMatches.map((m) => (
                    <button
                      key={m.productBomId}
                      type="button"
                      onClick={() => void openExpand(m.productBomId)}
                      className="rounded-md border border-border-subtle bg-bg-surface px-3 py-1.5 text-xs hover:border-accent-secondary"
                      title={`${m.productPartNumber} (${m.productName})`}
                    >
                      Rev {m.revision}
                      {m.status === "released" && (
                        <span className="ml-1 rounded bg-state-success/15 px-1 py-0.5 text-[10px] text-state-success">
                          released
                        </span>
                      )}
                    </button>
                  ))}
                </div>
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
              <div>
                <span className="mb-1 block text-xs text-fg-subtle">手配</span>
                <div className="flex rounded-md border border-border-subtle bg-bg-surface p-0.5">
                  {(
                    [
                      ["all", "すべて"],
                      ["unarranged", "未手配"],
                      ["arranged", "手配済"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={cn(
                        "rounded px-2.5 py-1.5 text-xs font-medium sm:px-3",
                        arrangedFilter === id
                          ? "bg-state-success text-bg-base"
                          : "text-fg-muted hover:text-fg-primary"
                      )}
                      onClick={() => setArrangedFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  checked={showHidden}
                  onChange={(e) => setShowHidden(e.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
                非表示行も表示
              </label>
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
              <DataTable
                columns={columns}
                rows={pagedLines}
                keyOf={(r) => r.id}
                rowClassName={(r) =>
                  cn(
                    r.isHidden && "bg-bg-elevated/30 text-fg-subtle",
                    r.isArranged && !r.isHidden && "bg-state-success/5"
                  )
                }
              />
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

      <Modal open={helpOpen} title="部材管理のヘルプ" onClose={() => setHelpOpen(false)} width="xl">
        <div className="space-y-3 text-sm leading-relaxed text-fg-primary">
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
          <p>{HELP_ARRANGED}</p>
          <p>{HELP_REVISION}</p>
          <p>{HELP_HIDDEN}</p>
          <p>{HELP_CSV_IMPORT}</p>
          <p>{HELP_PRODUCT_BOM}</p>
          <p>{HELP_BOM_DIFF}</p>
          <p>{HELP_MASTER}</p>
          <p>{writable ? HELP_ROLES_EDITOR : HELP_ROLES_VIEWER}</p>
          <p className="text-xs text-fg-muted">{HELP_FUTURE}</p>
        </div>
      </Modal>

      {/* 5-B: CSV 取込モーダル */}
      <Modal
        open={csvOpen}
        title="BOM CSV 取込（SolidWorks 想定）"
        onClose={() => setCsvOpen(false)}
        width="xl"
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-md border border-border-subtle bg-bg-elevated/40 p-3 text-xs text-fg-muted">
            <p>
              品番・名称・数量・リビジョン・調達区分・商社・レベル・親品番・備考の列ヘッダを自動認識します。
              重複行のポリシーを選んでから取り込んでください。
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => void handleDownloadTemplate()}
            >
              <Download size={14} aria-hidden />
              テンプレ CSV をダウンロード
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleCsvFile(f);
              }}
              className="text-xs"
            />
            <Select
              label="重複行の扱い"
              value={csvPolicy}
              onChange={(e) => setCsvPolicy(e.target.value as ImportDuplicatePolicy)}
              options={[
                { value: "updateOnRevision", label: "同一品番+Rev は更新（推奨）" },
                { value: "appendOnly", label: "新規行のみ追加（既存はスキップ）" },
                { value: "replaceAll", label: "既存をすべて削除して入替" },
              ]}
            />
          </div>

          {csvPreview && (
            <div className="rounded-md border border-border-subtle">
              <div className="flex flex-wrap gap-2 border-b border-border-subtle px-3 py-2 text-xs">
                <span>合計 {csvPreview.totalRows} 行</span>
                {csvPreview.errorCount > 0 && (
                  <span className="text-state-danger">エラー {csvPreview.errorCount}</span>
                )}
                {csvPreview.warningCount > 0 && (
                  <span className="text-amber-700 dark:text-amber-300">
                    警告 {csvPreview.warningCount}
                  </span>
                )}
                {csvPreview.unmatchedSupplierNames.length > 0 && (
                  <span className="text-xs text-fg-muted">
                    未マッチ商社: {csvPreview.unmatchedSupplierNames.join(", ")}
                  </span>
                )}
              </div>
              <div className="max-h-80 overflow-auto text-xs">
                <table className="w-full">
                  <thead className="sticky top-0 bg-bg-elevated text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-2 py-1 text-left">#</th>
                      <th className="px-2 py-1 text-left">品番</th>
                      <th className="px-2 py-1 text-left">Rev</th>
                      <th className="px-2 py-1 text-left">名称</th>
                      <th className="px-2 py-1 text-right">数量</th>
                      <th className="px-2 py-1 text-left">区分</th>
                      <th className="px-2 py-1 text-left">商社</th>
                      <th className="px-2 py-1 text-left">L</th>
                      <th className="px-2 py-1 text-left">問題</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.rows.slice(0, 200).map((r) => {
                      const hasErr = r.issues.some((i) => i.level === "error");
                      return (
                        <tr
                          key={r.rowIndex}
                          className={cn(
                            "border-t border-border-subtle",
                            hasErr && "bg-state-danger/5"
                          )}
                        >
                          <td className="px-2 py-1 text-fg-subtle">{r.rowIndex}</td>
                          <td className="px-2 py-1 font-mono">{r.partNumber}</td>
                          <td className="px-2 py-1 font-mono">{r.revision ?? ""}</td>
                          <td className="px-2 py-1">{r.partName}</td>
                          <td className="px-2 py-1 text-right">{r.quantity}</td>
                          <td className="px-2 py-1">{PART_SOURCE_TYPE_LABELS[r.sourceType]}</td>
                          <td className="px-2 py-1">
                            {r.supplierName ?? ""}
                            {r.supplierName && r.matchedSupplierId == null && (
                              <span className="ml-1 text-amber-700 dark:text-amber-300">?</span>
                            )}
                          </td>
                          <td className="px-2 py-1">{r.assemblyLevel}</td>
                          <td className="px-2 py-1">
                            {r.issues.map((i, idx) => (
                              <span
                                key={idx}
                                className={cn(
                                  "block text-[10px]",
                                  i.level === "error"
                                    ? "text-state-danger"
                                    : "text-amber-700 dark:text-amber-300"
                                )}
                              >
                                {i.message}
                              </span>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {csvPreview.rows.length > 200 && (
                  <div className="px-3 py-2 text-xs text-fg-subtle">
                    （プレビューは先頭 200 行のみ。コミット時はすべて処理されます）
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCsvOpen(false)}>
              キャンセル
            </Button>
            <Button
              type="button"
              disabled={!csvPreview || csvBusy || csvPreview.errorCount > 0}
              onClick={() => void handleCsvCommit()}
            >
              {csvBusy ? "取込中..." : "取り込む"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 5-E: 製品 BOM 展開モーダル */}
      <Modal
        open={expandOpen}
        title="製品 BOM を案件に展開"
        onClose={() => setExpandOpen(false)}
        width="xl"
      >
        <div className="space-y-4 text-sm">
          {!expandPreview ? (
            <p className="text-fg-muted">プレビューを読み込み中...</p>
          ) : expandPreview.cycleDetected ? (
            <div className="rounded-md border border-state-danger/30 bg-state-danger/5 p-3 text-state-danger">
              循環参照を検出しました: {(expandPreview.cyclePath ?? []).join(" → ")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <StatChip
                  label="親番"
                  value={`${expandPreview.productPartNumber} Rev ${expandPreview.productRevision}`}
                />
                <StatChip label="末端部品" value={`${expandPreview.totalLeafLines} 件`} />
                <StatChip label="サブ組立" value={`${expandPreview.subAssemblyCount} 件`} />
                <StatChip label="最大深さ" value={`Lv ${expandPreview.maxDepth}`} />
                {expandPreview.missingSubAssemblies.length > 0 && (
                  <StatChip
                    label="参照未登録"
                    value={`${expandPreview.missingSubAssemblies.length} 件`}
                    tone="warning"
                  />
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  label="数量倍率"
                  type="number"
                  min={1}
                  value={String(expandMultiplier)}
                  onChange={(e) => {
                    const v = Math.max(1, Number(e.target.value) || 1);
                    setExpandMultiplier(v);
                    void refreshExpandPreview(v);
                  }}
                />
                <Select
                  label="重複行の扱い"
                  value={expandPolicy}
                  onChange={(e) => setExpandPolicy(e.target.value as ExpandDuplicatePolicy)}
                  options={[
                    { value: "skip", label: "既存はスキップ（推奨）" },
                    { value: "addQuantity", label: "既存の数量に加算" },
                    { value: "overwrite", label: "既存を上書き" },
                  ]}
                />
              </div>
              {expandPreview.missingSubAssemblies.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    以下のサブ組立は製品 BOM 未登録のため、サブ部品まで自動展開できません:
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {expandPreview.missingSubAssemblies.map((m) => (
                      <li key={m.sourceProductBomLineId}>
                        {m.partNumber}（パス: {m.parentAssemblyPath}）
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="max-h-80 overflow-auto rounded-md border border-border-subtle">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-bg-elevated text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-2 py-1 text-left">レベル</th>
                      <th className="px-2 py-1 text-left">パス</th>
                      <th className="px-2 py-1 text-left">品番</th>
                      <th className="px-2 py-1 text-left">名称</th>
                      <th className="px-2 py-1 text-right">数量</th>
                      <th className="px-2 py-1 text-left">区分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expandPreview.items.slice(0, 200).map((it, idx) => (
                      <tr key={idx} className="border-t border-border-subtle">
                        <td className="px-2 py-1 text-fg-subtle">L{it.bomLevel}</td>
                        <td className="px-2 py-1 truncate font-mono text-fg-muted">
                          {it.assemblyPath}
                        </td>
                        <td className="px-2 py-1 font-mono">{it.partNumber}</td>
                        <td className="px-2 py-1">{it.partName}</td>
                        <td className="px-2 py-1 text-right">{it.quantity}</td>
                        <td className="px-2 py-1">{PART_SOURCE_TYPE_LABELS[it.sourceType]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {expandPreview.items.length > 200 && (
                  <div className="px-3 py-2 text-fg-subtle">
                    （プレビューは先頭 200 行のみ）
                  </div>
                )}
              </div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setExpandOpen(false)}>
              キャンセル
            </Button>
            <Button
              type="button"
              disabled={!expandPreview || expandBusy || expandPreview.cycleDetected}
              onClick={() => void handleExpandCommit()}
            >
              {expandBusy ? "展開中..." : "この案件に展開"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 5-F: BOM Rev 差分モーダル */}
      <Modal
        open={diffOpen}
        title="BOM Rev 差分"
        onClose={() => setDiffOpen(false)}
        width="xl"
      >
        {diffBusy && <p className="text-sm text-fg-muted">比較中...</p>}
        {!diffBusy && diffResult && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md bg-bg-elevated/50 px-3 py-2 text-xs">
              <p className="font-medium">{diffResult.summaryText}</p>
              <p className="mt-1 text-fg-subtle">
                A: {diffResult.aLabel} → B: {diffResult.bLabel}
              </p>
            </div>
            <div className="max-h-96 overflow-auto rounded-md border border-border-subtle">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-bg-elevated text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="px-2 py-1 text-left">区分</th>
                    <th className="px-2 py-1 text-left">品番</th>
                    <th className="px-2 py-1 text-left">名称</th>
                    <th className="px-2 py-1 text-right">A 数量 / Rev</th>
                    <th className="px-2 py-1 text-right">B 数量 / Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {diffResult.entries.map((e) => (
                    <tr
                      key={e.matchKey}
                      className={cn(
                        "border-t border-border-subtle",
                        e.kind === "added" && "bg-state-success/5",
                        e.kind === "removed" && "bg-state-danger/5",
                        e.kind === "quantityChanged" && "bg-amber-500/5",
                        e.kind === "revisionChanged" && "bg-accent-secondary/5"
                      )}
                    >
                      <td className="px-2 py-1 text-fg-muted">{BOM_DIFF_CHANGE_LABELS[e.kind]}</td>
                      <td className="px-2 py-1 font-mono">{e.partNumber}</td>
                      <td className="px-2 py-1">{e.partName}</td>
                      <td className="px-2 py-1 text-right text-fg-muted">
                        {e.a ? `${e.a.quantity} / ${e.a.revision ?? "—"}` : "—"}
                      </td>
                      <td className="px-2 py-1 text-right text-fg-muted">
                        {e.b ? `${e.b.quantity} / ${e.b.revision ?? "—"}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="secondary" onClick={() => setDiffOpen(false)}>
            閉じる
          </Button>
        </div>
      </Modal>

      {/* 非表示理由ダイアログ */}
      <Modal
        open={hidingLine !== null}
        title="部品行を非表示にする"
        onClose={() => {
          setHidingLine(null);
          setHideReason("");
        }}
        width="md"
      >
        <div className="space-y-3 text-sm">
          {hidingLine && (
            <p className="text-fg-muted">
              <span className="font-mono">{hidingLine.partNumber}</span> ({hidingLine.partName}) を非表示にします。
              データは残るので、いつでも再表示できます。
            </p>
          )}
          <TextField
            label="非表示の理由（任意）"
            value={hideReason}
            onChange={(e) => setHideReason(e.target.value)}
            placeholder="例: 商社提供 3D の付属部品で購入不要"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setHidingLine(null);
                setHideReason("");
              }}
            >
              キャンセル
            </Button>
            <Button type="button" onClick={() => void handleConfirmHide()}>
              非表示にする
            </Button>
          </div>
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
            label="Rev"
            value={form.revision ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, revision: e.target.value.trim() || null }))
            }
            placeholder="A / 01 等"
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

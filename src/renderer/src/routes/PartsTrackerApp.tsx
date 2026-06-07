import {
  ClipboardCopy,
  Copy,
  Download,
  Printer,
  FileSpreadsheet,
  HelpCircle,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  sortBomTreeRows,
  type BomTreeSortDirection,
  type BomTreeSortKey,
} from "@shared/bomTreeSort.js";
import type { MasterRow } from "@shared/master.js";
import {
  canPartsTrackerBulkEdit,
  canPartsTrackerDeleteLine,
  canPartsTrackerEditBomIdentity,
  canPartsTrackerImport,
  canPartsTrackerModalEdit,
  canPartsTrackerSetArranged,
  canPartsTrackerSetHidden,
  filterEditorLineUpdateInput,
  getPartsTrackerAppRole,
} from "@shared/partsTrackerAuth.js";
import {
  PART_LINE_STATUS_LABELS,
  PART_SOURCE_TYPE_LABELS,
  type PartLineRisk,
  type LineInlineBatchUpdateItem,
  type ProjectPartLine,
  type CloneBomFromResult,
  type PartsTrackerProjectOption,
  type ProjectPartLineUpsertInput,
  type ProjectPartSummary,
  type RepeatSourceCandidate,
  type SourceTabFilter,
  type SuggestRepeatSourcesResult,
  showsProcurementLeadTime,
} from "@shared/partsTracker.js";
import {
  buildBomExportFromLines,
  suggestBomExportFileName,
  type BomCsvImportCommitResult,
  type BomCsvPreviewResult,
  type ImportDuplicatePolicy,
} from "@shared/partsTrackerCsvFormat.js";
import type { SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { PartsBomTreeTable } from "@renderer/routes/parts-tracker/PartsBomTreeTable.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { Select } from "@renderer/components/ui/Select.js";
import { TextField } from "@renderer/components/ui/TextField.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import { ProjectCascadeSelect } from "@renderer/routes/parts-tracker/ProjectCascadeSelect.js";
import { projectCascadeLabel } from "@renderer/routes/parts-tracker/projectCascade.js";
import { openBomPrintWindow } from "@renderer/routes/parts-tracker/partsBomPrint.js";
import { cn } from "@renderer/lib/cn.js";
import { PartsTrackerHelpContent } from "@renderer/routes/parts-tracker/PartsTrackerHelpContent.js";
import {
  countBySourceTab,
  draftFromLine,
  isDraftDirty,
  matchesSourceTab,
  SOURCE_TAB_OPTIONS,
  type LineInlineDraft,
} from "@renderer/routes/parts-tracker/partsTrackerInlineEdit.js";

type RiskFilter = "all" | PartLineRisk;

interface Props {
  session: SessionUser;
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

export function PartsTrackerApp({ session }: Props): JSX.Element {
  const toast = useToast();
  const appRole = getPartsTrackerAppRole(session);
  const canImport = canPartsTrackerImport(session);
  const canBulkEdit = canPartsTrackerBulkEdit(session);
  const canEditBomIdentity = canPartsTrackerEditBomIdentity(session);
  const canModalEdit = canPartsTrackerModalEdit(session);
  const canDeleteLine = canPartsTrackerDeleteLine(session);
  const canSetHidden = canPartsTrackerSetHidden(session);
  const canSetArranged = canPartsTrackerSetArranged(session);
  const isViewer = appRole === "viewer";

  const tableActions = useMemo(
    () => ({
      canBulkEdit,
      canSetArranged,
      canEditLine: canModalEdit,
      canDeleteLine,
      canSetHidden,
    }),
    [canBulkEdit, canSetArranged, canModalEdit, canDeleteLine, canSetHidden]
  );

  const [projects, setProjects] = useState<PartsTrackerProjectOption[]>([]);
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
  const [lineSearch, setLineSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [showHidden, setShowHidden] = useState(false);
  const [arrangedFilter, setArrangedFilter] = useState<"all" | "unarranged" | "arranged">("all");
  const [lineSortKey, setLineSortKey] = useState<BomTreeSortKey>("importOrder");
  const [lineSortDir, setLineSortDir] = useState<BomTreeSortDirection>("asc");
  const [sourceTab, setSourceTab] = useState<SourceTabFilter>("all");
  const [editMode, setEditMode] = useState(false);
  const [inlineDrafts, setInlineDrafts] = useState<Record<number, LineInlineDraft>>({});
  const [inlineSaving, setInlineSaving] = useState(false);
  // 5-B: CSV 取込モーダル
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<BomCsvPreviewResult | null>(null);
  const [csvPolicy, setCsvPolicy] = useState<ImportDuplicatePolicy>("updateOnRevision");
  const [csvBusy, setCsvBusy] = useState(false);

  // 非表示理由入力
  const [hidingLine, setHidingLine] = useState<ProjectPartLine | null>(null);
  const [hideReason, setHideReason] = useState("");

  // §8.5.17.1: 前回案件 BOM コピー
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneSources, setCloneSources] = useState<RepeatSourceCandidate[]>([]);
  const [cloneSourceId, setCloneSourceId] = useState("");
  const [cloneIncludeHidden, setCloneIncludeHidden] = useState(true);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneTargetPartNumber, setCloneTargetPartNumber] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const [projectList, supplierList] = await Promise.all([
        invoke<PartsTrackerProjectOption[]>("parts-tracker:projectList"),
        invoke<MasterRow[]>("master:list", { table: "m_suppliers" }),
      ]);
      setProjects(projectList);
      setSuppliers(supplierList.filter((s) => s.isActive));
      const openId = sessionStorage.getItem("parts-tracker:openProjectId");
      if (openId && projectList.some((p) => p.id === openId)) {
        setProjectId(openId);
        sessionStorage.removeItem("parts-tracker:openProjectId");
      } else {
        setProjectId((prev) => prev || projectList[0]?.id || "");
      }
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }, [toast]);

  const refreshSummary = useCallback(async () => {
    if (!projectId) return;
    try {
      const sum = await invoke<ProjectPartSummary>("parts-tracker:summary", {
        seisanProjectId: projectId,
      });
      setSummary(sum);
    } catch {
      /* サマリのみ失敗は握りつぶす */
    }
  }, [projectId]);

  const loadLines = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!projectId) {
        setLines([]);
        setSummary(null);
        setLoading(false);
        return;
      }
      if (!opts?.silent) setLoading(true);
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
        if (!opts?.silent) setLoading(false);
      }
    },
    [projectId, toast]
  );

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadLines();
  }, [loadLines]);

  useEffect(() => {
    setEditMode(false);
    setInlineDrafts({});
    setSourceTab("all");
  }, [projectId]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );

  const linesBeforeSourceTab = useMemo(() => {
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
    return list;
  }, [lines, lineSearch, riskFilter, arrangedFilter, showHidden]);

  const sourceTabCounts = useMemo(
    () => countBySourceTab(linesBeforeSourceTab),
    [linesBeforeSourceTab]
  );

  const filteredLines = useMemo(() => {
    let list = linesBeforeSourceTab.filter((l) => matchesSourceTab(l, sourceTab));
    if (lineSortKey === "importOrder" && lineSortDir === "asc") {
      return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    }
    return sortBomTreeRows(list, lineSortKey, lineSortDir);
  }, [linesBeforeSourceTab, sourceTab, lineSortKey, lineSortDir]);

  const dirtyInlineCount = useMemo(() => {
    let n = 0;
    for (const line of lines) {
      if (isDraftDirty(line, inlineDrafts[line.id])) n++;
    }
    return n;
  }, [lines, inlineDrafts]);

  const hasInlineDraftChanges = dirtyInlineCount > 0;

  const confirmProjectChange = useCallback(
    (nextId: string) => {
      if (nextId === projectId) return true;
      if (editMode && hasInlineDraftChanges) {
        return window.confirm("未保存のインライン編集があります。案件を切り替えますか？");
      }
      return true;
    },
    [projectId, editMode, hasInlineDraftChanges]
  );

  function handleInlineDraftChange(lineId: number, patch: Partial<LineInlineDraft>): void {
    setInlineDrafts((prev) => {
      const line = lines.find((l) => l.id === lineId);
      if (!line) return prev;
      const base = prev[lineId] ?? draftFromLine(line);
      const next: LineInlineDraft = { ...base, ...patch };
      if (next.sourceType !== "purchase") {
        next.supplierId = null;
      }
      return { ...prev, [lineId]: next };
    });
  }

  function requestExitEditMode(): void {
    if (hasInlineDraftChanges) {
      if (!window.confirm("未保存の変更があります。編集を破棄して終了しますか？")) return;
    }
    setEditMode(false);
    setInlineDrafts({});
  }

  function toggleEditMode(): void {
    if (editMode) {
      requestExitEditMode();
      return;
    }
    setEditMode(true);
    setInlineDrafts({});
  }

  async function handleInlineBulkSave(): Promise<void> {
    const updates: LineInlineBatchUpdateItem[] = [];
    for (const line of lines) {
      const draft = inlineDrafts[line.id];
      if (!isDraftDirty(line, draft)) continue;
      const d = draft ?? draftFromLine(line);
      updates.push({
        id: line.id,
        sourceType: d.sourceType,
        supplierId: d.sourceType === "purchase" ? d.supplierId : null,
        status: line.isArranged ? d.status : line.status,
      });
    }
    if (updates.length === 0) {
      toast.push("info", "保存する変更がありません。");
      return;
    }
    setInlineSaving(true);
    try {
      const updated = await invoke<ProjectPartLine[]>("parts-tracker:line:batchUpdate", {
        updates,
      });
      const byId = new Map(updated.map((u) => [u.id, u]));
      setLines((prev) => prev.map((l) => byId.get(l.id) ?? l));
      setEditMode(false);
      setInlineDrafts({});
      await refreshSummary();
      toast.push("success", `${updates.length} 件を保存しました。`);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setInlineSaving(false);
    }
  }

  function openEditLine(line: ProjectPartLine): void {
    setEditing(line);
    setCreating(false);
    setForm({
      seisanProjectId: line.seisanProjectId,
      partNumber: line.partNumber,
      partName: line.partName,
      revision: line.revision,
      quantity: line.quantity,
      sourceType: line.sourceType,
      supplierId: line.supplierId,
      leadTimeDays: line.leadTimeDays,
      requiredDate: line.requiredDate,
      status: line.status,
      note: line.note ?? "",
    });
  }

  async function suggestLeadTime(next: ProjectPartLineUpsertInput): Promise<void> {
    if (!showsProcurementLeadTime(next.sourceType)) {
      setForm((f) => ({ ...f, leadTimeDays: undefined }));
      return;
    }
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
      if (editing) {
        const payload = canEditBomIdentity
          ? { ...form, seisanProjectId: projectId }
          : filterEditorLineUpdateInput({ ...form, seisanProjectId: projectId });
        await invoke("parts-tracker:line:update", { id: editing.id, input: payload });
        toast.push("success", "更新しました。");
      } else {
        await invoke("parts-tracker:line:create", { ...form, seisanProjectId: projectId });
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
      const updated = await invoke<ProjectPartLine>("parts-tracker:line:setArranged", {
        id: line.id,
        arranged: next,
      });
      setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      await refreshSummary();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleToggleHidden(line: ProjectPartLine): Promise<void> {
    try {
      const updated = await invoke<ProjectPartLine>("parts-tracker:line:setHidden", {
        id: line.id,
        hidden: false,
      });
      setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      await refreshSummary();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleConfirmHide(): Promise<void> {
    if (!hidingLine) return;
    const targetId = hidingLine.id;
    try {
      const updated = await invoke<ProjectPartLine>("parts-tracker:line:setHidden", {
        id: targetId,
        hidden: true,
        reason: hideReason || null,
      });
      setHidingLine(null);
      setHideReason("");
      setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      await refreshSummary();
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
          assemblyPath: r.assemblyPath,
          note: r.note,
          csvSortOrder: r.csvSortOrder,
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

  function handleExportCsvDownload(): void {
    if (filteredLines.length === 0) {
      toast.push("info", "エクスポートする行がありません。");
      return;
    }
    const csv = buildBomExportFromLines(filteredLines);
    const name = suggestBomExportFileName({
      projectNo: selectedProject?.projectNo ?? null,
      projectName: selectedProject?.projectName ?? null,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    toast.push("success", `${filteredLines.length} 行を CSV で保存しました。`);
  }

  async function handleExportCopyClipboard(): Promise<void> {
    if (filteredLines.length === 0) {
      toast.push("info", "コピーする行がありません。");
      return;
    }
    const tsv = buildBomExportFromLines(filteredLines, { delimiter: "\t" });
    try {
      await navigator.clipboard.writeText(tsv);
      toast.push(
        "success",
        `${filteredLines.length} 行をコピーしました。Excel 等に貼り付けて印刷できます。`
      );
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  function handlePrintBom(): void {
    if (filteredLines.length === 0) {
      toast.push("info", "印刷する行がありません。");
      return;
    }
    const projectLabel = selectedProject
      ? projectCascadeLabel(selectedProject)
      : "（案件未選択）";
    const ok = openBomPrintWindow(filteredLines, {
      title: "部材管理 — 部品一覧",
      projectLabel,
      lineCount: filteredLines.length,
    });
    if (!ok) {
      toast.push("error", "印刷ウィンドウを開けませんでした。ポップアップを許可してください。");
    }
  }

  async function openCloneModal(): Promise<void> {
    if (!projectId) return;
    setCloneOpen(true);
    setCloneSourceId("");
    setCloneBusy(true);
    try {
      const res = await invoke<SuggestRepeatSourcesResult>(
        "parts-tracker:project:suggestRepeatSources",
        { seisanProjectId: projectId }
      );
      setCloneTargetPartNumber(res.targetPartNumber);
      setCloneSources(res.candidates);
      if (res.candidates.length > 0) {
        setCloneSourceId(res.candidates[0].id);
      }
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
      setCloneOpen(false);
    } finally {
      setCloneBusy(false);
    }
  }

  async function handleCloneCommit(): Promise<void> {
    if (!projectId || !cloneSourceId) {
      toast.push("info", "コピー元案件を選択してください。");
      return;
    }
    const targetLines = summary?.totalLines ?? 0;
    if (targetLines > 0) {
      const ok = window.confirm(
        `先案件に ${targetLines} 件の部品行があります。全て削除してからコピーします。よろしいですか？`
      );
      if (!ok) return;
    }
    setCloneBusy(true);
    try {
      const res = await invoke<CloneBomFromResult>("parts-tracker:project:cloneBomFrom", {
        targetProjectId: projectId,
        sourceProjectId: cloneSourceId,
        includeHidden: cloneIncludeHidden,
        replaceExisting: targetLines > 0,
      });
      toast.push(
        "success",
        `BOM をコピーしました（${res.insertedCount} 行${res.removedCount > 0 ? ` / 削除 ${res.removedCount}` : ""}）`
      );
      setCloneOpen(false);
      setEditMode(false);
      setInlineDrafts({});
      await loadLines();
      await loadProjects();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setCloneBusy(false);
    }
  }

  const modalOpen = creating || editing !== null;
  const defaultRequired = selectedProject?.deadline ?? "";

  const cloneSourcePreview = cloneSources.find((c) => c.id === cloneSourceId);

  return (
    <>
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="w-full space-y-4 px-3 py-4 sm:px-4">
          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
              <HelpCircle size={16} aria-hidden />
              ヘルプ
            </Button>
          </div>

          {isViewer && (
            <div className="rounded-lg border border-border-subtle bg-bg-surface/80 px-4 py-3 text-sm text-fg-muted">
              閲覧者モードです。データの変更はできません。CSV 出力・コピー（印刷用）・印刷、検索・ソート、非表示行の表示切替のみ利用できます。
            </div>
          )}

          <Card className="space-y-4 p-4">
            <ProjectCascadeSelect
              projects={projects}
              value={projectId}
              onChange={setProjectId}
              searchQuery={projectQuery}
              onSearchQueryChange={setProjectQuery}
              beforeChange={confirmProjectChange}
            />
            <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4">
                <Button type="button" variant="secondary" size="sm" onClick={() => void loadLines()} disabled={loading}>
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden />
                  更新
                </Button>
                {canImport && projectId && (
                  <Button type="button" size="sm" onClick={openCreate}>
                    <Plus size={16} aria-hidden />
                    部品行を追加
                  </Button>
                )}
                {canImport && projectId && (
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
                {canImport && projectId && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void openCloneModal()}
                    title="同一親番の過去案件から部品表をコピー（手配・状態は初期化）"
                  >
                    <Copy size={16} aria-hidden />
                    前回案件から BOM コピー
                  </Button>
                )}
                {projectId && filteredLines.length > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleExportCsvDownload}
                      title="表示中の部品表を CSV で保存"
                    >
                      <Download size={16} aria-hidden />
                      CSV 出力
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleExportCopyClipboard()}
                      title="表示中の部品表をタブ区切りでコピー（Excel に貼り付けて印刷）"
                    >
                      <ClipboardCopy size={16} aria-hidden />
                      コピー（印刷用）
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handlePrintBom}
                      title="表示中の部品表を印刷用レイアウトで印刷"
                    >
                      <Printer size={16} aria-hidden />
                      印刷
                    </Button>
                  </>
                )}
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

          </Card>

          {projectId && (
            <>
              <div className="flex flex-wrap gap-1 rounded-lg border border-border-subtle bg-bg-surface p-1">
                {SOURCE_TAB_OPTIONS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      sourceTab === id
                        ? "bg-accent-primary text-bg-base"
                        : "text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                    )}
                    onClick={() => setSourceTab(id)}
                  >
                    {label}
                    <span
                      className={cn(
                        "ml-1.5 tabular-nums",
                        sourceTab === id ? "text-bg-base/80" : "text-fg-subtle"
                      )}
                    >
                      ({sourceTabCounts[id]})
                    </span>
                  </button>
                ))}
              </div>

              {canBulkEdit && (
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2",
                    editMode
                      ? "border-accent-primary/40 bg-accent-primary/5"
                      : "border-border-subtle bg-bg-surface"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={editMode ? "primary" : "secondary"}
                      size="sm"
                      onClick={toggleEditMode}
                    >
                      <PencilLine size={14} aria-hidden />
                      {editMode ? "編集モード ON" : "編集モード"}
                    </Button>
                    {editMode && (
                      <span className="text-sm text-fg-muted">
                        {hasInlineDraftChanges
                          ? `未保存の変更: ${dirtyInlineCount} 件`
                          : "区分・商社・状態（手配済行のみ）をプルダウンで編集"}
                      </span>
                    )}
                  </div>
                  {editMode && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={!hasInlineDraftChanges || inlineSaving}
                        onClick={() => void handleInlineBulkSave()}
                      >
                        一括保存
                        {dirtyInlineCount > 0 ? ` (${dirtyInlineCount})` : ""}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={inlineSaving}
                        onClick={requestExitEditMode}
                      >
                        キャンセル
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex min-w-0 flex-1 flex-col flex-wrap items-end gap-3 sm:flex-row sm:justify-start">
                <div className="relative w-full min-w-[12rem] sm:max-w-md sm:flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                    aria-hidden
                  />
                  <input
                    type="search"
                    placeholder="品番・名称・商社・備考で検索"
                    value={lineSearch}
                    onChange={(e) => setLineSearch(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border-strong bg-bg-surface pl-9 pr-3 text-sm text-fg-primary placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                  />
                </div>
                <div>
                  <span className="mb-1 block text-sm text-fg-subtle">リスク</span>
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
                          "rounded px-2.5 py-1.5 text-sm font-medium sm:px-3",
                          riskFilter === id
                            ? "bg-accent-primary text-bg-base"
                            : "text-fg-muted hover:text-fg-primary"
                        )}
                        onClick={() => setRiskFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-sm text-fg-subtle">手配</span>
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
                          "rounded px-2.5 py-1.5 text-sm font-medium sm:px-3",
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
              </div>
              <div className="flex shrink-0 flex-wrap items-end justify-end gap-3">
                <label className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-fg-muted">
                  <input
                    type="checkbox"
                    checked={showHidden}
                    onChange={(e) => setShowHidden(e.target.checked)}
                    className="h-4 w-4 accent-amber-500"
                  />
                  非表示行も表示
                </label>
                <div className="flex flex-wrap items-end gap-2">
                  <Select
                    label="並び（ツリー維持）"
                    value={lineSortKey}
                    onChange={(e) => setLineSortKey(e.target.value as BomTreeSortKey)}
                    options={[
                      { value: "importOrder", label: "取込順" },
                      { value: "partNumber", label: "品番" },
                      { value: "revision", label: "Rev" },
                      { value: "quantity", label: "個数" },
                      { value: "material", label: "材質" },
                    ]}
                  />
                  <Select
                    label="方向"
                    value={lineSortDir}
                    onChange={(e) => setLineSortDir(e.target.value as BomTreeSortDirection)}
                    options={[
                      { value: "asc", label: "昇順" },
                      { value: "desc", label: "降順" },
                    ]}
                  />
                </div>
              </div>
            </div>
            </>
          )}

          {!projectId ? (
            <Card className="p-8 text-center text-sm text-fg-muted">
              生産案件を選択すると、部品表が表示されます。
            </Card>
          ) : loading && lines.length === 0 ? (
            <Card className="p-8 text-center text-sm text-fg-muted">読み込み中...</Card>
          ) : lines.length === 0 ? (
            <Card className="space-y-3 p-8 text-center">
              <p className="text-sm text-fg-muted">この案件には部品行がまだありません。</p>
              {canImport && (
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
            <Card className="p-0">
              <PartsBomTreeTable
                rows={filteredLines}
                actions={tableActions}
                editMode={editMode}
                drafts={inlineDrafts}
                suppliers={suppliers}
                onDraftChange={canBulkEdit ? handleInlineDraftChange : undefined}
                onSetArranged={(line, next) => void handleSetArranged(line, next)}
                onEdit={openEditLine}
                onToggleHidden={(line) => void handleToggleHidden(line)}
                onHideRequest={(line) => {
                  setHidingLine(line);
                  setHideReason("");
                }}
                onDelete={(line) => void handleDelete(line)}
              />
              <div className="shrink-0 border-t border-border-subtle px-4 py-2 text-sm text-fg-muted">
                全 {filteredLines.length} 件を表示（BOM ツリー・ページ分割なし）
                {lines.length !== filteredLines.length && (
                  <span className="ml-2">／登録 {lines.length} 件</span>
                )}
              </div>
            </Card>
          )}
        </div>
    </main>

      <Modal open={helpOpen} title="部材管理のヘルプ" onClose={() => setHelpOpen(false)} width="xl">
        <PartsTrackerHelpContent variant="main" appRole={appRole} />
      </Modal>

      {/* 5-B: CSV 取込モーダル */}
      <Modal
        open={csvOpen}
        title="BOM CSV 取込（SolidWorks 想定）"
        onClose={() => setCsvOpen(false)}
        width="xl"
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-md border border-border-subtle bg-bg-elevated/40 p-3 text-sm text-fg-muted">
            <p>
              標準8列（符号・品番・名称・Rev・個数・材質・親品番・レベル）を認識します。空欄は
              「-」にします。調達区分・商社は取込後に手入力です。重複ポリシーを選んで取り込んでください。
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
              className="text-sm"
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
              <div className="flex flex-wrap gap-2 border-b border-border-subtle px-3 py-2 text-sm">
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
                  <span className="text-sm text-fg-muted">
                    未マッチ商社: {csvPreview.unmatchedSupplierNames.join(", ")}
                  </span>
                )}
              </div>
              <div className="max-h-80 overflow-auto text-sm">
                <table className="w-full">
                  <thead className="sticky top-0 bg-bg-elevated text-sm uppercase tracking-wider">
                    <tr>
                      <th className="px-2 py-1 text-left">#</th>
                      <th className="px-2 py-1 text-left">品番</th>
                      <th className="px-2 py-1 text-left">Rev</th>
                      <th className="px-2 py-1 text-left">名称</th>
                      <th className="px-2 py-1 text-right">数量</th>
                      <th className="px-2 py-1 text-left">区分</th>
                      <th className="px-2 py-1 text-left">商社</th>
                      <th className="px-2 py-1 text-left">Lv</th>
                      <th className="px-2 py-1 text-left">親品番</th>
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
                          <td className="px-2 py-1 font-mono">{r.revision}</td>
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
                          <td className="px-2 py-1 font-mono text-sm">
                            {r.parentAssemblyPartNumber ?? "—"}
                          </td>
                          <td className="px-2 py-1">
                            {r.issues.map((i, idx) => (
                              <span
                                key={idx}
                                className={cn(
                                  "block text-sm",
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
                  <div className="px-3 py-2 text-sm text-fg-subtle">
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
          {canEditBomIdentity && editing && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm leading-relaxed text-amber-950 dark:text-amber-100">
              品番・部品名称・Rev・数量の変更は原則行わず、<strong>生産技術に最新の BOM CSV 取込</strong>
              を依頼してください。やむを得ず手修正する場合のみ保存してください。
            </div>
          )}
          {canEditBomIdentity && creating && (
            <div className="rounded-md border border-border-subtle bg-bg-elevated/50 px-3 py-2 text-sm text-fg-muted">
              手動追加は管理者向けです。通常は BOM CSV 取込または前回案件コピーを利用してください。調達区分・状態は一括編集モードで設定します。
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
          {canEditBomIdentity && (
            <>
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
            </>
          )}
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
          {showsProcurementLeadTime(form.sourceType) && (
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
              placeholder="空欄で標準 LT を自動提案（購入・支給のみ）"
            />
          )}
          <TextField
            label="必要着日"
            type="date"
            value={form.requiredDate}
            onChange={(e) => setForm((f) => ({ ...f, requiredDate: e.target.value }))}
            required={canEditBomIdentity || creating}
          />
          {defaultRequired && !editing && canEditBomIdentity && (
            <p className="text-sm text-fg-muted sm:col-span-2">
              案件納期（{defaultRequired}）を初期値にしています。部品ごとに調整してください。
            </p>
          )}
          <div className="sm:col-span-2">
            <TextField
              label="備考"
              value={form.note ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
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

      <Modal
        open={cloneOpen}
        title="前回案件から BOM をコピー"
        onClose={() => setCloneOpen(false)}
        width="md"
      >
        {cloneBusy && !cloneSources.length ? (
          <p className="text-sm text-fg-muted">候補を読み込み中...</p>
        ) : (
          <div className="space-y-4 text-sm">
            {cloneTargetPartNumber ? (
              <p className="text-fg-muted">
                対象の親番: <span className="font-mono text-fg-primary">{cloneTargetPartNumber}</span>
                。同一親番の過去案件からコピーします（手配済・状態・発注日は初期化）。
              </p>
            ) : (
              <p className="text-state-warning">
                この案件に親番が未設定のため、候補がありません。生産ボードで親番を設定してください。
              </p>
            )}
            <Select
              label="コピー元（過去案件）"
              value={cloneSourceId}
              onChange={(e) => setCloneSourceId(e.target.value)}
              disabled={cloneSources.length === 0}
              options={[
                { value: "", label: "（案件を選択）" },
                ...cloneSources.map((c) => ({
                  value: c.id,
                  label: projectCascadeLabel({
                    ...c,
                    partNumber: cloneTargetPartNumber,
                  }),
                })),
              ]}
            />
            {cloneSourcePreview && (
              <p className="text-fg-subtle">
                コピー元: {cloneSourcePreview.lineCount} 行（表示行ベース）
              </p>
            )}
            <label className="flex items-center gap-2 text-fg-muted">
              <input
                type="checkbox"
                checked={cloneIncludeHidden}
                onChange={(e) => setCloneIncludeHidden(e.target.checked)}
                className="rounded border-border-strong"
              />
              非表示行もコピーする
            </label>
            {(summary?.totalLines ?? 0) > 0 && (
              <p className="rounded-md border border-state-warning/40 bg-state-warning/10 px-3 py-2 text-state-warning">
                先案件に既存の部品行があります。確定時は全置換（既存行を削除してからコピー）します。
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCloneOpen(false)}>
                キャンセル
              </Button>
              <Button
                type="button"
                disabled={cloneBusy || !cloneSourceId}
                onClick={() => void handleCloneCommit()}
              >
                {cloneBusy ? "コピー中..." : "コピーを実行"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
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
        "rounded-lg border px-3 py-1.5 text-sm",
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

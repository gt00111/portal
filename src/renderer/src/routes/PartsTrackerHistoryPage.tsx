import { ClipboardCopy, Download, ExternalLink, HelpCircle, Printer, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { BomCsvImportBatchRow } from "@shared/partsTrackerCsvFormat.js";
import {
  buildBomExportFromLines,
  suggestBomExportFileName,
} from "@shared/partsTrackerCsvFormat.js";
import type { PartsTrackerHistoryEntry, ProjectPartLine } from "@shared/partsTracker.js";
import { getPartsTrackerAppRole } from "@shared/partsTrackerAuth.js";
import type { SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { DataTable, type Column } from "@renderer/components/ui/DataTable.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import { openBomPrintWindow } from "@renderer/routes/parts-tracker/partsBomPrint.js";
import { PartsBomTreeTable } from "@renderer/routes/parts-tracker/PartsBomTreeTable.js";
import { PartsTrackerHelpContent } from "@renderer/routes/parts-tracker/PartsTrackerHelpContent.js";
import {
  filterProjectsBySearch,
  projectCascadeLabel,
  uniqueCompanies,
  uniquePartNumbers,
} from "@renderer/routes/parts-tracker/projectCascade.js";
import type { PartsTrackerProjectOption } from "@shared/partsTracker.js";

interface Props {
  session: SessionUser;
}

export function PartsTrackerHistoryPage({ session }: Props): JSX.Element {
  const toast = useToast();
  const appRole = getPartsTrackerAppRole(session);
  const [helpOpen, setHelpOpen] = useState(false);
  const [entries, setEntries] = useState<PartsTrackerHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [partKeyFilter, setPartKeyFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLines, setDetailLines] = useState<ProjectPartLine[]>([]);
  const [detailBatches, setDetailBatches] = useState<BomCsvImportBatchRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadIndex = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<PartsTrackerHistoryEntry[]>("parts-tracker:history:index");
      setEntries(list);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  const projectOptions: PartsTrackerProjectOption[] = useMemo(
    () =>
      entries.map((e) => ({
        id: e.projectId,
        projectNo: e.projectNo,
        projectName: e.projectName,
        companyName: e.companyName,
        deadline: e.deadline,
        partNumber: e.partNumber,
        lineCount: e.visibleLines,
      })),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    let list = filterProjectsBySearch(
      entries.map((e) => ({
        id: e.projectId,
        projectNo: e.projectNo,
        projectName: e.projectName,
        companyName: e.companyName,
        deadline: e.deadline,
        partNumber: e.partNumber,
        lineCount: e.visibleLines,
      })),
      search
    ).map((p) => entries.find((e) => e.projectId === p.id)!);

    if (companyFilter) {
      list = list.filter((e) => (e.companyName.trim() || "（客先なし）") === companyFilter);
    }
    if (partKeyFilter) {
      list = list.filter((e) => {
        const key = (e.partNumber ?? "").trim() || "__none__";
        return key === partKeyFilter || (partKeyFilter === "__none__" && !e.partNumber?.trim());
      });
    }
    return list;
  }, [entries, search, companyFilter, partKeyFilter]);

  const companies = useMemo(() => uniqueCompanies(projectOptions), [projectOptions]);

  const selected = useMemo(
    () => entries.find((e) => e.projectId === selectedId) ?? null,
    [entries, selectedId]
  );

  const sortedDetailLines = useMemo(
    () => [...detailLines].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [detailLines]
  );

  const loadDetail = useCallback(
    async (projectId: string) => {
      setDetailLoading(true);
      try {
        const [lines, batches] = await Promise.all([
          invoke<ProjectPartLine[]>("parts-tracker:line:list", {
            seisanProjectId: projectId,
            includeHidden: true,
          }),
          invoke<BomCsvImportBatchRow[]>("parts-tracker:import:batches", {
            seisanProjectId: projectId,
          }),
        ]);
        setDetailLines(lines);
        setDetailBatches(batches);
      } catch (err) {
        toast.push("error", err instanceof Error ? err.message : String(err));
      } finally {
        setDetailLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (!selectedId) {
      setDetailLines([]);
      setDetailBatches([]);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const columns = useMemo<Array<Column<PartsTrackerHistoryEntry>>>(
    () => [
      {
        key: "company",
        header: "客先",
        render: (e) => e.companyName,
      },
      {
        key: "part",
        header: "親番",
        render: (e) => (
          <span className="font-mono text-sm">{e.partNumber?.trim() || "—"}</span>
        ),
      },
      {
        key: "project",
        header: "案件",
        render: (e) => (
          <div>
            <div className="font-medium">
              {e.projectNo ? `${e.projectNo} · ` : ""}
              {e.projectName ?? "（名称未設定）"}
            </div>
            <div className="text-fg-subtle">納期 {e.deadline}</div>
          </div>
        ),
      },
      {
        key: "lines",
        header: "部品行",
        width: "100px",
        render: (e) => (
          <span className="tabular-nums">
            {e.visibleLines} / {e.totalLines}
            {e.hiddenLines > 0 && (
              <span className="text-fg-subtle"> （非表示 {e.hiddenLines}）</span>
            )}
          </span>
        ),
      },
      {
        key: "import",
        header: "最終 CSV 取込",
        render: (e) =>
          e.lastImportAt ? (
            <div className="text-sm">
              <div>{e.lastImportAt.slice(0, 16).replace("T", " ")}</div>
              <div className="truncate text-fg-subtle" title={e.lastImportFileName ?? undefined}>
                {e.lastImportFileName ?? "—"}
                {e.lastImportRowCount != null ? ` (${e.lastImportRowCount}行)` : ""}
              </div>
            </div>
          ) : (
            <span className="text-fg-subtle">—</span>
          ),
      },
      {
        key: "updated",
        header: "最終更新",
        width: "140px",
        render: (e) => (
          <span className="text-sm text-fg-muted">
            {e.lastUpdatedAt?.slice(0, 16).replace("T", " ") ?? "—"}
          </span>
        ),
      },
    ],
    []
  );

  const selectedProjectLabel = useMemo(() => {
    if (!selected) return "";
    return projectCascadeLabel({
      id: selected.projectId,
      projectNo: selected.projectNo,
      projectName: selected.projectName,
      companyName: selected.companyName,
      deadline: selected.deadline,
      partNumber: selected.partNumber,
      lineCount: selected.visibleLines,
    });
  }, [selected]);

  function handleExportDetail(): void {
    if (detailLines.length === 0 || !selected) return;
    const csv = buildBomExportFromLines(detailLines);
    const name = suggestBomExportFileName({
      projectNo: selected.projectNo,
      projectName: selected.projectName,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    toast.push("success", "CSV を保存しました。");
  }

  async function handleCopyDetail(): Promise<void> {
    if (detailLines.length === 0) {
      toast.push("info", "コピーする行がありません。");
      return;
    }
    const tsv = buildBomExportFromLines(detailLines, { delimiter: "\t" });
    try {
      await navigator.clipboard.writeText(tsv);
      toast.push("success", `${detailLines.length} 行をコピーしました。`);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  function handlePrintDetail(): void {
    if (detailLines.length === 0 || !selected) {
      toast.push("info", "印刷する行がありません。");
      return;
    }
    const ok = openBomPrintWindow(detailLines, {
      title: "部材管理 — 変更履歴（部品スナップショット）",
      projectLabel: selectedProjectLabel,
      lineCount: detailLines.length,
    });
    if (!ok) {
      toast.push("error", "印刷ウィンドウを開けませんでした。ポップアップを許可してください。");
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      <div className="w-full space-y-4 px-3 py-4 sm:px-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
            <HelpCircle size={16} aria-hidden />
            ヘルプ
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => void loadIndex()}>
            再読み込み
          </Button>
        </div>

        <Card className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative sm:col-span-3">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                aria-hidden
              />
              <input
                type="search"
                placeholder="製番・案件名・客先で検索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-lg border border-border-strong bg-bg-surface pl-9 pr-3 text-sm"
              />
            </div>
            <label className="text-sm text-fg-muted">
              客先
              <select
                className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-bg-surface px-2 text-sm"
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
              >
                <option value="">すべて</option>
                {companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-fg-muted sm:col-span-2">
              親番
              <select
                className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-bg-surface px-2 text-sm"
                value={partKeyFilter}
                onChange={(e) => setPartKeyFilter(e.target.value)}
                disabled={!companyFilter}
              >
                <option value="">すべて</option>
                {companyFilter &&
                  uniquePartNumbers(projectOptions, companyFilter).map((k) => (
                    <option key={k} value={k}>
                      {k === "__none__" ? "（親番なし）" : k}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <p className="text-sm text-fg-muted">
            {loading ? "読み込み中..." : `${filteredEntries.length} 件の案件（部品データあり）`}
          </p>

          <DataTable
            columns={columns}
            rows={filteredEntries}
            keyOf={(row) => row.projectId}
            onRowClick={(row) => setSelectedId(row.projectId)}
            rowClassName={(row) =>
              row.projectId === selectedId ? "bg-accent-primary/10" : undefined
            }
            empty="部品データのある案件がありません。"
          />
        </Card>

        {selected && (
          <Card className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-fg-primary">案件詳細</h3>
                <p className="mt-1 text-sm text-fg-muted">{selectedProjectLabel}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={detailLoading || detailLines.length === 0}
                  onClick={handleExportDetail}
                >
                  <Download size={16} aria-hidden />
                  CSV 出力
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={detailLoading || detailLines.length === 0}
                  onClick={() => void handleCopyDetail()}
                >
                  <ClipboardCopy size={16} aria-hidden />
                  コピー（印刷用）
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={detailLoading || detailLines.length === 0}
                  onClick={handlePrintDetail}
                >
                  <Printer size={16} aria-hidden />
                  印刷
                </Button>
                <Link
                  to="/apps/parts-tracker"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-strong bg-bg-elevated px-2.5 text-sm font-medium text-fg-primary hover:bg-bg-elevated/80"
                  onClick={() => {
                    sessionStorage.setItem("parts-tracker:openProjectId", selected.projectId);
                  }}
                >
                  <ExternalLink size={16} aria-hidden />
                  部品一覧で開く
                </Link>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium text-fg-primary">CSV 取込履歴</h4>
              {detailLoading ? (
                <p className="text-sm text-fg-muted">読み込み中...</p>
              ) : detailBatches.length === 0 ? (
                <p className="text-sm text-fg-muted">
                  CSV 取込履歴はありません（手入力・前回案件コピーのみの可能性があります）。
                </p>
              ) : (
                <div className="overflow-auto rounded-md border border-border-subtle">
                  <table className="w-full text-sm">
                    <thead className="bg-bg-elevated text-left text-sm uppercase tracking-wider text-fg-muted">
                      <tr>
                        <th className="px-3 py-2">日時</th>
                        <th className="px-3 py-2">ファイル</th>
                        <th className="px-3 py-2 text-right">行数</th>
                        <th className="px-3 py-2">実行者</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailBatches.map((b) => (
                        <tr key={b.id} className="border-t border-border-subtle">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {b.createdAt.slice(0, 16).replace("T", " ")}
                          </td>
                          <td className="px-3 py-2">{b.fileName ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.rowCount}</td>
                          <td className="px-3 py-2">{b.importedByUsername ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium text-fg-primary">
                部品スナップショット（{detailLines.length} 行・読み取り専用）
              </h4>
              {detailLoading ? (
                <p className="text-sm text-fg-muted">読み込み中...</p>
              ) : sortedDetailLines.length === 0 ? (
                <p className="text-sm text-fg-muted">部品行がありません。</p>
              ) : (
                <Card className="p-0">
                  <PartsBomTreeTable
                    rows={sortedDetailLines}
                    actions={{
                      canBulkEdit: false,
                      canSetArranged: false,
                      canEditLine: false,
                      canDeleteLine: false,
                      canSetHidden: false,
                    }}
                    onSetArranged={() => undefined}
                    onEdit={() => undefined}
                    onToggleHidden={() => undefined}
                    onHideRequest={() => undefined}
                    onDelete={() => undefined}
                  />
                  <div className="border-t border-border-subtle px-4 py-2 text-sm text-fg-muted">
                    全 {sortedDetailLines.length} 件（BOM ツリー・ページ分割なし）
                  </div>
                </Card>
              )}
            </div>
          </Card>
        )}
      </div>

      <Modal open={helpOpen} title="変更履歴のヘルプ" onClose={() => setHelpOpen(false)} width="lg">
        <PartsTrackerHelpContent variant="history" appRole={appRole} />
      </Modal>
    </main>
  );
}

import { Download, FileText, FolderOpen, HelpCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AppRole } from "@shared/auth.js";
import { canWrite } from "@shared/auth.js";
import type { ProjectFile, ProjectFileWithProject } from "@shared/seisan/projectFile.js";
import { SEISAN_CHANNELS } from "@shared/seisan/channels.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import { cn } from "@renderer/lib/cn.js";
import { ObsoleteOverlay } from "@renderer/routes/drawing-library/ObsoleteOverlay.js";
import {
  DEFAULT_DRAWING_LIST_PAGE_SIZE,
  DRAWING_LIST_PAGE_SIZES,
  type DrawingListPageSize,
} from "@renderer/routes/drawing-library/drawingListPageSize.js";
import { PdfCardThumbnail } from "@renderer/routes/drawing-library/PdfJsViewer.js";
import {
  CUSTOMER_DRAWINGS_TAB_HELP,
  DRAWING_LIBRARY_OVERVIEW,
} from "@renderer/routes/drawing-library/drawingLibraryHelpCopy.js";

interface Props {
  role: AppRole;
}

const SEISAN_SORT_OPTIONS: { id: string; label: string }[] = [
  { id: "updated_at|desc", label: "更新日（新しい順）" },
  { id: "updated_at|asc", label: "更新日（古い順）" },
  { id: "file_name|asc", label: "ファイル名（A→Z）" },
  { id: "file_name|desc", label: "ファイル名（Z→A）" },
  { id: "project_no|asc", label: "案件番号（A→Z）" },
  { id: "project_no|desc", label: "案件番号（Z→A）" },
  { id: "company_id|asc", label: "客先（A→Z）" },
  { id: "company_id|desc", label: "客先（Z→A）" },
  { id: "model_type|asc", label: "機種（A→Z）" },
  { id: "model_type|desc", label: "機種（Z→A）" },
  { id: "part_number|asc", label: "図面番号・品番（A→Z）" },
  { id: "part_number|desc", label: "図面番号・品番（Z→A）" },
  { id: "revision|asc", label: "リビジョン（A→Z）" },
  { id: "revision|desc", label: "リビジョン（Z→A）" },
  { id: "project_name|asc", label: "名称（A→Z）" },
  { id: "project_name|desc", label: "名称（Z→A）" },
];

function distinctSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v && String(v).trim())))].sort((a, b) =>
    a.localeCompare(b, "ja")
  );
}

/** カード主行: 客先_機種_図面番号(品番)_名称_リビジョン（空は除く・全部空ならファイル名） */
function customerDrawingCardPrimaryLabel(row: ProjectFileWithProject): string {
  const parts = [
    row.company_id?.trim(),
    row.model_type?.trim(),
    row.part_number?.trim(),
    row.project_name?.trim(),
    row.revision?.trim(),
  ].filter((s): s is string => Boolean(s));
  return parts.length > 0 ? parts.join("_") : row.file_name;
}

function sortSeisanRows(rows: ProjectFileWithProject[], sortId: string): ProjectFileWithProject[] {
  const [rawKey, rawOrd] = sortId.split("|");
  const ord = rawOrd === "asc" ? 1 : -1;
  const key = rawKey ?? "updated_at";
  const cmpJa = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? "").localeCompare(b ?? "", "ja") * ord;
  const cmpDate = (a: string, b: string) => {
    const ta = new Date(a).getTime();
    const tb = new Date(b).getTime();
    return (ta - tb) * ord;
  };
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (key) {
      case "file_name":
        return cmpJa(a.file_name, b.file_name);
      case "project_no":
        return cmpJa(a.project_no, b.project_no);
      case "company_id":
        return cmpJa(a.company_id, b.company_id);
      case "model_type":
        return cmpJa(a.model_type, b.model_type);
      case "part_number":
        return cmpJa(a.part_number, b.part_number);
      case "revision":
        return cmpJa(a.revision, b.revision);
      case "project_name":
        return cmpJa(a.project_name, b.project_name);
      case "updated_at":
      default:
        return cmpDate(a.updated_at, b.updated_at);
    }
  });
  return copy;
}

function useSeisanPdfThumbDataUrl(fileId: string, isPdf: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isPdf || !fileId) {
      setUrl(null);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const { dataUrl } = await invoke<{ dataUrl: string }>(SEISAN_CHANNELS.file.readAsDataUrl, { id: fileId });
        if (alive) setUrl(dataUrl);
      } catch {
        if (alive) setUrl(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fileId, isPdf]);
  return url;
}

function CustomerDrawingCard({
  row,
  writable,
  onOpenDetail,
  onToggleObsolete,
}: {
  row: ProjectFileWithProject;
  writable: boolean;
  onOpenDetail: (r: ProjectFileWithProject) => void;
  onToggleObsolete: (id: string, next: boolean) => void;
}): JSX.Element {
  const isPdf = row.file_ext?.toLowerCase() === ".pdf";
  const thumbDataUrl = useSeisanPdfThumbDataUrl(row.id, isPdf);
  const obsolete = Number(row.is_obsolete) === 1;

  return (
    <button
      type="button"
      onClick={() => onOpenDetail(row)}
      className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface text-left text-fg-primary shadow-sm transition hover:border-accent-secondary/50 hover:shadow-md"
    >
      <ObsoleteOverlay show={obsolete} />
      <div className="relative flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden bg-bg-elevated/40">
        {isPdf ? (
          <PdfCardThumbnail dataUrl={thumbDataUrl} className="h-full w-full rounded-none border-0 bg-transparent" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileText className="h-16 w-16 text-fg-subtle/50" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <p className="line-clamp-2 font-mono text-xs font-medium leading-snug text-fg-primary">
          {customerDrawingCardPrimaryLabel(row)}
        </p>
        <p className="line-clamp-2 font-mono text-[11px] text-fg-primary">{row.file_name}</p>
        {row.project_no ? (
          <p className="text-[11px] text-fg-primary">案件 {row.project_no}</p>
        ) : null}
        <p className="text-[11px] text-fg-muted">更新 {row.updated_at}</p>
        <label
          className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-fg-primary"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={obsolete}
            disabled={!writable}
            onChange={(e): void => {
              void onToggleObsolete(row.id, e.target.checked);
            }}
            className="rounded border-border-strong"
          />
          旧図面
        </label>
      </div>
    </button>
  );
}

export function SeisanProvidedFilesTab({ role }: Props): JSX.Element {
  const toast = useToast();
  const writable = canWrite(role);
  const [rows, setRows] = useState<ProjectFileWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [fcCompany, setFcCompany] = useState("");
  const [fcModel, setFcModel] = useState("");
  const [fcPart, setFcPart] = useState("");
  const [sortId, setSortId] = useState("updated_at|desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<DrawingListPageSize>(DEFAULT_DRAWING_LIST_PAGE_SIZE);

  const [detailContext, setDetailContext] = useState<{
    projectId: string;
    meta: ProjectFileWithProject;
    focusFileId: string;
  } | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<ProjectFileWithProject[]>("drawing-library:listSeisanCustomerDrawings", {});
      setRows(data);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detailContext) {
      setProjectFiles([]);
      return;
    }
    setDetailLoading(true);
    void (async () => {
      try {
        const list = await invoke<ProjectFile[]>(SEISAN_CHANNELS.file.listByProject, {
          project_id: detailContext.projectId,
        });
        setProjectFiles(list);
      } catch (err) {
        toast.push("error", err instanceof Error ? err.message : String(err));
        setProjectFiles([]);
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [detailContext, toast]);

  const cascade = useMemo(() => {
    const companies = distinctSorted(rows.map((r) => r.company_id));
    const models = fcCompany
      ? distinctSorted(rows.filter((r) => r.company_id === fcCompany).map((r) => r.model_type))
      : [];
    const partNumbers =
      fcCompany && fcModel
        ? distinctSorted(
            rows
              .filter((r) => r.company_id === fcCompany && r.model_type === fcModel)
              .map((r) => r.part_number)
          )
        : [];
    return { companies, models, partNumbers };
  }, [rows, fcCompany, fcModel]);

  const filtered = useMemo(() => {
    let list = rows;
    if (fcCompany) list = list.filter((r) => r.company_id === fcCompany);
    if (fcModel) list = list.filter((r) => r.model_type === fcModel);
    if (fcPart) list = list.filter((r) => r.part_number === fcPart);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [
          r.file_name,
          r.project_no,
          r.company_id,
          r.model_type,
          r.part_number,
          r.revision,
          r.project_name,
          r.group_id,
          r.file_ext,
        ]
          .filter((v): v is string => typeof v === "string")
          .some((v) => v.toLowerCase().includes(q))
      );
    }
    return sortSeisanRows(list, sortId);
  }, [rows, fcCompany, fcModel, fcPart, query, sortId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [query, fcCompany, fcModel, fcPart, sortId, pageSize]);

  async function handleOpen(id: string): Promise<void> {
    try {
      await invoke<void>(SEISAN_CHANNELS.file.open, { id });
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSaveCopy(id: string): Promise<void> {
    try {
      await invoke<{ path: string }>(SEISAN_CHANNELS.file.saveCopy, { id });
      toast.push("success", "保存しました。");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("キャンセル")) return;
      toast.push("error", msg);
    }
  }

  async function toggleObsolete(id: string, isObsolete: boolean): Promise<void> {
    if (!writable) return;
    try {
      await invoke(SEISAN_CHANNELS.file.setObsolete, { id, isObsolete });
      toast.push("success", isObsolete ? "旧図面にしました。" : "最新として扱います。");
      await load();
      setProjectFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, is_obsolete: isObsolete ? 1 : 0 } : f))
      );
      setDetailContext((d) =>
        d && id === d.focusFileId
          ? { ...d, meta: { ...d.meta, is_obsolete: isObsolete ? 1 : 0 } }
          : d
      );
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  function openDetail(row: ProjectFileWithProject): void {
    setDetailContext({ projectId: row.project_id, meta: row, focusFileId: row.id });
  }

  function closeDetail(): void {
    setDetailContext(null);
    setProjectFiles([]);
  }

  const detailAnyObsolete =
    detailContext != null && Number(detailContext.meta.is_obsolete) === 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
          <HelpCircle size={16} aria-hidden />
          ヘルプ
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          更新
        </Button>
      </div>

      <Modal open={helpOpen} title="図面ライブラリ（顧客図面）のヘルプ" onClose={() => setHelpOpen(false)} width="lg">
        <div className="space-y-4 text-sm leading-relaxed text-fg-primary">
          <p>{DRAWING_LIBRARY_OVERVIEW}</p>
          <p>{CUSTOMER_DRAWINGS_TAB_HELP}</p>
        </div>
      </Modal>

      <input
        type="search"
        placeholder="ファイル名・案件・リビジョン・客先・図面番号(品番) など"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-10 w-full rounded-lg border border-border-strong bg-bg-surface px-3 text-sm placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[140px] flex-col gap-1 text-xs text-fg-muted">
          客先で絞る
          <select
            value={fcCompany}
            onChange={(e) => {
              setFcCompany(e.target.value);
              setFcModel("");
              setFcPart("");
            }}
            className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg"
          >
            <option value="">（すべて）</option>
            {cascade.companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[140px] flex-col gap-1 text-xs text-fg-muted">
          機種で絞る
          <select
            value={fcModel}
            disabled={!fcCompany}
            onChange={(e) => {
              setFcModel(e.target.value);
              setFcPart("");
            }}
            className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg disabled:opacity-50"
          >
            <option value="">（すべて）</option>
            {cascade.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[160px] flex-col gap-1 text-xs text-fg-muted">
          図面番号(品番)で絞る
          <select
            value={fcPart}
            disabled={!fcCompany || !fcModel}
            onChange={(e) => setFcPart(e.target.value)}
            className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg disabled:opacity-50"
          >
            <option value="">（すべて）</option>
            {cascade.partNumbers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-fg-muted">
          並び順
          <select
            value={sortId}
            onChange={(e) => setSortId(e.target.value)}
            className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg"
          >
            {SEISAN_SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="py-8 text-center text-fg-muted">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-bg-surface/60 py-8 text-center text-sm text-fg-muted">
          {rows.length === 0 ? "提供ファイルがありません。" : "条件に一致する行がありません。"}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginatedRows.map((r) => (
              <CustomerDrawingCard
                key={r.id}
                row={r}
                writable={writable}
                onOpenDetail={openDetail}
                onToggleObsolete={(id, next) => void toggleObsolete(id, next)}
              />
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-fg-muted">
              {filtered.length} 件中 {page}/{totalPages} ページ
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-fg-muted">
                <span className="whitespace-nowrap">表示件数</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v === 20 || v === 50 || v === 100) {
                      setPageSize(v);
                    }
                  }}
                  className="h-9 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg-primary"
                >
                  {DRAWING_LIST_PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n} 件
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  前へ
                </Button>
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
          </div>
        </>
      )}

      {detailContext && (
        <Modal open title="案件の提供ファイル" onClose={closeDetail} width="full">
          <div className="relative flex min-h-[50vh] flex-col gap-5">
            <div className="border-b border-border-subtle pb-4 text-sm text-fg-primary">
              <p className="text-base font-semibold text-fg-primary">
                {detailContext.meta.project_name ?? "無題の案件"}
              </p>
              <p className="mt-1 text-xs text-fg-primary">
                案件 {detailContext.meta.project_no ?? "—"} ・ {detailContext.meta.company_id ?? "—"} ・ Rev.{" "}
                {detailContext.meta.revision ?? "—"}
              </p>
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-fg-primary">
                <input
                  type="checkbox"
                  checked={detailAnyObsolete}
                  disabled={!writable}
                  onChange={(e) => void toggleObsolete(detailContext.focusFileId, e.target.checked)}
                  className="rounded border-border-strong"
                />
                このファイルを旧図面として表示（一覧カードにオーバーレイ）
              </label>
            </div>

            {detailLoading ? (
              <p className="text-sm text-fg-muted">読み込み中…</p>
            ) : (
              <div className="min-h-0 flex-1 border-t border-border-subtle">
                {projectFiles.map((f) => {
                  const obs = Number(f.is_obsolete) === 1;
                  const focus = f.id === detailContext.focusFileId;
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "relative border-b border-border-subtle py-4 last:border-b-0",
                        focus && "bg-accent-secondary/[0.07]"
                      )}
                    >
                      <ObsoleteOverlay show={obs} />
                      <div className="relative z-[1] flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sm font-medium text-fg-primary">{f.file_name}</p>
                          <p className="text-[11px] text-fg-muted">
                            更新 {f.updated_at} {obs ? "・旧図面" : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="secondary" size="sm" onClick={() => void handleOpen(f.id)}>
                            <FolderOpen size={14} />
                            開く
                          </Button>
                          <Button type="button" variant="secondary" size="sm" onClick={() => void handleSaveCopy(f.id)}>
                            <Download size={14} />
                            保存
                          </Button>
                          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-primary">
                            <input
                              type="checkbox"
                              checked={obs}
                              disabled={!writable}
                              onChange={(e) => void toggleObsolete(f.id, e.target.checked)}
                              className="rounded border-border-strong"
                            />
                            旧図面
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

import { Download, FileText, HelpCircle, PencilLine, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getAppRole } from "@shared/auth.js";
import {
  buildCurrentDrawingIdMap,
  isCurrentDrawing,
  sortByRevisionDesc,
} from "@shared/drawingRevisionSort.js";
import type {
  DrawingListParams,
  DrawingListResult,
  DrawingListSortColumn,
  DrawingUpsertInput,
  DrawingWorkCascadeResult,
  LibCommentRow,
  LibDrawingListItem,
  LibDrawingRow,
  LibEdrawingsFileRow,
  PickedWorkPdf,
  WorkBatchCreateInput,
  WorkBatchCreateResult,
} from "@shared/drawingLibrary.js";
import type { MasterRow } from "@shared/master.js";
import type { SkuRow } from "@shared/sku.js";
import type { SessionUser } from "@shared/types.js";

const WORK_CATEGORY_SCOPE = "drawing-library/work" as const;

import { Button } from "@renderer/components/ui/Button.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { Select } from "@renderer/components/ui/Select.js";
import { TextField } from "@renderer/components/ui/TextField.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";
import { cn } from "@renderer/lib/cn.js";
import { ObsoleteOverlay } from "@renderer/routes/drawing-library/ObsoleteOverlay.js";
import {
  DEFAULT_DRAWING_LIST_PAGE_SIZE,
  DRAWING_LIST_PAGE_SIZES,
  type DrawingListPageSize,
} from "@renderer/routes/drawing-library/drawingListPageSize.js";
import {
  DrawingLibraryHelpContent,
  drawingLibraryHelpTitle,
} from "@renderer/routes/drawing-library/DrawingLibraryHelpContent.js";
import { PdfCardThumbnail, PdfJsViewer } from "@renderer/routes/drawing-library/PdfJsViewer.js";
import { CurrentRevisionBadge } from "@renderer/routes/drawing-library/workDrawingUi.js";

interface Props {
  session: SessionUser;
  writable: boolean;
}

const DRAWING_TYPE = "work" as const;

const WORK_SORT_OPTIONS: { id: string; label: string }[] = [
  { id: "updated_at|desc", label: "更新日（新しい順）" },
  { id: "updated_at|asc", label: "更新日（古い順）" },
  { id: "customer_name|asc", label: "客先（A→Z）" },
  { id: "customer_name|desc", label: "客先（Z→A）" },
  { id: "model|asc", label: "機種（A→Z）" },
  { id: "model|desc", label: "機種（Z→A）" },
  { id: "product_name|asc", label: "図面番号・品番（A→Z）" },
  { id: "product_name|desc", label: "図面番号・品番（Z→A）" },
  { id: "revision|asc", label: "リビジョン（A→Z）" },
  { id: "revision|desc", label: "リビジョン（Z→A）" },
  { id: "title|asc", label: "名称（A→Z）" },
  { id: "title|desc", label: "名称（Z→A）" },
];

function parseWorkSortId(sortId: string): { sortBy: DrawingListSortColumn; sortOrder: "asc" | "desc" } {
  const [col, ord] = sortId.split("|");
  const sortOrder = ord === "asc" ? "asc" : "desc";
  const allowed: DrawingListSortColumn[] = [
    "updated_at",
    "customer_name",
    "model",
    "product_name",
    "revision",
    "title",
  ];
  const sortBy = (allowed.includes(col as DrawingListSortColumn) ? col : "updated_at") as DrawingListSortColumn;
  return { sortBy, sortOrder };
}

/** カード主行: 客先_機種_図面番号(品番)_名称_リビジョン（空は除く・全部空なら名称） */
function workDrawingCardPrimaryLabel(row: LibDrawingRow): string {
  const partNum = row.product_name?.trim() || row.drawing_number?.trim();
  const parts = [
    row.customer_name?.trim(),
    row.model?.trim(),
    partNum,
    row.title?.trim(),
    row.revision?.trim(),
  ].filter((s): s is string => Boolean(s));
  return parts.length > 0 ? parts.join("_") : (row.title?.trim() || "—");
}

function fileBasenameFromPath(p: string | null | undefined): string {
  const s = p?.trim();
  if (!s) return "";
  const u = s.replace(/\\/g, "/");
  const i = u.lastIndexOf("/");
  return i >= 0 ? u.slice(i + 1) : u;
}

function useWorkPdfThumbDataUrl(filePath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const p = filePath?.trim();
    if (!p || !p.toLowerCase().endsWith(".pdf")) {
      setUrl(null);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const { base64, mime } = await invoke<{ base64: string; mime: string }>("drawing:readFile", {
          relativePath: p,
        });
        if (alive) setUrl(`data:${mime};base64,${base64}`);
      } catch {
        if (alive) setUrl(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [filePath]);
  return url;
}

function WorkDrawingCard({
  row,
  writable,
  categoryLabel,
  isCurrent,
  onOpen,
  onEdit,
  onDelete,
  onToggleObsolete,
}: {
  row: LibDrawingRow;
  writable: boolean;
  categoryLabel: string | null;
  isCurrent: boolean;
  onOpen: (r: LibDrawingRow) => void;
  onEdit: (r: LibDrawingRow) => void;
  onDelete: (r: LibDrawingRow) => void;
  onToggleObsolete: (r: LibDrawingRow, next: boolean) => void;
}): JSX.Element {
  const thumbDataUrl = useWorkPdfThumbDataUrl(row.file_path);
  const obsolete = row.is_obsolete === 1;
  const isPdf = Boolean(row.file_path?.trim().toLowerCase().endsWith(".pdf"));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row);
        }
      }}
      className={cn(
        "group relative flex h-full min-h-0 w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface text-left text-fg-primary shadow-sm transition hover:border-accent-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
      )}
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
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-1.5 px-3 pt-3">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-fg-primary">
            {workDrawingCardPrimaryLabel(row)}
          </p>
          <p className="line-clamp-2 font-mono text-[11px] text-fg-primary">
            {fileBasenameFromPath(row.file_path) || "—"}
          </p>
          {categoryLabel && (
            <span className="inline-flex w-fit items-center rounded-full bg-accent-secondary/15 px-2 py-0.5 text-[10px] text-accent-secondary">
              {categoryLabel}
            </span>
          )}
          <CurrentRevisionBadge isCurrent={isCurrent} />
          <p className="text-[11px] text-fg-muted">更新 {row.updated_at}</p>
        </div>
        <div className="mt-auto flex w-full min-w-0 items-center justify-between gap-2 border-t border-border-subtle/60 px-3 pb-3 pt-2">
          <label
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-fg-primary"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={obsolete}
              disabled={!writable}
              onChange={(e): void => {
                void onToggleObsolete(row, e.target.checked);
              }}
              className="shrink-0 rounded border-border-strong"
            />
            <span className="truncate">旧図面</span>
          </label>
          <div className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
            {writable ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(row)}
                  className="h-8 w-8 !p-0 text-fg-muted hover:text-fg-primary"
                  aria-label="編集"
                >
                  <PencilLine size={14} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void onDelete(row)}
                  className="h-8 w-8 !p-0 text-state-danger"
                  aria-label="削除"
                >
                  <Trash2 size={14} />
                </Button>
              </>
            ) : (
              <span className="inline-block h-8 w-8 shrink-0" aria-hidden />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AssemblyGroup {
  key: string;
  customerName: string | null;
  model: string | null;
  assemblyNumber: string;
  parts: LibDrawingListItem[];
}

/** result.drawings をトップアセンブリ品番でグループ化（客先＋機種＋アセンブリ単位）。順序は保持。 */
function groupByAssembly(rows: LibDrawingListItem[]): {
  groups: AssemblyGroup[];
  loose: LibDrawingListItem[];
} {
  const groups: AssemblyGroup[] = [];
  const index = new Map<string, AssemblyGroup>();
  const loose: LibDrawingListItem[] = [];
  for (const row of rows) {
    const asm = row.assembly_number?.trim();
    if (!asm) {
      loose.push(row);
      continue;
    }
    const key = `${row.customer_name?.trim() ?? ""}\u0000${row.model?.trim() ?? ""}\u0000${asm}`;
    let group = index.get(key);
    if (!group) {
      group = {
        key,
        customerName: row.customer_name,
        model: row.model,
        assemblyNumber: asm,
        parts: [],
      };
      index.set(key, group);
      groups.push(group);
    }
    group.parts.push(row);
  }
  return { groups, loose };
}

function AssemblyPartRow({
  part,
  writable,
  isActive,
  onOpen,
  onEdit,
  onDelete,
  onToggleObsolete,
}: {
  part: LibDrawingListItem;
  writable: boolean;
  isActive: boolean;
  onOpen: (r: LibDrawingRow) => void;
  onEdit: (r: LibDrawingRow) => void;
  onDelete: (r: LibDrawingRow) => void;
  onToggleObsolete: (r: LibDrawingRow, next: boolean) => void;
}): JSX.Element {
  const obsolete = part.is_obsolete === 1;
  const partNum = part.product_name?.trim() || part.drawing_number?.trim() || "—";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(part)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(part);
        }
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
        isActive
          ? "border-accent-primary/60 bg-accent-primary/10"
          : "border-border-subtle/60 hover:border-accent-primary/40 hover:bg-bg-elevated/50",
        obsolete && "opacity-60"
      )}
    >
      <FileText className="h-4 w-4 shrink-0 text-fg-subtle/60" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs font-semibold text-fg-primary">{partNum}</p>
        {part.title?.trim() && (
          <p className="truncate text-[11px] text-fg-muted">{part.title}</p>
        )}
      </div>
      <span className="shrink-0 text-[11px] text-fg-muted">Rev {part.revision?.trim() || "—"}</span>
      <CurrentRevisionBadge isCurrent={part.is_current} />
      {writable ? (
        <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <label className="mr-1 flex cursor-pointer items-center gap-1 text-[10px] text-fg-muted">
            <input
              type="checkbox"
              checked={obsolete}
              onChange={(e) => void onToggleObsolete(part, e.target.checked)}
              className="rounded border-border-strong"
            />
            旧
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(part)}
            className="h-7 w-7 !p-0 text-fg-muted hover:text-fg-primary"
            aria-label="編集"
          >
            <PencilLine size={13} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void onDelete(part)}
            className="h-7 w-7 !p-0 text-state-danger"
            aria-label="削除"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** 一覧のアセンブリカード（部品は表示せず、クリックで詳細を開く） */
function AssemblyCard({
  group,
  onOpen,
}: {
  group: AssemblyGroup;
  onOpen: (g: AssemblyGroup) => void;
}): JSX.Element {
  const representative = group.parts.find((p) => p.is_current) ?? group.parts[0];
  const thumbDataUrl = useWorkPdfThumbDataUrl(representative?.file_path);
  const currentCount = group.parts.filter((p) => p.is_current).length;
  const isPdf = Boolean(representative?.file_path?.trim().toLowerCase().endsWith(".pdf"));
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(group)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(group);
        }
      }}
      className="group flex h-full min-h-0 w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface text-left text-fg-primary shadow-sm transition hover:border-accent-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
    >
      <div className="relative flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden bg-bg-elevated/40">
        {isPdf ? (
          <PdfCardThumbnail dataUrl={thumbDataUrl} className="h-full w-full rounded-none border-0 bg-transparent" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileText className="h-16 w-16 text-fg-subtle/50" />
          </div>
        )}
        <span className="absolute right-2 top-2 rounded-full bg-accent-primary/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
          部品 {group.parts.length}
        </span>
      </div>
      <div className="flex flex-col gap-1 px-3 py-3">
        <div className="flex items-center gap-1.5">
          <FileText className="h-4 w-4 shrink-0 text-accent-primary" />
          <p className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-fg-primary">
            {group.assemblyNumber}
          </p>
        </div>
        <p className="truncate text-[11px] text-fg-muted">
          {[group.customerName?.trim(), group.model?.trim()].filter(Boolean).join(" / ") || "—"}
        </p>
        {currentCount > 0 && (
          <span className="inline-flex w-fit items-center rounded-full bg-accent-secondary/15 px-2 py-0.5 text-[10px] text-accent-secondary">
            現行 {currentCount} 件
          </span>
        )}
      </div>
    </div>
  );
}

export function DrawingDbTab({ session, writable }: Props): JSX.Element {
  const toast = useToast();
  const isDlAdmin = getAppRole(session, "drawing-library") === "admin";
  const [result, setResult] = useState<DrawingListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentOnly, setCurrentOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<DrawingListPageSize>(DEFAULT_DRAWING_LIST_PAGE_SIZE);
  const [fcCustomer, setFcCustomer] = useState("");
  const [fcModel, setFcModel] = useState("");
  const [fcProduct, setFcProduct] = useState("");
  const [fcAssembly, setFcAssembly] = useState("");
  const [fcCategory, setFcCategory] = useState("");
  const [sortId, setSortId] = useState("updated_at|desc");
  const [categories, setCategories] = useState<MasterRow[]>([]);
  const [cascade, setCascade] = useState<DrawingWorkCascadeResult>({
    customers: [],
    models: [],
    productNames: [],
    assemblies: [],
  });

  const [detail, setDetail] = useState<LibDrawingRow | null>(null);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [detailViewMode, setDetailViewMode] = useState<"part" | "assembly">("part");
  const [assemblyMergeLoading, setAssemblyMergeLoading] = useState(false);
  const [comments, setComments] = useState<LibCommentRow[]>([]);
  const [edrawingsFiles, setEdrawingsFiles] = useState<LibEdrawingsFileRow[]>([]);
  const [revHistory, setRevHistory] = useState<LibDrawingRow[]>([]);
  const [detailSideTab, setDetailSideTab] = useState<"parts" | "rev" | "edraw">("rev");
  const [commentDraft, setCommentDraft] = useState("");
  // REQ-DL-004: アセンブリから開いた場合の全Rev行（詳細内で部品一覧＋Rev切替に使用）
  const [detailAssemblyRows, setDetailAssemblyRows] = useState<LibDrawingListItem[] | null>(null);
  const [detailAssemblyRev, setDetailAssemblyRev] = useState<string>("");

  const [createOpen, setCreateOpen] = useState(false);
  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [skuListLoading, setSkuListLoading] = useState(false);
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCustomer, setNewCustomer] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newAssemblyNumber, setNewAssemblyNumber] = useState("");
  const [newDrawingNumber, setNewDrawingNumber] = useState("");
  const [newRevision, setNewRevision] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newChangeSummary, setNewChangeSummary] = useState("");
  const [newFilePath, setNewFilePath] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // REQ-DL-004: 登録モードと複数部品一括登録用の状態（既定は複数部品まとめて登録）
  const [createMode, setCreateMode] = useState<"single" | "batch">("batch");
  const [batchParts, setBatchParts] = useState<
    {
      fileName: string;
      partNumber: string;
      title: string;
      sourcePath?: string;
      carryFromRelativePath?: string;
      carried: boolean;
    }[]
  >([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [carryLoading, setCarryLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSkuId, setEditSkuId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCustomer, setEditCustomer] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editProductName, setEditProductName] = useState("");
  const [editAssemblyNumber, setEditAssemblyNumber] = useState("");
  const [editDrawingNumber, setEditDrawingNumber] = useState("");
  const [editRevision, setEditRevision] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editChangeSummary, setEditChangeSummary] = useState("");
  const [editFilePath, setEditFilePath] = useState<string | null>(null);
  const [editSkuListLoading, setEditSkuListLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { sortBy, sortOrder } = parseWorkSortId(sortId);
      // カード（アセンブリ）単位でまとめ、クライアント側でページングするため全件取得する。
      const params: DrawingListParams = {
        drawingType: DRAWING_TYPE,
        search: search.trim() || undefined,
        limit: 5000,
        offset: 0,
        customerName: fcCustomer.trim() || undefined,
        model: fcModel.trim() || undefined,
        productName: fcProduct.trim() || undefined,
        assemblyNumber: fcAssembly.trim() || undefined,
        category: fcCategory.trim() || undefined,
        currentOnly: currentOnly || undefined,
        sortBy,
        sortOrder,
      };
      const data = await invoke<DrawingListResult>("drawing:list", params);
      setResult(data);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [search, toast, fcCustomer, fcModel, fcProduct, fcAssembly, fcCategory, sortId, currentOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const list = await invoke<MasterRow[]>("master:list", {
          table: "m_categories",
          scope: WORK_CATEGORY_SCOPE,
        });
        setCategories(list.filter((c) => c.isActive));
      } catch (err) {
        toast.push("error", err instanceof Error ? err.message : String(err));
        setCategories([]);
      }
    })();
  }, [toast]);

  useEffect(() => {
    void (async () => {
      try {
        const o = await invoke<DrawingWorkCascadeResult>("drawing:workCascadeOptions", {
          customerName: fcCustomer.trim() || undefined,
          model: fcModel.trim() || undefined,
        });
        setCascade(o);
      } catch (err) {
        toast.push("error", err instanceof Error ? err.message : String(err));
      }
    })();
  }, [fcCustomer, fcModel, toast]);

  const skuSelectOptions = useMemo(() => {
    const labelFor = (s: SkuRow): string => {
      const parts = [s.customerName, s.modelName, s.partNumberName, s.componentNameName].filter(Boolean);
      const head = parts.join(" / ");
      const rev = s.revision?.trim() ? ` Rev.${s.revision}` : "";
      const label = head + rev;
      return label.length > 110 ? `${label.slice(0, 107)}…` : label;
    };
    const sorted = [...skus].sort((a, b) => {
      const ca = (a.customerName ?? "").localeCompare(b.customerName ?? "", "ja");
      if (ca !== 0) return ca;
      const ma = (a.modelName ?? "").localeCompare(b.modelName ?? "", "ja");
      if (ma !== 0) return ma;
      return (a.partNumberName ?? "").localeCompare(b.partNumberName ?? "", "ja");
    });
    return [
      { value: "", label: "— 中央マスタの SKU から選ばず手入力 —" },
      ...sorted.map((s) => ({ value: String(s.id), label: labelFor(s) })),
    ];
  }, [skus]);

  useEffect(() => {
    if (!createOpen) return;
    setSkus([]);
    setSkuListLoading(true);
    setSelectedSkuId("");
    setNewTitle("");
    setNewCustomer("");
    setNewModel("");
    setNewProductName("");
    setNewAssemblyNumber("");
    setNewDrawingNumber("");
    setNewRevision("");
    setNewCategory("");
    setNewChangeSummary("");
    setNewFilePath(null);
    setCreateMode("batch");
    setBatchParts([]);
    void (async () => {
      try {
        const rows = await invoke<SkuRow[]>("sku:list", {});
        setSkus(rows.filter((r) => r.isActive));
      } catch (err) {
        toast.push("error", err instanceof Error ? err.message : String(err));
        setSkus([]);
      } finally {
        setSkuListLoading(false);
      }
    })();
  }, [createOpen]);

  // 一括登録: 客先＋アセンブリが揃ったら前Revの部品スナップショットを自動読込
  useEffect(() => {
    if (!createOpen || createMode !== "batch") return;
    const customerName = newCustomer.trim();
    const assemblyNumber = newAssemblyNumber.trim();
    if (!customerName || !assemblyNumber) return;
    const timer = window.setTimeout(() => {
      void loadCarriedParts({
        customerName,
        model: newModel,
        assemblyNumber,
        targetRevision: newRevision,
        replaceCarried: true,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [createOpen, createMode, newCustomer, newModel, newAssemblyNumber, newRevision]);

  useEffect(() => {
    if (!editOpen) return;
    setEditSkuListLoading(true);
    setEditSkuId("");
    void (async () => {
      try {
        const rows = await invoke<SkuRow[]>("sku:list", {});
        setSkus(rows.filter((r) => r.isActive));
      } catch (err) {
        toast.push("error", err instanceof Error ? err.message : String(err));
        setSkus([]);
      } finally {
        setEditSkuListLoading(false);
      }
    })();
  }, [editOpen, toast]);

  function applyEditSkuById(id: string): void {
    if (!id) return;
    const sku = skus.find((s) => String(s.id) === id);
    if (!sku) return;
    setEditCustomer(sku.customerName ?? "");
    setEditTitle(sku.componentNameName || sku.partNumberName || "");
    setEditModel(sku.modelName ?? "");
    setEditProductName(sku.partNumberName ?? "");
    setEditDrawingNumber((sku.drawingNumber ?? sku.partNumberCode ?? "").trim() || sku.partNumberName || "");
    setEditRevision(sku.revision ?? "");
  }

  function openEditModal(row: LibDrawingRow): void {
    setEditingId(row.id);
    setEditTitle(row.title ?? "");
    setEditCustomer(row.customer_name ?? "");
    setEditModel(row.model ?? "");
    setEditProductName(row.product_name ?? "");
    setEditAssemblyNumber(row.assembly_number ?? "");
    setEditDrawingNumber(row.drawing_number ?? "");
    setEditRevision(row.revision ?? "");
    setEditCategory(row.category ?? "");
    setEditChangeSummary(row.change_summary ?? "");
    setEditFilePath(row.file_path);
    setEditSkuId("");
    setEditOpen(true);
  }

  function closeEditModal(): void {
    setEditOpen(false);
    setEditingId(null);
  }

  function applySkuById(id: string): void {
    if (!id) return;
    const sku = skus.find((s) => String(s.id) === id);
    if (!sku) return;
    setNewCustomer(sku.customerName ?? "");
    setNewTitle(sku.componentNameName || sku.partNumberName || "");
    setNewModel(sku.modelName ?? "");
    setNewProductName(sku.partNumberName ?? "");
    setNewDrawingNumber((sku.drawingNumber ?? sku.partNumberCode ?? "").trim() || sku.partNumberName || "");
    setNewRevision(sku.revision ?? "");
  }

  // REQ-DL-004: 複数部品一括登録では、選んだ SKU をトップアセンブリとして客先/機種/アセンブリ品番に反映
  function applySkuToBatch(id: string): void {
    if (!id) return;
    const sku = skus.find((s) => String(s.id) === id);
    if (!sku) return;
    const customerName = sku.customerName ?? "";
    const model = sku.modelName ?? "";
    const assemblyNumber =
      (sku.drawingNumber ?? "").trim() || sku.partNumberName || sku.partNumberCode || "";
    setNewCustomer(customerName);
    setNewModel(model);
    setNewAssemblyNumber(assemblyNumber);
    setNewRevision(sku.revision ?? "");
    void loadCarriedParts({ customerName, model, assemblyNumber });
  }

  // REQ-DL-004: 前リビジョンの現行部品を一覧に読み込む（実ファイルを新Revにコピー継承するため）
  async function loadCarriedParts(over?: {
    customerName?: string;
    model?: string;
    assemblyNumber?: string;
    targetRevision?: string;
    replaceCarried?: boolean;
  }): Promise<void> {
    const customerName = (over?.customerName ?? newCustomer).trim();
    const model = (over?.model ?? newModel).trim();
    const assemblyNumber = (over?.assemblyNumber ?? newAssemblyNumber).trim();
    const targetRevision = (over?.targetRevision ?? newRevision).trim();
    if (!customerName || !assemblyNumber) {
      if (!over?.replaceCarried) {
        toast.push("warning", "客先とトップアセンブリ品番を入力してください。");
      }
      return;
    }
    setCarryLoading(true);
    try {
      const res = await invoke<DrawingListResult>("drawing:list", {
        drawingType: DRAWING_TYPE,
        customerName,
        model: model || undefined,
        assemblyNumber,
        currentOnly: false,
        limit: 5000,
        offset: 0,
      });
      const carryRev = (() => {
        const revList: string[] = [];
        const seen = new Set<string>();
        for (const r of sortByRevisionDesc([...res.drawings])) {
          const rev = r.revision?.trim() || "";
          if (!seen.has(rev)) {
            seen.add(rev);
            revList.push(rev);
          }
        }
        if (targetRevision) {
          const other = revList.find((rev) => rev !== targetRevision);
          if (other !== undefined) return other;
        }
        return revList[0] ?? "";
      })();
      const snapshot = res.drawings.filter(
        (d) =>
          (d.revision?.trim() || "") === carryRev &&
          d.file_path &&
          d.product_name?.trim() &&
          d.is_obsolete !== 1
      );
      setBatchParts((prev) => {
        const newOnly = prev.filter((p) => p.sourcePath && !p.carried);
        const carried = snapshot.map((d) => ({
          fileName: `${d.product_name}.pdf`,
          partNumber: d.product_name!.trim(),
          title: d.title?.trim() || "",
          carryFromRelativePath: d.file_path!,
          carried: true,
        }));
        const byPn = new Map<string, (typeof carried)[0] | (typeof newOnly)[0]>();
        for (const c of carried) byPn.set(c.partNumber.toLowerCase(), c);
        for (const n of newOnly) byPn.set(n.partNumber.toLowerCase(), n);
        return [...byPn.values()];
      });
      if (snapshot.length === 0 && !over?.replaceCarried) {
        toast.push("info", "引き継ぎ元のリビジョン部品は見つかりませんでした（新規アセンブリ）。");
      }
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setCarryLoading(false);
    }
  }

  async function openAssemblyDetail(group: AssemblyGroup): Promise<void> {
    // 全Rev（現行版のみ表示に関わらず）を取得して、Rev切替・部品一覧に使う
    let rows: LibDrawingListItem[] = group.parts;
    try {
      const { sortBy, sortOrder } = parseWorkSortId("product_name|asc");
      const res = await invoke<DrawingListResult>("drawing:list", {
        drawingType: DRAWING_TYPE,
        customerName: group.customerName ?? undefined,
        model: group.model ?? undefined,
        assemblyNumber: group.assemblyNumber,
        currentOnly: false,
        limit: 5000,
        offset: 0,
        sortBy,
        sortOrder,
      });
      rows = res.drawings;
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
    setDetailAssemblyRows(rows);
    const revsDesc = sortByRevisionDesc([...rows]);
    const latestRev = revsDesc[0]?.revision?.trim() || "";
    setDetailAssemblyRev(latestRev);
    const atLatest = rows.filter((r) => (r.revision?.trim() || "") === latestRev);
    const active = atLatest.find((p) => p.is_current) ?? atLatest[0] ?? rows[0] ?? null;
    if (active) await openDetail(active, { sideTab: "parts" });
  }

  async function openDetail(
    row: LibDrawingRow,
    opts?: { sideTab?: "parts" | "rev" | "edraw" }
  ): Promise<void> {
    setDetail(row);
    setDetailSideTab(opts?.sideTab ?? "rev");
    setDetailViewMode("part");
    setPdfDataUrl(null);
    setPdfLoading(false);
    setCommentDraft("");
    try {
      const customerName = row.customer_name?.trim() ?? "";
      const model = row.model?.trim() ?? "";
      const productName = row.product_name?.trim() ?? "";
      const assemblyNumber = row.assembly_number?.trim() || null;
      const [c, e, history] = await Promise.all([
        invoke<LibCommentRow[]>("drawing-comment:list", { drawing_id: row.id }),
        invoke<LibEdrawingsFileRow[]>("drawing-edrawings:list", { drawing_id: row.id }),
        customerName && model && productName
          ? invoke<LibDrawingRow[]>("drawing:revHistory", {
              customerName,
              model,
              productName,
              assemblyNumber,
            })
          : Promise.resolve([] as LibDrawingRow[]),
      ]);
      setComments(c);
      setEdrawingsFiles(e);
      setRevHistory(history);
      const fp = row.file_path?.trim();
      if (fp && fp.toLowerCase().endsWith(".pdf")) {
        setPdfLoading(true);
        try {
          const { base64, mime } = await invoke<{ base64: string; mime: string }>("drawing:readFile", {
            relativePath: fp,
          });
          setPdfDataUrl(`data:${mime};base64,${base64}`);
        } finally {
          setPdfLoading(false);
        }
      }
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  function closeDetail(): void {
    setPdfDataUrl(null);
    setDetail(null);
    setRevHistory([]);
    setDetailAssemblyRows(null);
    setDetailAssemblyRev("");
  }

  function canDeleteComment(comment: LibCommentRow): boolean {
    if (!writable) return false;
    if (isDlAdmin) return true;
    if (comment.user_name_id == null) return false;
    return comment.user_name_id === session.userNameId;
  }

  async function deleteCommentRow(id: number): Promise<void> {
    if (!window.confirm("このコメントを削除しますか？")) return;
    if (!detail) return;
    try {
      await invoke("drawing-comment:delete", { id });
      const c = await invoke<LibCommentRow[]>("drawing-comment:list", { drawing_id: detail.id });
      setComments(c);
      toast.push("success", "コメントを削除しました。");
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  function defaultExportName(row: LibDrawingRow): string {
    const fromPath = row.file_path?.split(/[/\\]/).pop()?.trim();
    if (fromPath) return fromPath;
    const base = `${row.customer_name ?? "図面"}_${row.title ?? "file"}`.replace(/[<>:"/\\|?*]/g, "_");
    return `${base}.pdf`;
  }

  async function exportRegisteredPdf(): Promise<void> {
    if (!detail?.file_path?.trim()) {
      toast.push("warning", "保存するファイルがありません。");
      return;
    }
    try {
      await invoke<{ path: string }>("drawing:exportFile", {
        relativePath: detail.file_path.trim(),
        defaultName: defaultExportName(detail),
      });
      toast.push("success", "保存しました。");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("キャンセル")) return;
      toast.push("error", msg);
    }
  }

  async function exportEdrawingFile(relPath: string, fileName: string): Promise<void> {
    try {
      await invoke<{ path: string }>("drawing:exportFile", {
        relativePath: relPath,
        defaultName: fileName,
      });
      toast.push("success", "保存しました。");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("キャンセル")) return;
      toast.push("error", msg);
    }
  }

  async function toggleWorkObsolete(row: LibDrawingRow, isObsolete: boolean): Promise<void> {
    if (!writable) return;
    try {
      await invoke<LibDrawingRow>("drawing:setObsolete", { id: row.id, isObsolete });
      toast.push("success", isObsolete ? "旧図面にしました。" : "最新として扱います。");
      await load();
      if (detail?.id === row.id) {
        setDetail((d) => (d ? { ...d, is_obsolete: isObsolete ? 1 : 0 } : null));
      }
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(row: LibDrawingRow): Promise<void> {
    if (!window.confirm(`「${row.title}」を削除しますか？`)) return;
    const wasAssemblyDetail = Boolean(detail && detailAssemblyRows);
    try {
      await invoke("drawing:delete", { id: row.id });
      toast.push("success", "削除しました。");
      await load();
      if (wasAssemblyDetail) {
        await reloadAssemblyDetail(row.id);
      } else if (detail?.id === row.id) {
        closeDetail();
      }
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  /** アセンブリ詳細内で部品が増減した後、詳細に留まったまま部品一覧を再取得する */
  async function reloadAssemblyDetail(deletedId?: number): Promise<void> {
    if (!detail) return;
    const customerName = detail.customer_name?.trim() ?? "";
    const model = detail.model?.trim() || undefined;
    const assemblyNumber = detail.assembly_number?.trim() ?? "";
    if (!customerName || !assemblyNumber) {
      closeDetail();
      return;
    }
    try {
      const res = await invoke<DrawingListResult>("drawing:list", {
        drawingType: DRAWING_TYPE,
        customerName,
        model,
        assemblyNumber,
        currentOnly: false,
        limit: 5000,
        offset: 0,
      });
      const rows = res.drawings;
      if (rows.length === 0) {
        closeDetail();
        return;
      }
      setDetailAssemblyRows(rows);
      let keepRev = detailAssemblyRev;
      let atRev = rows.filter((r) => (r.revision?.trim() || "") === keepRev);
      if (atRev.length === 0) {
        keepRev = sortByRevisionDesc([...rows])[0]?.revision?.trim() || "";
        setDetailAssemblyRev(keepRev);
        atRev = rows.filter((r) => (r.revision?.trim() || "") === keepRev);
      }
      const active =
        atRev.find((r) => r.id !== deletedId) ??
        atRev[0] ??
        rows.find((r) => r.id !== deletedId) ??
        rows[0] ??
        null;
      if (active) {
        await openDetail(active, { sideTab: "parts" });
      }
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePickPdf(): Promise<void> {
    if (!newCustomer.trim()) {
      toast.push("warning", "先に顧客名（フォルダ名）を入力してください。");
      return;
    }
    try {
      const r = await invoke<{ file_path: string }>("drawing:pickPdf", {
        customerName: newCustomer.trim(),
        drawingType: DRAWING_TYPE,
      });
      setNewFilePath(r.file_path);
      toast.push("success", "PDF を取り込みました。");
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleEditPickPdf(): Promise<void> {
    if (!editCustomer.trim()) {
      toast.push("warning", "先に客先（保存フォルダ名）を入力してください。");
      return;
    }
    try {
      const r = await invoke<{ file_path: string }>("drawing:pickPdf", {
        customerName: editCustomer.trim(),
        drawingType: DRAWING_TYPE,
      });
      setEditFilePath(r.file_path);
      toast.push("success", "PDF を取り込みました。");
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCreateSubmit(): Promise<void> {
    if (!newTitle.trim()) {
      toast.push("warning", "名称を入力してください。");
      return;
    }
    if (!newFilePath) {
      toast.push("warning", "PDF を選択してください。");
      return;
    }
    const input: DrawingUpsertInput = {
      title: newTitle.trim(),
      customer_name: newCustomer.trim() || null,
      model: newModel.trim() || null,
      product_name: newProductName.trim() || null,
      assembly_number: newAssemblyNumber.trim() || null,
      drawing_number: newDrawingNumber.trim() || null,
      revision: newRevision.trim() || null,
      category: newCategory.trim() || null,
      change_summary: newChangeSummary.trim() || null,
      file_path: newFilePath,
      drawingType: DRAWING_TYPE,
    };
    try {
      await invoke("drawing:create", { input });
      toast.push("success", "登録しました。");
      setCreateOpen(false);
      await load();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  // REQ-DL-004: 複数部品PDFの選択（コピー前の一時パスを取得し一覧に追加。同一品番は上書き確認）
  async function handlePickWorkPdfs(): Promise<void> {
    let picked: PickedWorkPdf[];
    try {
      picked = await invoke<PickedWorkPdf[]>("drawing:pickWorkPdfs", {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("選択されません")) return;
      toast.push("error", msg);
      return;
    }
    const next = [...batchParts];
    for (const p of picked) {
      const idx = next.findIndex(
        (it) => it.partNumber.trim().toLowerCase() === p.defaultPartNumber.trim().toLowerCase()
      );
      if (idx >= 0) {
        const existed = next[idx];
        const proceed = window.confirm(
          `同じ部品「${existed.partNumber}」を今回のPDFで上書きします。よろしいですか？`
        );
        if (!proceed) continue;
        next[idx] = {
          fileName: p.fileName,
          partNumber: existed.partNumber,
          title: existed.title,
          sourcePath: p.sourcePath,
          carried: false,
        };
      } else {
        next.push({
          fileName: p.fileName,
          partNumber: p.defaultPartNumber,
          title: "",
          sourcePath: p.sourcePath,
          carried: false,
        });
      }
    }
    setBatchParts(next);
  }

  function updateBatchPart(index: number, field: "partNumber" | "title", value: string): void {
    setBatchParts((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  function removeBatchPart(index: number): void {
    setBatchParts((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleBatchSubmit(): Promise<void> {
    if (!newCustomer.trim()) {
      toast.push("warning", "客先を入力してください。");
      return;
    }
    if (!newAssemblyNumber.trim()) {
      toast.push("warning", "トップアセンブリ品番を入力してください。");
      return;
    }
    if (batchParts.length === 0) {
      toast.push("warning", "登録する部品が1つもありません。");
      return;
    }
    if (batchParts.some((p) => !p.partNumber.trim())) {
      toast.push("warning", "部品品番が空の項目があります。");
      return;
    }
    const input: WorkBatchCreateInput = {
      customerName: newCustomer.trim(),
      model: newModel.trim() || null,
      assemblyNumber: newAssemblyNumber.trim(),
      revision: newRevision.trim() || null,
      category: newCategory.trim() || null,
      changeSummary: newChangeSummary.trim() || null,
      parts: batchParts.map((p) => ({
        sourcePath: p.sourcePath ?? null,
        carryFromRelativePath: p.carryFromRelativePath ?? null,
        partNumber: p.partNumber.trim(),
        title: p.title.trim() || null,
      })),
    };
    setBatchSubmitting(true);
    try {
      const res = await invoke<WorkBatchCreateResult>("drawing:createWorkBatch", { input });
      toast.push("success", `${res.created} 件の部品図面を登録しました。`);
      setCreateOpen(false);
      await load();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBatchSubmitting(false);
    }
  }

  // REQ-DL-004: アセンブリ全体を結合して表示 / 単一部品に戻す
  async function showAssemblyMerged(): Promise<void> {
    if (!detail) return;
    const customerName = detail.customer_name?.trim() ?? "";
    const model = detail.model?.trim() ?? "";
    const assemblyNumber = detail.assembly_number?.trim() ?? "";
    if (!customerName || !assemblyNumber) {
      toast.push("warning", "アセンブリ品番が無いため結合表示できません。");
      return;
    }
    setAssemblyMergeLoading(true);
    setDetailViewMode("assembly");
    try {
      const { base64, mime } = await invoke<{ base64: string; mime: string }>(
        "drawing:mergeWorkAssembly",
        { customerName, model, assemblyNumber, revision: detailAssemblyRev || detail.revision || null }
      );
      setPdfDataUrl(`data:${mime};base64,${base64}`);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
      setDetailViewMode("part");
    } finally {
      setAssemblyMergeLoading(false);
    }
  }

  async function showPartFile(): Promise<void> {
    if (!detail) return;
    setDetailViewMode("part");
    const fp = detail.file_path?.trim();
    if (!fp || !fp.toLowerCase().endsWith(".pdf")) {
      setPdfDataUrl(null);
      return;
    }
    setPdfLoading(true);
    try {
      const { base64, mime } = await invoke<{ base64: string; mime: string }>("drawing:readFile", {
        relativePath: fp,
      });
      setPdfDataUrl(`data:${mime};base64,${base64}`);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleEditSubmit(): Promise<void> {
    if (editingId == null) return;
    if (!editTitle.trim()) {
      toast.push("warning", "名称を入力してください。");
      return;
    }
    if (!editFilePath) {
      toast.push("warning", "PDF を選択してください。");
      return;
    }
    const patch: Partial<DrawingUpsertInput> = {
      title: editTitle.trim(),
      customer_name: editCustomer.trim() || null,
      model: editModel.trim() || null,
      product_name: editProductName.trim() || null,
      assembly_number: editAssemblyNumber.trim() || null,
      drawing_number: editDrawingNumber.trim() || null,
      revision: editRevision.trim() || null,
      category: editCategory.trim() || null,
      change_summary: editChangeSummary.trim() || null,
      file_path: editFilePath,
    };
    try {
      const updated = await invoke<LibDrawingRow>("drawing:update", { id: editingId, patch });
      toast.push("success", "更新しました。");
      closeEditModal();
      await load();
      if (detail?.id === editingId) {
        setDetail(updated);
        setPdfDataUrl(null);
        const fp = updated.file_path?.trim();
        if (fp && fp.toLowerCase().endsWith(".pdf")) {
          setPdfLoading(true);
          try {
            const { base64, mime } = await invoke<{ base64: string; mime: string }>("drawing:readFile", {
              relativePath: fp,
            });
            setPdfDataUrl(`data:${mime};base64,${base64}`);
          } finally {
            setPdfLoading(false);
          }
        }
      }
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function addComment(): Promise<void> {
    if (!detail || !commentDraft.trim()) return;
    try {
      await invoke("drawing-comment:create", {
        drawing_id: detail.id,
        comment_text: commentDraft.trim(),
      });
      setCommentDraft("");
      const c = await invoke<LibCommentRow[]>("drawing-comment:list", { drawing_id: detail.id });
      setComments(c);
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function attachEdrawings(): Promise<void> {
    if (!detail?.customer_name?.trim()) {
      toast.push("warning", "図面に客先名が無い場合は eDrawings を紐付けできません。");
      return;
    }
    try {
      await invoke("drawing-edrawings:upload", {
        drawing_id: detail.id,
        customerName: detail.customer_name,
      });
      const list = await invoke<LibEdrawingsFileRow[]>("drawing-edrawings:list", { drawing_id: detail.id });
      setEdrawingsFiles(list);
      toast.push("success", "eDrawings ファイルを追加しました。");
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteEdrawingRow(id: number): Promise<void> {
    if (!window.confirm("この eDrawings ファイルを削除しますか？")) return;
    if (!detail) return;
    try {
      await invoke("drawing-edrawings:delete", { id });
      const list = await invoke<LibEdrawingsFileRow[]>("drawing-edrawings:list", { drawing_id: detail.id });
      setEdrawingsFiles(list);
      toast.push("success", "削除しました。");
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  const { groups: assemblyGroups, loose: looseRows } = useMemo(
    () => groupByAssembly(result?.drawings ?? []),
    [result]
  );

  // カード（アセンブリ＋単体/旧データ）を並べ、カード単位でページングする
  type CardUnit =
    | { kind: "assembly"; group: AssemblyGroup }
    | { kind: "loose"; row: LibDrawingListItem };
  const allUnits = useMemo<CardUnit[]>(() => {
    const items: CardUnit[] = [];
    for (const g of assemblyGroups) items.push({ kind: "assembly", group: g });
    for (const r of looseRows) items.push({ kind: "loose", row: r });
    return items;
  }, [assemblyGroups, looseRows]);

  const totalCards = allUnits.length;
  const totalPages = Math.max(1, Math.ceil(totalCards / pageSize));
  const pagedUnits = useMemo(
    () => allUnits.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [allUnits, page, pageSize]
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function displayPartNumber(r: LibDrawingRow): string {
    const p = r.product_name?.trim();
    if (p) return p;
    const d = r.drawing_number?.trim();
    if (d) return d;
    return "—";
  }

  const detailObsolete = detail ? detail.is_obsolete === 1 : false;

  const revHistoryCurrentMap = useMemo(
    () => buildCurrentDrawingIdMap(revHistory),
    [revHistory]
  );

  const detailIsCurrent = detail ? isCurrentDrawing(detail, revHistoryCurrentMap) : false;

  // アセンブリ詳細: Rev 一覧（新しい順）と、選択中 Rev の部品一覧
  const assemblyRevsDesc = useMemo(() => {
    const rows = detailAssemblyRows ?? [];
    const sorted = sortByRevisionDesc([...rows]);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of sorted) {
      const rev = r.revision?.trim() || "";
      if (!seen.has(rev)) {
        seen.add(rev);
        out.push(rev);
      }
    }
    return out;
  }, [detailAssemblyRows]);

  const detailPartsForRev = useMemo(() => {
    const rows = detailAssemblyRows ?? [];
    return rows.filter((r) => (r.revision?.trim() || "") === detailAssemblyRev);
  }, [detailAssemblyRows, detailAssemblyRev]);

  async function changeAssemblyRev(rev: string): Promise<void> {
    setDetailAssemblyRev(rev);
    const rows = detailAssemblyRows ?? [];
    const atRev = rows.filter((r) => (r.revision?.trim() || "") === rev);
    const currentPn = detail?.product_name?.trim();
    const same = currentPn ? atRev.find((r) => (r.product_name?.trim() || "") === currentPn) : null;
    const active = same ?? atRev[0] ?? null;
    if (active) await openDetail(active, { sideTab: "parts" });
  }

  function formatCommentDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${day} ${h}:${min}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
          {writable && (
            <Button type="button" variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              新規
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            更新
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
            <HelpCircle size={16} aria-hidden />
            ヘルプ
          </Button>
      </div>

      <Modal open={helpOpen} title={drawingLibraryHelpTitle("work")} onClose={() => setHelpOpen(false)} width="lg">
        <DrawingLibraryHelpContent variant="work" />
      </Modal>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="客先・機種・図面番号・名称・リビジョン など"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="h-10 min-w-[200px] flex-1 rounded-lg border border-border-strong bg-bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        />
        <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border-subtle bg-bg-surface px-3 text-sm text-fg-primary">
          <input
            type="checkbox"
            checked={currentOnly}
            onChange={(e) => {
              setCurrentOnly(e.target.checked);
              setPage(1);
            }}
            className="rounded border-border-strong"
          />
          現行版のみ表示
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[140px] flex-col gap-1 text-xs text-fg-muted">
          客先で絞る
          <select
            value={fcCustomer}
            onChange={(e) => {
              setFcCustomer(e.target.value);
              setFcModel("");
              setFcProduct("");
              setFcAssembly("");
              setPage(1);
            }}
            className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg"
          >
            <option value="">（すべて）</option>
            {cascade.customers.map((c) => (
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
            disabled={!fcCustomer}
            onChange={(e) => {
              setFcModel(e.target.value);
              setFcProduct("");
              setFcAssembly("");
              setPage(1);
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
            value={fcProduct}
            disabled={!fcCustomer || !fcModel}
            onChange={(e) => {
              setFcProduct(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg disabled:opacity-50"
          >
            <option value="">（すべて）</option>
            {cascade.productNames.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[160px] flex-col gap-1 text-xs text-fg-muted">
          アセンブリ品番で絞る
          <select
            value={fcAssembly}
            disabled={!fcCustomer || !fcModel}
            onChange={(e) => {
              setFcAssembly(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg disabled:opacity-50"
          >
            <option value="">（すべて）</option>
            {(cascade.assemblies ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[160px] flex-col gap-1 text-xs text-fg-muted">
          カテゴリで絞る
          <select
            value={fcCategory}
            onChange={(e) => {
              setFcCategory(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg"
          >
            <option value="">（すべて）</option>
            {categories.map((c) => (
              <option key={c.id} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-fg-muted">
          並び順
          <select
            value={sortId}
            onChange={(e) => {
              setSortId(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-border-strong bg-bg-surface px-2 text-sm text-fg"
          >
            {WORK_SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="py-8 text-center text-fg-muted">読み込み中...</p>
      ) : !result?.drawings.length ? (
        <p className="rounded-xl border border-border-subtle py-8 text-center text-sm text-fg-muted">
          データがありません。
        </p>
      ) : (
        <>
          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pagedUnits.map((u) =>
              u.kind === "assembly" ? (
                <AssemblyCard key={u.group.key} group={u.group} onOpen={openAssemblyDetail} />
              ) : (
                <WorkDrawingCard
                  key={u.row.id}
                  row={u.row}
                  writable={writable}
                  isCurrent={u.row.is_current}
                  categoryLabel={
                    u.row.category
                      ? categories.find((c) => c.code === u.row.category)?.name ?? u.row.category
                      : null
                  }
                  onOpen={(row) => void openDetail(row)}
                  onEdit={(row) => openEditModal(row)}
                  onDelete={(row) => void handleDelete(row)}
                  onToggleObsolete={(row, next) => void toggleWorkObsolete(row, next)}
                />
              )
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-fg-muted">
              {totalCards} 枚中 {page}/{totalPages} ページ（図面 {result.total} 件）
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
                      setPage(1);
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

      <Modal open={createOpen} title="図面を新規登録（自社発行）" onClose={() => setCreateOpen(false)} width="lg">
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 rounded-lg border border-border-subtle bg-bg-elevated/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setCreateMode("single")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 font-medium transition-colors",
                createMode === "single"
                  ? "bg-bg-surface text-fg-primary shadow-sm"
                  : "text-fg-muted hover:text-fg-primary"
              )}
            >
              1図面を登録
            </button>
            <button
              type="button"
              onClick={() => setCreateMode("batch")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 font-medium transition-colors",
                createMode === "batch"
                  ? "bg-bg-surface text-fg-primary shadow-sm"
                  : "text-fg-muted hover:text-fg-primary"
              )}
            >
              複数の部品PDFをまとめて登録（アセンブリ）
            </button>
          </div>

          {createMode === "single" ? (
            <>
              <p className="text-xs text-fg-muted">
                SKU を選ぶと自動入力されます。図面番号(品番)とリビジョンの組み合わせは重複登録できません。
              </p>
              {skuListLoading ? (
                <p className="text-xs text-fg-muted">SKU 一覧を読み込み中…</p>
              ) : (
                <Select
                  label="SKU（任意・中央マスタの SKU 台帳）"
                  value={selectedSkuId}
                  options={skuSelectOptions}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedSkuId(v);
                    if (v) applySkuById(v);
                  }}
                />
              )}
              <TextField
                label="客先（保存フォルダ名）"
                value={newCustomer}
                onChange={(e) => setNewCustomer(e.target.value)}
              />
              <TextField label="機種" value={newModel} onChange={(e) => setNewModel(e.target.value)} />
              <TextField
                label="図面番号(品番)"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
              />
              <TextField label="リビジョン" value={newRevision} onChange={(e) => setNewRevision(e.target.value)} />
              <TextField label="名称" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <label className="flex flex-col gap-1 text-sm text-fg-primary">
                <span className="text-fg-muted">変更理由（任意）</span>
                <textarea
                  value={newChangeSummary}
                  onChange={(e) => setNewChangeSummary(e.target.value)}
                  placeholder="例: ブラケット追加、穴位置変更"
                  rows={2}
                  className="rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                />
              </label>
              <Select
                label="カテゴリ（任意・マスタ「カテゴリ」/ 自社発行）"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                options={[
                  { value: "", label: "— 選択しない —" },
                  ...categories.map((c) => ({ value: c.code, label: c.name })),
                ]}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => void handlePickPdf()}>
                  PDF を選択して取り込み
                </Button>
                {newFilePath && <span className="truncate text-xs text-fg-muted">{newFilePath}</span>}
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                  キャンセル
                </Button>
                <Button type="button" variant="primary" onClick={() => void handleCreateSubmit()}>
                  登録
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-fg-muted">
                各PDFのファイル名が部品品番になります（取込後に修正可）。SKU を選ぶと前リビジョンの部品が自動で読み込まれます。
                Rev アップ時は、読み込んだ前Rev部品のうち<strong>不要になった部品は行削除</strong>し、<strong>変更/新規の部品PDFを取り込む</strong>だけで OK です。
                この一覧が新しいリビジョンの内容になります（前Rev部品も実ファイルを新Revフォルダにコピーし、完全なスナップショットとして保存。後から Rev 切替で閲覧できます）。
              </p>
              {skuListLoading ? (
                <p className="text-xs text-fg-muted">SKU 一覧を読み込み中…</p>
              ) : (
                <Select
                  label="SKU（中央マスタの SKU 台帳から客先・機種・トップアセンブリ品番を自動入力）"
                  value={selectedSkuId}
                  options={skuSelectOptions}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedSkuId(v);
                    if (v) applySkuToBatch(v);
                  }}
                />
              )}
              <TextField
                label="客先（保存フォルダ名）"
                value={newCustomer}
                onChange={(e) => setNewCustomer(e.target.value)}
              />
              <TextField label="機種" value={newModel} onChange={(e) => setNewModel(e.target.value)} />
              <TextField
                label="トップアセンブリ品番"
                value={newAssemblyNumber}
                onChange={(e) => setNewAssemblyNumber(e.target.value)}
              />
              <TextField label="リビジョン" value={newRevision} onChange={(e) => setNewRevision(e.target.value)} />
              <label className="flex flex-col gap-1 text-sm text-fg-primary">
                <span className="text-fg-muted">変更理由（任意）</span>
                <textarea
                  value={newChangeSummary}
                  onChange={(e) => setNewChangeSummary(e.target.value)}
                  placeholder="例: ブラケット追加、穴位置変更"
                  rows={2}
                  className="rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                />
              </label>
              <Select
                label="カテゴリ（任意・マスタ「カテゴリ」/ 自社発行）"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                options={[
                  { value: "", label: "— 選択しない —" },
                  ...categories.map((c) => ({ value: c.code, label: c.name })),
                ]}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => void handlePickWorkPdfs()}>
                  <Plus size={14} />
                  部品PDFを選択（複数可）
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={carryLoading}
                  onClick={() => void loadCarriedParts()}
                >
                  <RefreshCw size={14} className={carryLoading ? "animate-spin" : ""} />
                  前リビジョンの部品を読込
                </Button>
                <span className="text-xs text-fg-muted">{batchParts.length} 件</span>
              </div>
              {batchParts.length > 0 && (
                <ul className="max-h-[38vh] space-y-2 overflow-y-auto rounded-lg border border-border-subtle p-2">
                  {batchParts.map((p, i) => (
                    <li
                      key={`${p.carried ? "c" : "n"}:${p.partNumber}:${i}`}
                      className="flex flex-col gap-1 rounded-md border border-border-subtle/60 bg-bg-surface p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">
                          {p.fileName}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px]",
                            p.carried
                              ? "bg-accent-secondary/15 text-accent-secondary"
                              : "bg-accent-primary/15 text-accent-primary"
                          )}
                        >
                          {p.carried ? "前Revから継承" : "新規/更新"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeBatchPart(i)}
                          aria-label="削除"
                          className="h-7 w-7 shrink-0 !p-0 text-state-danger"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={p.partNumber}
                          onChange={(e) => updateBatchPart(i, "partNumber", e.target.value)}
                          placeholder="部品品番"
                          className="h-8 min-w-[140px] flex-1 rounded-md border border-border-strong bg-bg-surface px-2 text-xs text-fg-primary"
                        />
                        <input
                          type="text"
                          value={p.title}
                          onChange={(e) => updateBatchPart(i, "title", e.target.value)}
                          placeholder="名称（任意）"
                          className="h-8 min-w-[140px] flex-1 rounded-md border border-border-strong bg-bg-surface px-2 text-xs text-fg-primary"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                  キャンセル
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={batchSubmitting}
                  onClick={() => void handleBatchSubmit()}
                >
                  {batchSubmitting ? "登録中…" : `${batchParts.length} 件を登録`}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {detail && (
        <Modal open title="図面の詳細" onClose={closeDetail} width="full">
          <div className="relative flex min-h-[60vh] flex-col gap-6">
            <ObsoleteOverlay show={detailObsolete} className="rounded-lg" />
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle pb-4">
              <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
                <div>
                  <dt className="text-xs text-fg-muted">客先</dt>
                  <dd className="font-medium text-fg-primary">{detail.customer_name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">機種</dt>
                  <dd className="text-fg-primary">{detail.model ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">図面番号(品番)</dt>
                  <dd className="font-mono text-xs text-fg-primary">{displayPartNumber(detail)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">アセンブリ品番</dt>
                  <dd className="font-mono text-xs text-fg-primary">
                    {detail.assembly_number?.trim() || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">リビジョン</dt>
                  <dd className="text-fg-primary">{detail.revision ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">カテゴリ</dt>
                  <dd className="text-fg-primary">
                    {detail.category
                      ? categories.find((c) => c.code === detail.category)?.name ?? detail.category
                      : "—"}
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-3 lg:col-span-4">
                  <dt className="text-xs text-fg-muted">名称</dt>
                  <dd className="font-medium text-fg-primary">{detail.title}</dd>
                </div>
                <div className="col-span-2 sm:col-span-3 lg:col-span-4">
                  <dt className="text-xs text-fg-muted">変更理由</dt>
                  <dd className="text-fg-primary">{detail.change_summary?.trim() || "—"}</dd>
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-3 lg:col-span-4">
                  <CurrentRevisionBadge isCurrent={detailIsCurrent} />
                  {!detailIsCurrent && (
                    <span className="text-xs text-fg-muted">この Rev は現行版ではありません</span>
                  )}
                </div>
              </dl>
              <div className="flex flex-col items-end gap-2 shrink-0">
                {writable && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => openEditModal(detail)}>
                    <PencilLine size={14} />
                    編集
                  </Button>
                )}
                {detail.file_path?.trim() && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => void exportRegisteredPdf()}>
                    <Download size={14} />
                    PDF を保存…
                  </Button>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-primary">
                  <input
                    type="checkbox"
                    checked={detailObsolete}
                    disabled={!writable}
                    onChange={(e) => void toggleWorkObsolete(detail, e.target.checked)}
                    className="rounded border-border-strong"
                  />
                  旧図面として表示（一覧にオーバーレイ）
                </label>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-12 lg:gap-8">
              <div className="relative flex min-h-[min(72vh,900px)] flex-col gap-2 lg:col-span-7">
                {detail.assembly_number?.trim() && (
                  <div className="flex gap-1 rounded-lg border border-border-subtle bg-bg-elevated/40 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => void showPartFile()}
                      className={cn(
                        "rounded-md px-3 py-1.5 font-medium transition-colors",
                        detailViewMode === "part"
                          ? "bg-bg-surface text-fg-primary shadow-sm"
                          : "text-fg-muted hover:text-fg-primary"
                      )}
                    >
                      この部品
                    </button>
                    <button
                      type="button"
                      onClick={() => void showAssemblyMerged()}
                      className={cn(
                        "rounded-md px-3 py-1.5 font-medium transition-colors",
                        detailViewMode === "assembly"
                          ? "bg-bg-surface text-fg-primary shadow-sm"
                          : "text-fg-muted hover:text-fg-primary"
                      )}
                    >
                      アセンブリ結合表示
                    </button>
                  </div>
                )}
                {pdfLoading || assemblyMergeLoading ? (
                  <p className="text-sm text-fg-muted">
                    {assemblyMergeLoading ? "アセンブリを結合中…" : "PDF を読み込み中…"}
                  </p>
                ) : (
                  <PdfJsViewer dataUrl={pdfDataUrl} fitToContainer />
                )}
              </div>
              <div className="flex min-h-0 flex-col gap-4 border-t border-border-subtle pt-6 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <div className="flex gap-1 border-b border-border-subtle">
                  {detailAssemblyRows && (
                    <button
                      type="button"
                      onClick={() => setDetailSideTab("parts")}
                      className={cn(
                        "px-3 py-2 text-xs font-medium transition-colors",
                        detailSideTab === "parts"
                          ? "border-b-2 border-accent-primary text-fg-primary"
                          : "text-fg-muted hover:text-fg-primary"
                      )}
                    >
                      部品（{detailPartsForRev.length}）
                    </button>
                  )}
                  {!detailAssemblyRows && (
                    <button
                      type="button"
                      onClick={() => setDetailSideTab("rev")}
                      className={cn(
                        "px-3 py-2 text-xs font-medium transition-colors",
                        detailSideTab === "rev"
                          ? "border-b-2 border-accent-primary text-fg-primary"
                          : "text-fg-muted hover:text-fg-primary"
                      )}
                    >
                      Rev履歴
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDetailSideTab("edraw")}
                    className={cn(
                      "px-3 py-2 text-xs font-medium transition-colors",
                      detailSideTab === "edraw"
                        ? "border-b-2 border-accent-primary text-fg-primary"
                        : "text-fg-muted hover:text-fg-primary"
                    )}
                  >
                    eDrawings
                  </button>
                </div>
                {detailSideTab === "parts" ? (
                  <div className="flex min-h-0 flex-1 flex-col gap-2">
                    {assemblyRevsDesc.length > 0 && (
                      <label className="flex items-center gap-2 text-xs text-fg-muted">
                        <span className="whitespace-nowrap">リビジョン</span>
                        <select
                          value={detailAssemblyRev}
                          onChange={(e) => void changeAssemblyRev(e.target.value)}
                          className="h-8 flex-1 rounded-md border border-border-strong bg-bg-surface px-2 text-xs text-fg-primary"
                        >
                          {assemblyRevsDesc.map((rev, i) => (
                            <option key={rev || "—"} value={rev}>
                              Rev {rev || "—"}
                              {i === 0 ? "（最新）" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="max-h-[min(44vh,480px)] min-h-[6rem] flex-1 space-y-1.5 overflow-y-auto">
                      {detailPartsForRev.length === 0 ? (
                        <p className="py-2 text-xs text-fg-muted">部品がありません</p>
                      ) : (
                        detailPartsForRev.map((p) => (
                          <AssemblyPartRow
                            key={p.id}
                            part={p}
                            writable={writable}
                            isActive={p.id === detail.id}
                            onOpen={(row) => void openDetail(row, { sideTab: "parts" })}
                            onEdit={(row) => openEditModal(row)}
                            onDelete={(row) => void handleDelete(row)}
                            onToggleObsolete={(row, next) => void toggleWorkObsolete(row, next)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                ) : detailSideTab === "rev" ? (
                  <ul className="max-h-[min(40vh,420px)] min-h-[8rem] flex-1 space-y-1 overflow-y-auto text-sm">
                    {revHistory.length === 0 ? (
                      <li className="py-2 text-xs text-fg-muted">Rev 履歴がありません</li>
                    ) : (
                      revHistory.map((h) => {
                        const isActive = h.id === detail.id;
                        const isCurrentRev = isCurrentDrawing(h, revHistoryCurrentMap);
                        return (
                          <li key={h.id}>
                            <button
                              type="button"
                              onClick={() => void openDetail(h)}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                                isActive
                                  ? "bg-accent-primary/10 font-semibold text-fg-primary"
                                  : "hover:bg-bg-elevated text-fg-primary"
                              )}
                            >
                              <span>
                                Rev {h.revision?.trim() || "—"}
                                {isActive && (
                                  <span className="ml-2 text-xs font-normal text-fg-muted">（表示中）</span>
                                )}
                              </span>
                              <CurrentRevisionBadge isCurrent={isCurrentRev} />
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                ) : (
                  <>
                    <ul className="max-h-[min(40vh,420px)] min-h-[8rem] flex-1 space-y-0 divide-y divide-border-subtle overflow-y-auto border-y border-border-subtle text-sm">
                      {edrawingsFiles.map((f) => (
                        <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                          <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-primary">
                            {f.file_name}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => void exportEdrawingFile(f.file_path, f.file_name)}
                            >
                              <Download size={12} />
                            </Button>
                            {writable && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void deleteEdrawingRow(f.id)}
                                aria-label="削除"
                              >
                                <Trash2 size={14} className="text-state-danger" />
                              </Button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {edrawingsFiles.length === 0 && <p className="text-xs text-fg-primary">紐付けなし</p>}
                    {writable && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => void attachEdrawings()}>
                        eDrawings を追加
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="border-t border-border-subtle pt-4">
              <p className="text-xs font-semibold text-fg-primary">コメント</p>
              <ul className="mt-3 max-h-[min(35vh,360px)] space-y-0 divide-y divide-border-subtle overflow-y-auto border-y border-border-subtle text-sm text-fg-primary">
                {comments.map((c) => (
                  <li key={c.id} className="py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-fg-muted">
                          {formatCommentDate(c.created_at)}
                          {c.user_name ? `  ${c.user_name}` : ""}
                        </p>
                        <p className="mt-1">{c.comment_text}</p>
                      </div>
                      {canDeleteComment(c) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void deleteCommentRow(c.id)}
                          aria-label="コメント削除"
                          className="shrink-0 text-state-danger"
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {writable && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="コメント"
                    className="flex-1 rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-sm text-fg-primary"
                  />
                  <Button type="button" variant="primary" size="sm" onClick={() => void addComment()}>
                    追加
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      <Modal open={editOpen} title="図面を編集（自社発行）" onClose={closeEditModal} width="lg">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-fg-muted">
            登録内容を修正できます。図面番号(品番)とリビジョンの組み合わせは他の図面と重複できません。PDF は差し替えも可能です。
          </p>
          {editSkuListLoading ? (
            <p className="text-xs text-fg-muted">SKU 一覧を読み込み中…</p>
          ) : (
            <Select
              label="SKU（任意・中央マスタの SKU 台帳）"
              value={editSkuId}
              options={skuSelectOptions}
              onChange={(e) => {
                const v = e.target.value;
                setEditSkuId(v);
                if (v) applyEditSkuById(v);
              }}
            />
          )}
          <TextField
            label="客先（保存フォルダ名）"
            value={editCustomer}
            onChange={(e) => setEditCustomer(e.target.value)}
          />
          <TextField label="機種" value={editModel} onChange={(e) => setEditModel(e.target.value)} />
          <TextField
            label="トップアセンブリ品番（任意）"
            value={editAssemblyNumber}
            onChange={(e) => setEditAssemblyNumber(e.target.value)}
          />
          <TextField
            label="図面番号(品番)"
            value={editProductName}
            onChange={(e) => setEditProductName(e.target.value)}
          />
          <TextField label="リビジョン" value={editRevision} onChange={(e) => setEditRevision(e.target.value)} />
          <TextField label="名称" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          <label className="flex flex-col gap-1 text-sm text-fg-primary">
            <span className="text-fg-muted">変更理由（任意）</span>
            <textarea
              value={editChangeSummary}
              onChange={(e) => setEditChangeSummary(e.target.value)}
              placeholder="例: ブラケット追加、穴位置変更"
              rows={2}
              className="rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            />
          </label>
          <Select
            label="カテゴリ（任意・マスタ「カテゴリ」/ 自社発行）"
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value)}
            options={[
              { value: "", label: "— 選択しない —" },
              ...categories.map((c) => ({ value: c.code, label: c.name })),
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleEditPickPdf()}>
              PDF を選択して取り込み
            </Button>
            {editFilePath && <span className="truncate text-xs text-fg-muted">{editFilePath}</span>}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeEditModal}>
              キャンセル
            </Button>
            <Button type="button" variant="primary" onClick={() => void handleEditSubmit()}>
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

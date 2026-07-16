import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ChevronsDownUp,
  ChevronsUpDown,
  EyeOff,
  FileText,
  Pencil,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import {
  buildBomParentRowContext,
  bomTreeRowSurfaceClass,
  isBomParentAssemblyRow,
} from "@shared/bomParentRows.js";
import {
  PART_LINE_STATUSES,
  PART_LINE_STATUS_LABELS,
  PART_SOURCE_TYPES,
  PART_SOURCE_TYPE_LABELS,
  showsProcurementLeadTime,
  showsArrangedCheckbox,
  type PartLineStatus,
  type PartSourceType,
  type ProjectPartLine,
} from "@shared/partsTracker.js";
import type { MasterRow } from "@shared/master.js";
import type { PartDrawingLinkInfo } from "@shared/partsTrackerDrawing.js";

import { BomStructureBadge } from "@renderer/routes/parts-tracker/BomStructureBadge.js";
import {
  BOM_TABLE_CELL,
  BOM_TABLE_HEAD,
  BOM_TABLE_PART_NUMBER_CELL,
  BOM_TABLE_PART_NUMBER_HEAD,
} from "@renderer/routes/parts-tracker/bomTableLayout.js";
import { BomTruncatableText } from "@renderer/routes/parts-tracker/BomTruncatableText.js";
import type { LineInlineDraft } from "@renderer/routes/parts-tracker/partsTrackerInlineEdit.js";
import { SupplierCombobox } from "@renderer/routes/parts-tracker/SupplierCombobox.js";

import { Button } from "@renderer/components/ui/Button.js";
import { cn } from "@renderer/lib/cn.js";

const INLINE_SELECT =
  "h-7 min-w-[6.5rem] w-[8.5rem] max-w-[11rem] rounded border border-border-strong bg-bg-surface px-2 py-0 text-sm text-fg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary";

const INLINE_SELECT_STATUS =
  "h-7 min-w-[6rem] w-[8rem] max-w-[10rem] rounded border border-border-strong bg-bg-surface px-2 py-0 text-sm text-fg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary";

function RowIconButton({
  title,
  className,
  onClick,
  children,
}: {
  title: string;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded p-0 text-fg-muted transition-colors hover:bg-bg-elevated hover:text-fg-primary",
        className
      )}
    >
      {children}
    </button>
  );
}

function materialLabel(note: string | null): string {
  if (!note) return "—";
  const m = note.match(/^材質:\s*(.+?)(?:\s\/\s|$)/);
  if (m) return m[1].trim();
  return "—";
}

function isVisibleUnderCollapse(row: ProjectPartLine, collapsed: Set<string>): boolean {
  const path = row.assemblyPath?.trim();
  if (!path) return true;
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) {
    const ancestor = parts.slice(0, i).join("/");
    if (collapsed.has(ancestor)) return false;
  }
  return true;
}

function levelTone(level: number): string {
  if (level <= 0) return "bg-accent-primary/15 text-accent-primary font-semibold";
  if (level === 1) return "bg-bg-elevated text-fg-primary";
  if (level === 2) return "bg-bg-elevated/80 text-fg-muted";
  return "bg-bg-surface text-fg-subtle";
}

function riskBadge(risk: ProjectPartLine["risk"], suppressRiskHighlight: boolean): JSX.Element {
  if (suppressRiskHighlight) {
    return <span className="text-sm text-fg-subtle">—</span>;
  }
  if (risk === "delayed") {
    return (
      <span className="inline-flex rounded px-1.5 py-0 leading-tight text-sm font-medium text-state-danger bg-state-danger/15">
        遅延
      </span>
    );
  }
  if (risk === "need_order") {
    return (
      <span className="inline-flex rounded px-1.5 py-0 leading-tight text-sm font-medium text-amber-700 bg-amber-500/15 dark:text-amber-300">
        要発注
      </span>
    );
  }
  return (
    <span className="inline-flex rounded px-1.5 py-0 leading-tight text-sm text-fg-muted bg-bg-elevated">
      正常
    </span>
  );
}

function findDrawingLink(
  partNumber: string,
  links: Record<string, PartDrawingLinkInfo> | undefined
): PartDrawingLinkInfo | undefined {
  if (!links || !partNumber.trim()) return undefined;
  const exact = links[partNumber];
  if (exact) return exact;
  const lower = partNumber.trim().toLowerCase();
  for (const [key, value] of Object.entries(links)) {
    if (key.trim().toLowerCase() === lower) return value;
  }
  return undefined;
}

function PartNumberCell({
  partNumber,
  drawingLink,
  onOpenDrawing,
  indent,
}: {
  partNumber: string;
  drawingLink: PartDrawingLinkInfo | undefined;
  onOpenDrawing?: (partNumber: string, link: PartDrawingLinkInfo) => void;
  indent: number;
}): JSX.Element {
  const linked = Boolean(drawingLink && onOpenDrawing);
  const content = (
    <BomTruncatableText
      value={partNumber}
      mono
      emphasize
      ariaLabel={`品番 ${partNumber}`}
    />
  );
  return (
    <div
      style={{ paddingLeft: `${indent}px` }}
      className={cn(
        "inline-flex min-w-0 max-w-full border-l pl-1.5",
        linked ? "border-accent-primary/50" : "border-border-subtle/80"
      )}
    >
      {linked ? (
        <button
          type="button"
          onClick={() => onOpenDrawing!(partNumber, drawingLink!)}
          title={`図面を表示（Rev ${drawingLink!.revision ?? "—"}）`}
          className="inline-flex min-w-0 max-w-full items-center gap-1 rounded text-left font-semibold text-accent-primary underline decoration-accent-primary/50 underline-offset-2 hover:decoration-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        >
          <FileText size={13} className="shrink-0 text-accent-primary" aria-hidden />
          {content}
        </button>
      ) : (
        content
      )}
    </div>
  );
}

function arrangedMeta(line: ProjectPartLine): JSX.Element {
  if (!line.isArranged) return <span className="text-fg-subtle">—</span>;
  const who = line.arrangedByUsername ?? "";
  const when = (line.arrangedAt ?? "").replace("T", " ").slice(0, 16);
  return (
    <span className="max-w-[4.5rem] truncate text-sm text-state-success" title={`${who} ${when}`}>
      {who || "済"}
    </span>
  );
}

export interface PartsBomTreeTableActions {
  canBulkEdit: boolean;
  canSetArranged: boolean;
  canEditLine: boolean;
  canDeleteLine: boolean;
  canSetHidden: boolean;
}

export interface PartsBomTreeTableProps {
  rows: ProjectPartLine[];
  actions: PartsBomTreeTableActions;
  editMode?: boolean;
  drafts?: Record<number, LineInlineDraft>;
  suppliers?: MasterRow[];
  onDraftChange?: (lineId: number, patch: Partial<LineInlineDraft>) => void;
  onSetArranged: (line: ProjectPartLine, arranged: boolean) => void;
  onEdit: (line: ProjectPartLine) => void;
  onToggleHidden: (line: ProjectPartLine) => void;
  onHideRequest: (line: ProjectPartLine) => void;
  onDelete: (line: ProjectPartLine) => void;
  /** 自社発行図面リンク（BOM 品番 → 現行版アセンブリ内の部品図面） */
  drawingLinks?: Record<string, PartDrawingLinkInfo>;
  onOpenDrawing?: (partNumber: string, link: PartDrawingLinkInfo) => void;
  /** §8.5.21 案件完了時は遅延ハイライト・リスクバッジを抑制 */
  suppressRiskHighlight?: boolean;
}

function resolveDraft(
  line: ProjectPartLine,
  drafts: Record<number, LineInlineDraft> | undefined
): LineInlineDraft {
  const d = drafts?.[line.id];
  return d ?? {
    sourceType: line.sourceType,
    supplierId: line.supplierId,
    status: line.status,
  };
}

export function PartsBomTreeTable({
  rows,
  actions,
  editMode = false,
  drafts,
  suppliers = [],
  onDraftChange,
  onSetArranged,
  onEdit,
  onToggleHidden,
  onHideRequest,
  onDelete,
  drawingLinks,
  onOpenDrawing,
  suppressRiskHighlight = false,
}: PartsBomTreeTableProps): JSX.Element {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set());

  const { branchParents, collapsiblePaths, parentRowContext } = useMemo(() => {
    const roots = new Set<string>();
    for (const row of rows) {
      const path = row.assemblyPath?.trim();
      if (!path) continue;
      if (row.bomLevel <= 0) roots.add(path);
    }
    const parentRowContext = buildBomParentRowContext(rows);
    const parents = parentRowContext.parentAssemblyPaths;
    const collapsible = new Set<string>();
    for (const p of parents) {
      if (!roots.has(p)) collapsible.add(p);
    }
    return { branchParents: parents, collapsiblePaths: collapsible, parentRowContext };
  }, [rows]);

  const visibleRows = useMemo(
    () => rows.filter((r) => isVisibleUnderCollapse(r, collapsedPaths)),
    [rows, collapsedPaths]
  );

  const toggleCollapse = (assemblyPath: string): void => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(assemblyPath)) next.delete(assemblyPath);
      else next.add(assemblyPath);
      return next;
    });
  };

  const expandAll = (): void => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      for (const p of collapsiblePaths) next.delete(p);
      return next;
    });
  };

  const collapseAll = (): void => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      for (const p of collapsiblePaths) next.add(p);
      return next;
    });
  };

  const hasCollapsible = collapsiblePaths.size > 0;
  const anyCollapsibleCollapsed = [...collapsiblePaths].some((p) => collapsedPaths.has(p));
  const allCollapsibleCollapsed =
    hasCollapsible && [...collapsiblePaths].every((p) => collapsedPaths.has(p));

  const showOpsColumn =
    actions.canEditLine || actions.canDeleteLine || actions.canSetHidden;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-1.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!hasCollapsible || !anyCollapsibleCollapsed}
          onClick={expandAll}
        >
          <ChevronsDownUp size={14} aria-hidden />
          すべて展開
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!hasCollapsible || allCollapsibleCollapsed}
          onClick={collapseAll}
        >
          <ChevronsUpDown size={14} aria-hidden />
          すべて折りたたむ
        </Button>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[1320px] border-collapse text-sm leading-tight text-fg-primary">
        <thead className="sticky top-0 z-10 bg-bg-elevated/95 text-sm uppercase tracking-wider text-fg-muted backdrop-blur-sm">
          <tr>
            <th className={cn("w-8 px-1", BOM_TABLE_HEAD)} aria-label="展開" />
            <th className={cn("w-10 text-center", BOM_TABLE_HEAD)}>Lv</th>
            <th className={cn("w-14 text-center", BOM_TABLE_HEAD)}>構造</th>
            <th className={cn("min-w-[9.5rem] text-left", BOM_TABLE_HEAD)}>親品番</th>
            <th className={cn("min-w-[4.5rem] text-left", BOM_TABLE_HEAD)}>手配済</th>
            <th className={cn("min-w-[3.5rem] text-left", BOM_TABLE_HEAD)}>リスク</th>
            <th className={cn("min-w-[12rem] text-left", BOM_TABLE_PART_NUMBER_HEAD)}>品番</th>
            <th className={cn("min-w-[3rem] text-left", BOM_TABLE_HEAD)}>Rev</th>
            <th className={cn("min-w-[10rem] text-left", BOM_TABLE_HEAD)}>名称</th>
            <th className={cn("min-w-[2.5rem] text-right", BOM_TABLE_HEAD)}>個数</th>
            <th className={cn("min-w-[3.5rem] text-left", BOM_TABLE_HEAD)}>材質</th>
            <th className={cn("min-w-[3.5rem] text-left", BOM_TABLE_HEAD)}>区分</th>
            <th className={cn("min-w-[4.5rem] text-left", BOM_TABLE_HEAD)}>商社</th>
            <th className={cn("min-w-[2.25rem] text-right", BOM_TABLE_HEAD)}>LT</th>
            <th className={cn("min-w-[5.5rem] text-left", BOM_TABLE_HEAD)}>必要着日</th>
            <th className={cn("min-w-[5.5rem] text-left", BOM_TABLE_HEAD)}>発注期限</th>
            <th className={cn("min-w-[3.5rem] text-left", BOM_TABLE_HEAD)}>状態</th>
            {showOpsColumn && (
              <th
                className={cn(
                  "sticky right-0 z-10 min-w-[5.5rem] bg-bg-elevated/95 text-right backdrop-blur-sm",
                  BOM_TABLE_HEAD
                )}
              >
                操作
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 && (
            <tr>
              <td
                colSpan={showOpsColumn ? 18 : 17}
                className="px-4 py-8 text-center text-fg-subtle"
              >
                表示する行がありません。
              </td>
            </tr>
          )}
          {visibleRows.map((line) => {
            const path = line.assemblyPath?.trim() ?? "";
            const hasChildren = path.length > 0 && branchParents.has(path);
            const isParentRow = isBomParentAssemblyRow(line, parentRowContext);
            const isCollapsed = path.length > 0 && collapsedPaths.has(path);
            const indent = Math.min(line.bomLevel, 8) * 12;
            const showArranged = showsArrangedCheckbox(line.sourceType);

            return (
              <tr
                key={line.id}
                className={cn(
                  "border-t border-border-subtle transition-colors",
                  bomTreeRowSurfaceClass({
                    isHidden: line.isHidden,
                    isDelayed: line.risk === "delayed",
                    isReceived: line.status === "received",
                    isArranged: showArranged && line.isArranged,
                    suppressRiskHighlight,
                  })
                )}
              >
                <td className={cn("px-1", BOM_TABLE_CELL)}>
                  {hasChildren ? (
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded p-0 text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                      aria-label={isCollapsed ? "展開" : "折りたたむ"}
                      onClick={() => toggleCollapse(path)}
                    >
                      {isCollapsed ? (
                        <ChevronRight size={12} aria-hidden />
                      ) : (
                        <ChevronDown size={12} aria-hidden />
                      )}
                    </button>
                  ) : null}
                </td>
                <td className={cn("text-center", BOM_TABLE_CELL)}>
                  <span
                    className={cn(
                      "inline-flex min-w-[1.25rem] justify-center rounded px-0.5 py-0 font-mono text-sm leading-tight",
                      levelTone(line.bomLevel)
                    )}
                    title={`階層 ${line.bomLevel}`}
                  >
                    {line.bomLevel}
                  </span>
                </td>
                <td className={cn("text-center", BOM_TABLE_CELL)}>
                  <BomStructureBadge isParent={isParentRow} />
                </td>
                <td className={BOM_TABLE_CELL}>
                  {line.bomLevel <= 0 && !line.parentAssemblyPartNumber ? (
                    <span className="whitespace-nowrap text-sm font-medium text-fg-muted">（ルート）</span>
                  ) : (
                    <BomTruncatableText
                      value={line.parentAssemblyPartNumber}
                      mono
                      ariaLabel={`親品番 ${line.parentAssemblyPartNumber ?? ""}`}
                    />
                  )}
                </td>
                <td className={BOM_TABLE_CELL}>
                  {showArranged ? (
                    <div className="flex items-center gap-1">
                      {actions.canSetArranged ? (
                        <input
                          type="checkbox"
                          checked={line.isArranged}
                          onChange={(e) => onSetArranged(line, e.target.checked)}
                          className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-state-success"
                          aria-label={`${line.partNumber} を手配済にする`}
                        />
                      ) : (
                        <CheckCircle2
                          size={12}
                          className={line.isArranged ? "text-state-success" : "text-fg-subtle"}
                          aria-hidden
                        />
                      )}
                      {arrangedMeta(line)}
                    </div>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </td>
                <td className={BOM_TABLE_CELL}>{riskBadge(line.risk, suppressRiskHighlight)}</td>
                <td className={BOM_TABLE_PART_NUMBER_CELL}>
                  <PartNumberCell
                    partNumber={line.partNumber}
                    drawingLink={findDrawingLink(line.partNumber, drawingLinks)}
                    onOpenDrawing={onOpenDrawing}
                    indent={indent}
                  />
                </td>
                <td className={cn("font-mono text-sm", BOM_TABLE_CELL)}>{line.revision ?? "—"}</td>
                <td className={BOM_TABLE_CELL}>
                  <BomTruncatableText value={line.partName} ariaLabel={`名称 ${line.partName}`} />
                </td>
                <td className={cn("text-right tabular-nums", BOM_TABLE_CELL)}>{line.quantity}</td>
                <td className={cn("text-sm text-fg-muted", BOM_TABLE_CELL)}>
                  {materialLabel(line.note)}
                </td>
                <td className={cn(BOM_TABLE_CELL, editMode && actions.canBulkEdit && "min-w-[9rem]")}>
                  {editMode && actions.canBulkEdit && onDraftChange ? (
                    <select
                      className={INLINE_SELECT}
                      value={resolveDraft(line, drafts).sourceType}
                      aria-label={`${line.partNumber} の調達区分`}
                      onChange={(e) =>
                        onDraftChange(line.id, {
                          sourceType: e.target.value as PartSourceType,
                          supplierId:
                            e.target.value === "purchase"
                              ? resolveDraft(line, drafts).supplierId
                              : null,
                        })
                      }
                    >
                      {PART_SOURCE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {PART_SOURCE_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="truncate text-sm text-fg-primary">
                      {PART_SOURCE_TYPE_LABELS[line.sourceType]}
                    </span>
                  )}
                </td>
                <td className={cn(BOM_TABLE_CELL, editMode && actions.canBulkEdit && "min-w-[11rem]")}>
                  {editMode && actions.canBulkEdit && onDraftChange ? (
                    resolveDraft(line, drafts).sourceType === "purchase" ? (
                      <SupplierCombobox
                        compact
                        suppliers={suppliers}
                        value={resolveDraft(line, drafts).supplierId}
                        ariaLabel={`${line.partNumber} の商社`}
                        onChange={(supplierId) =>
                          onDraftChange(line.id, {
                            supplierId,
                          })
                        }
                      />
                    ) : (
                      <span className="text-sm text-fg-subtle">—</span>
                    )
                  ) : (
                    <span className="inline-block max-w-[6rem] truncate text-sm text-fg-muted">
                      {line.supplierName ?? "—"}
                    </span>
                  )}
                </td>
                <td className={cn("text-right text-sm tabular-nums", BOM_TABLE_CELL)}>
                  {showsProcurementLeadTime(line.sourceType) ? `${line.leadTimeDays}日` : "—"}
                </td>
                <td className={cn("text-sm", BOM_TABLE_CELL)}>{line.requiredDate}</td>
                <td className={cn("text-sm", BOM_TABLE_CELL)}>
                  {showsProcurementLeadTime(line.sourceType) ? (
                    <span
                      className={cn(
                        line.risk === "need_order" &&
                          "font-medium text-amber-700 dark:text-amber-300"
                      )}
                    >
                      {line.orderByDate ?? "—"}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={cn(BOM_TABLE_CELL, editMode && actions.canBulkEdit && "min-w-[9rem]")}>
                  {editMode && actions.canBulkEdit && onDraftChange &&
                  (!showsArrangedCheckbox(line.sourceType) || line.isArranged) ? (
                    <select
                      className={INLINE_SELECT_STATUS}
                      value={resolveDraft(line, drafts).status}
                      aria-label={`${line.partNumber} の状態`}
                      onChange={(e) =>
                        onDraftChange(line.id, { status: e.target.value as PartLineStatus })
                      }
                    >
                      {PART_LINE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {PART_LINE_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="truncate text-sm">
                      {PART_LINE_STATUS_LABELS[line.status]}
                    </span>
                  )}
                </td>
                {showOpsColumn && (
                  <td
                    className={cn(
                      "sticky right-0 z-[1]",
                      BOM_TABLE_CELL,
                      line.isHidden ? "bg-bg-elevated/90" : "bg-bg-surface/95",
                      "backdrop-blur-sm"
                    )}
                  >
                    <div className="flex items-center justify-end gap-0.5">
                      {actions.canEditLine && (
                        <RowIconButton title="編集" onClick={() => onEdit(line)}>
                          <Pencil size={13} aria-hidden />
                        </RowIconButton>
                      )}
                      {actions.canSetHidden && (
                        <RowIconButton
                          title={line.isHidden ? "一覧に再表示" : "一覧から非表示"}
                          className={
                            !line.isHidden
                              ? "text-amber-800 hover:bg-amber-500/10 hover:text-amber-900 dark:text-amber-300"
                              : undefined
                          }
                          onClick={() =>
                            line.isHidden ? onToggleHidden(line) : onHideRequest(line)
                          }
                        >
                          <EyeOff size={13} aria-hidden />
                        </RowIconButton>
                      )}
                      {actions.canDeleteLine && (
                        <RowIconButton
                          title="削除"
                          className="hover:text-state-danger"
                          onClick={() => onDelete(line)}
                        >
                          <Trash2 size={13} className="text-state-danger" aria-hidden />
                        </RowIconButton>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

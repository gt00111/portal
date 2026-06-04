import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ChevronsDownUp,
  ChevronsUpDown,
  EyeOff,
  Pencil,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import {
  PART_LINE_STATUSES,
  PART_LINE_STATUS_LABELS,
  PART_SOURCE_TYPES,
  PART_SOURCE_TYPE_LABELS,
  type PartLineStatus,
  type PartSourceType,
  type ProjectPartLine,
} from "@shared/partsTracker.js";
import type { MasterRow } from "@shared/master.js";

import type { LineInlineDraft } from "@renderer/routes/parts-tracker/partsTrackerInlineEdit.js";

import { Button } from "@renderer/components/ui/Button.js";
import { cn } from "@renderer/lib/cn.js";

const CELL = "px-1.5 py-0.5 align-middle";
const HEAD = "px-1.5 py-1 align-middle";

const INLINE_SELECT =
  "h-7 max-w-full min-w-0 rounded border border-border-strong bg-bg-surface px-1 py-0 text-sm text-fg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary";

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

function parentPathsWithChildren(rows: ProjectPartLine[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const path = row.assemblyPath?.trim();
    if (!path) continue;
    const idx = path.lastIndexOf("/");
    if (idx > 0) out.add(path.slice(0, idx));
  }
  return out;
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

function riskBadge(risk: ProjectPartLine["risk"]): JSX.Element {
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

export interface PartsBomTreeTableProps {
  rows: ProjectPartLine[];
  writable: boolean;
  editMode?: boolean;
  drafts?: Record<number, LineInlineDraft>;
  suppliers?: MasterRow[];
  onDraftChange?: (lineId: number, patch: Partial<LineInlineDraft>) => void;
  onSetArranged: (line: ProjectPartLine, arranged: boolean) => void;
  onEdit: (line: ProjectPartLine) => void;
  onToggleHidden: (line: ProjectPartLine) => void;
  onHideRequest: (line: ProjectPartLine) => void;
  onDelete: (line: ProjectPartLine) => void;
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
  writable,
  editMode = false,
  drafts,
  suppliers = [],
  onDraftChange,
  onSetArranged,
  onEdit,
  onToggleHidden,
  onHideRequest,
  onDelete,
}: PartsBomTreeTableProps): JSX.Element {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set());

  const { branchParents, collapsiblePaths } = useMemo(() => {
    const roots = new Set<string>();
    for (const row of rows) {
      const path = row.assemblyPath?.trim();
      if (!path) continue;
      if (row.bomLevel <= 0) roots.add(path);
    }
    const parents = parentPathsWithChildren(rows);
    const collapsible = new Set<string>();
    for (const p of parents) {
      if (!roots.has(p)) collapsible.add(p);
    }
    return { branchParents: parents, collapsiblePaths: collapsible };
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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-1.5">
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
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
      <table className="w-full min-w-[1200px] border-collapse text-sm leading-tight text-fg-primary">
        <thead className="sticky top-0 z-10 bg-bg-elevated/95 text-sm uppercase tracking-wider text-fg-muted backdrop-blur-sm">
          <tr>
            <th className={cn("w-7 px-0.5", HEAD)} aria-label="展開" />
            <th className={cn("w-9 text-center", HEAD)}>Lv</th>
            <th className={cn("min-w-[7rem] text-left", HEAD)}>親品番</th>
            <th className={cn("w-[4.5rem] text-left", HEAD)}>手配済</th>
            <th className={cn("w-14 text-left", HEAD)}>リスク</th>
            <th className={cn("min-w-[6.5rem] text-left", HEAD)}>品番</th>
            <th className={cn("w-12 text-left", HEAD)}>Rev</th>
            <th className={cn("min-w-[7rem] text-left", HEAD)}>名称</th>
            <th className={cn("w-10 text-right", HEAD)}>個数</th>
            <th className={cn("w-14 text-left", HEAD)}>材質</th>
            <th className={cn("w-14 text-left", HEAD)}>区分</th>
            <th className={cn("min-w-[4.5rem] text-left", HEAD)}>商社</th>
            <th className={cn("w-9 text-right", HEAD)}>LT</th>
            <th className={cn("w-[5.5rem] text-left", HEAD)}>必要着日</th>
            <th className={cn("w-[5.5rem] text-left", HEAD)}>発注期限</th>
            <th className={cn("w-14 text-left", HEAD)}>状態</th>
            {writable && (
              <th
                className={cn(
                  "sticky right-0 z-10 w-[5.5rem] bg-bg-elevated/95 text-right backdrop-blur-sm",
                  HEAD
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
                colSpan={writable ? 17 : 16}
                className="px-4 py-8 text-center text-fg-subtle"
              >
                表示する行がありません。
              </td>
            </tr>
          )}
          {visibleRows.map((line) => {
            const path = line.assemblyPath?.trim() ?? "";
            const hasChildren = path.length > 0 && branchParents.has(path);
            const isCollapsed = path.length > 0 && collapsedPaths.has(path);
            const indent = Math.min(line.bomLevel, 8) * 12;

            return (
              <tr
                key={line.id}
                className={cn(
                  "border-t border-border-subtle transition-colors",
                  line.isHidden && "bg-bg-elevated/50 text-fg-muted",
                  line.isArranged && !line.isHidden && "bg-state-success/[0.06]",
                  line.risk === "delayed" &&
                    !line.isHidden &&
                    "border-l-2 border-l-state-danger bg-state-danger/[0.03]"
                )}
              >
                <td className={cn("px-0.5", CELL)}>
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
                <td className={cn("text-center", CELL)}>
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
                <td className={CELL}>
                  {line.bomLevel <= 0 && !line.parentAssemblyPartNumber ? (
                    <span className="text-sm font-medium text-fg-muted">（ルート）</span>
                  ) : (
                    <span
                      className="block max-w-[10rem] truncate font-mono text-sm text-fg-primary"
                      title={line.parentAssemblyPartNumber ?? undefined}
                    >
                      {line.parentAssemblyPartNumber ?? "—"}
                    </span>
                  )}
                </td>
                <td className={CELL}>
                  <div className="flex items-center gap-1">
                    {writable ? (
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
                </td>
                <td className={CELL}>{riskBadge(line.risk)}</td>
                <td className={CELL}>
                  <div
                    style={{ paddingLeft: `${indent}px` }}
                    className="border-l border-border-subtle/80 pl-1 leading-tight"
                  >
                    <span className="font-mono text-sm font-medium">{line.partNumber}</span>
                  </div>
                </td>
                <td className={cn("font-mono text-sm", CELL)}>{line.revision ?? "—"}</td>
                <td className={cn("max-w-[12rem] truncate text-sm", CELL)}>{line.partName}</td>
                <td className={cn("text-right tabular-nums", CELL)}>{line.quantity}</td>
                <td className={cn("truncate text-sm text-fg-muted", CELL)}>
                  {materialLabel(line.note)}
                </td>
                <td className={cn("max-w-[7rem]", CELL)}>
                  {editMode && writable && onDraftChange ? (
                    <select
                      className={cn(INLINE_SELECT, "w-full")}
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
                <td className={cn("max-w-[8rem]", CELL)}>
                  {editMode && writable && onDraftChange ? (
                    resolveDraft(line, drafts).sourceType === "purchase" ? (
                      <select
                        className={cn(INLINE_SELECT, "w-full")}
                        value={
                          resolveDraft(line, drafts).supplierId != null
                            ? String(resolveDraft(line, drafts).supplierId)
                            : ""
                        }
                        aria-label={`${line.partNumber} の商社`}
                        onChange={(e) =>
                          onDraftChange(line.id, {
                            supplierId: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      >
                        <option value="">—</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-fg-subtle">—</span>
                    )
                  ) : (
                    <span className="block max-w-[6rem] truncate text-sm text-fg-muted">
                      {line.supplierName ?? "—"}
                    </span>
                  )}
                </td>
                <td className={cn("text-right text-sm tabular-nums", CELL)}>{line.leadTimeDays}日</td>
                <td className={cn("whitespace-nowrap text-sm", CELL)}>{line.requiredDate}</td>
                <td className={cn("whitespace-nowrap text-sm", CELL)}>
                  <span
                    className={cn(
                      line.risk === "need_order" && "font-medium text-amber-700 dark:text-amber-300"
                    )}
                  >
                    {line.orderByDate ?? "—"}
                  </span>
                </td>
                <td className={cn("max-w-[6rem]", CELL)}>
                  {editMode && writable && onDraftChange && line.isArranged ? (
                    <select
                      className={cn(INLINE_SELECT, "w-full")}
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
                {writable && (
                  <td
                    className={cn(
                      "sticky right-0 z-[1]",
                      CELL,
                      line.isHidden ? "bg-bg-elevated/90" : "bg-bg-surface/95",
                      "backdrop-blur-sm"
                    )}
                  >
                    <div className="flex items-center justify-end gap-0.5">
                      <RowIconButton title="編集" onClick={() => onEdit(line)}>
                        <Pencil size={13} aria-hidden />
                      </RowIconButton>
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
                      <RowIconButton
                        title="削除"
                        className="hover:text-state-danger"
                        onClick={() => onDelete(line)}
                      >
                        <Trash2 size={13} className="text-state-danger" aria-hidden />
                      </RowIconButton>
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

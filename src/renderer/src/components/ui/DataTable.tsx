import type { ReactNode } from "react";

import { cn } from "@renderer/lib/cn.js";

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
}

interface Props<T> {
  rows: T[];
  columns: Array<Column<T>>;
  keyOf: (row: T) => string | number;
  empty?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  rows,
  columns,
  keyOf,
  empty = "データがありません。",
  onRowClick,
}: Props<T>): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle">
      <table className="w-full text-sm">
        <thead className="bg-bg-elevated/60 text-xs uppercase tracking-wider text-fg-muted">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-4 py-3 font-medium",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center"
                )}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-fg-subtle">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={keyOf(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-t border-border-subtle transition-colors",
                onRowClick && "cursor-pointer hover:bg-bg-elevated/40"
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-4 py-3",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center"
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

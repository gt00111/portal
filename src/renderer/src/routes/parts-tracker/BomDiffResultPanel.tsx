import type { BomDiffChangeKind, BomDiffResult } from "@shared/bomDiff.js";
import { BOM_DIFF_CHANGE_LABELS } from "@shared/bomDiff.js";
import {
  buildBomParentRowContext,
  isBomParentAssemblyRow,
} from "@shared/bomParentRows.js";

import { useMemo } from "react";

import {
  BOM_TABLE_CELL,
  BOM_TABLE_HEAD,
  BOM_TABLE_PART_NUMBER_CELL,
  BOM_TABLE_PART_NUMBER_HEAD,
} from "@renderer/routes/parts-tracker/bomTableLayout.js";
import { BomStructureBadge } from "@renderer/routes/parts-tracker/BomStructureBadge.js";
import { BomTruncatableText } from "@renderer/routes/parts-tracker/BomTruncatableText.js";
import { cn } from "@renderer/lib/cn.js";

interface Props {
  result: BomDiffResult;
  changesOnly?: boolean;
}

const KIND_ROW_CLASS: Record<BomDiffChangeKind, string> = {
  added: "bg-state-success/5",
  removed: "bg-state-danger/5",
  quantityChanged: "bg-amber-500/5",
  revisionChanged: "bg-accent-secondary/5",
  unchanged: "",
};

export function BomDiffResultPanel({ result, changesOnly = false }: Props): JSX.Element {
  const entries = changesOnly
    ? result.entries.filter((e) => e.kind !== "unchanged")
    : result.entries;

  const parentRowContext = useMemo(
    () =>
      buildBomParentRowContext(
        entries.map((e) => ({
          partNumber: e.partNumber,
          assemblyPath: e.assemblyPath,
        }))
      ),
    [entries]
  );

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md bg-bg-elevated/50 px-3 py-2 text-sm">
        <p className="font-medium">{result.summaryText}</p>
        <p className="mt-1 text-fg-subtle">
          比較元（前回）: {result.aLabel} → 比較先（今回）: {result.bLabel}
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border border-border-subtle">
        <table className="w-full min-w-[52rem] border-collapse text-sm leading-tight">
          <thead className="sticky top-0 z-10 bg-bg-elevated/95 text-sm uppercase tracking-wider text-fg-muted backdrop-blur-sm">
            <tr>
              <th className={cn("min-w-[3.5rem] text-center", BOM_TABLE_HEAD)}>構造</th>
              <th className={cn("min-w-[4.5rem] text-left", BOM_TABLE_HEAD)}>区分</th>
              <th className={cn("min-w-[12rem] text-left", BOM_TABLE_PART_NUMBER_HEAD)}>品番</th>
              <th className={cn("min-w-[10rem] text-left", BOM_TABLE_HEAD)}>名称</th>
              <th className={cn("min-w-[7rem] text-right", BOM_TABLE_HEAD)}>比較元 数量 / Rev</th>
              <th className={cn("min-w-[7rem] text-right", BOM_TABLE_HEAD)}>比較先 数量 / Rev</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-fg-muted">
                  表示する差分がありません。
                </td>
              </tr>
            ) : (
              entries.map((e) => {
                const isParentRow = isBomParentAssemblyRow(
                  { partNumber: e.partNumber, assemblyPath: e.assemblyPath },
                  parentRowContext
                );
                const diffBg = KIND_ROW_CLASS[e.kind];
                return (
                <tr
                  key={e.matchKey}
                  className={cn("border-t border-border-subtle", diffBg)}
                >
                  <td className={cn("text-center", BOM_TABLE_CELL)}>
                    <BomStructureBadge isParent={isParentRow} />
                  </td>
                  <td className={cn("text-fg-muted", BOM_TABLE_CELL)}>
                    {BOM_DIFF_CHANGE_LABELS[e.kind]}
                  </td>
                  <td className={BOM_TABLE_PART_NUMBER_CELL}>
                    <BomTruncatableText
                      value={e.partNumber}
                      mono
                      emphasize
                      ariaLabel={`品番 ${e.partNumber}`}
                    />
                  </td>
                  <td className={BOM_TABLE_CELL}>
                    <BomTruncatableText value={e.partName} ariaLabel={`名称 ${e.partName}`} />
                  </td>
                  <td className={cn("text-right text-fg-muted", BOM_TABLE_CELL)}>
                    {e.a ? `${e.a.quantity} / ${e.a.revision ?? "—"}` : "—"}
                  </td>
                  <td className={cn("text-right text-fg-muted", BOM_TABLE_CELL)}>
                    {e.b ? `${e.b.quantity} / ${e.b.revision ?? "—"}` : "—"}
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

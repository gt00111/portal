import type { BomDiffChangeKind, BomDiffResult } from "@shared/bomDiff.js";
import { BOM_DIFF_CHANGE_LABELS } from "@shared/bomDiff.js";

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

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md bg-bg-elevated/50 px-3 py-2 text-sm">
        <p className="font-medium">{result.summaryText}</p>
        <p className="mt-1 text-fg-subtle">
          比較元（前回）: {result.aLabel} → 比較先（今回）: {result.bLabel}
        </p>
      </div>
      <div className="max-h-[min(32rem,60vh)] overflow-auto rounded-md border border-border-subtle">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-elevated text-sm uppercase tracking-wider">
            <tr>
              <th className="px-2 py-1 text-left">区分</th>
              <th className="px-2 py-1 text-left">品番</th>
              <th className="px-2 py-1 text-left">名称</th>
              <th className="px-2 py-1 text-right">比較元 数量 / Rev</th>
              <th className="px-2 py-1 text-right">比較先 数量 / Rev</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-fg-muted">
                  表示する差分がありません。
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr
                  key={e.matchKey}
                  className={cn("border-t border-border-subtle", KIND_ROW_CLASS[e.kind])}
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

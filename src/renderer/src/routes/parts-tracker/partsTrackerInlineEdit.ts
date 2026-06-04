import type {
  PartLineStatus,
  PartSourceType,
  ProjectPartLine,
  SourceTabFilter,
} from "@shared/partsTracker.js";

export interface LineInlineDraft {
  sourceType: PartSourceType;
  supplierId: number | null;
  status: PartLineStatus;
}

export const SOURCE_TAB_OPTIONS: Array<{ id: SourceTabFilter; label: string }> = [
  { id: "all", label: "すべて" },
  { id: "unset", label: "未設定" },
  { id: "purchase", label: "購入" },
  { id: "inhouse", label: "社内製作" },
  { id: "supplied", label: "支給品" },
];

export function draftFromLine(line: ProjectPartLine): LineInlineDraft {
  return {
    sourceType: line.sourceType,
    supplierId: line.supplierId,
    status: line.status,
  };
}

export function isDraftDirty(line: ProjectPartLine, draft: LineInlineDraft | undefined): boolean {
  if (!draft) return false;
  return (
    draft.sourceType !== line.sourceType ||
    draft.supplierId !== line.supplierId ||
    draft.status !== line.status
  );
}

export function countBySourceTab(lines: ProjectPartLine[]): Record<SourceTabFilter, number> {
  const counts: Record<SourceTabFilter, number> = {
    all: lines.length,
    unset: 0,
    purchase: 0,
    inhouse: 0,
    supplied: 0,
  };
  for (const line of lines) {
    if (line.sourceType === "unset") counts.unset++;
    else if (line.sourceType === "purchase") counts.purchase++;
    else if (line.sourceType === "inhouse") counts.inhouse++;
    else if (line.sourceType === "supplied") counts.supplied++;
  }
  return counts;
}

export function matchesSourceTab(line: ProjectPartLine, tab: SourceTabFilter): boolean {
  if (tab === "all") return true;
  return line.sourceType === tab;
}

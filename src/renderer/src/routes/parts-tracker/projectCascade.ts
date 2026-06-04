import type { PartsTrackerProjectOption } from "@shared/partsTracker.js";

/** 親番なし案件のカスケード用センチネル */
export const PART_NUMBER_NONE = "__none__";

export function partNumberKey(partNumber: string | null): string {
  const t = (partNumber ?? "").trim();
  return t || PART_NUMBER_NONE;
}

export function partNumberLabel(key: string): string {
  return key === PART_NUMBER_NONE ? "（親番なし）" : key;
}

export function filterProjectsBySearch(
  projects: PartsTrackerProjectOption[],
  query: string
): PartsTrackerProjectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return projects;
  return projects.filter((p) => {
    const hay = [
      p.projectNo ?? "",
      p.projectName ?? "",
      p.companyName,
      p.partNumber ?? "",
      p.deadline,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function uniqueCompanies(projects: PartsTrackerProjectOption[]): string[] {
  const set = new Set<string>();
  for (const p of projects) {
    set.add(p.companyName.trim() || "（客先なし）");
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ja"));
}

export function uniquePartNumbers(
  projects: PartsTrackerProjectOption[],
  companyName: string
): string[] {
  const set = new Set<string>();
  for (const p of projects) {
    const cn = p.companyName.trim() || "（客先なし）";
    if (cn !== companyName) continue;
    set.add(partNumberKey(p.partNumber));
  }
  return [...set].sort((a, b) => {
    if (a === PART_NUMBER_NONE) return 1;
    if (b === PART_NUMBER_NONE) return -1;
    return a.localeCompare(b, "ja");
  });
}

export function projectsInCascade(
  projects: PartsTrackerProjectOption[],
  companyName: string,
  pnKey: string
): PartsTrackerProjectOption[] {
  return projects
    .filter((p) => {
      const cn = p.companyName.trim() || "（客先なし）";
      return cn === companyName && partNumberKey(p.partNumber) === pnKey;
    })
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}

export function projectCascadeLabel(p: PartsTrackerProjectOption): string {
  const no = p.projectNo ? `${p.projectNo} · ` : "";
  const name = p.projectName ?? "（名称未設定）";
  return `${no}${name} — 納期 ${p.deadline}（${p.lineCount} 行）`;
}

export function resolveCascadeFromProjectId(
  projects: PartsTrackerProjectOption[],
  projectId: string
): { companyName: string; partNumberKey: string } | null {
  const hit = projects.find((p) => p.id === projectId);
  if (!hit) return null;
  return {
    companyName: hit.companyName.trim() || "（客先なし）",
    partNumberKey: partNumberKey(hit.partNumber),
  };
}

/** 同一親番の直近過去案件（納期降順、自分除外） */
export function findLatestPastProject(
  projects: PartsTrackerProjectOption[],
  targetId: string,
  partNumber: string | null
): PartsTrackerProjectOption | null {
  const pn = (partNumber ?? "").trim();
  if (!pn) return null;
  const sorted = [...projects]
    .filter((p) => p.id !== targetId && (p.partNumber ?? "").trim() === pn)
    .sort((a, b) => b.deadline.localeCompare(a.deadline));
  return sorted[0] ?? null;
}

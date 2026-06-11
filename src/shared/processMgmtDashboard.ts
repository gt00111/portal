import type { PmBoardTask } from "./processMgmt.js";

export const PM_DASHBOARD_STALE_DAYS_DEFAULT = 7;

const DASHBOARD_PROCESS_TYPES = ["solidworks", "cadmac"] as const;

export interface PmDashboardGroupMember {
  userNameId: number;
  userName: string;
}

export interface PmDashboardGroupContext {
  groupNameId: number;
  groupName: string;
  members: PmDashboardGroupMember[];
}

export interface PmMemberWorkload {
  userNameId: number;
  userName: string;
  working: number;
  paused: number;
  notStarted: number;
  supportActive: number;
  avgWorkingProgressPercent: number | null;
  activeSnippets: string[];
}

export interface PmStaleTaskItem {
  taskId: number;
  seisanProjectNo: string | null;
  projectName: string;
  processType: string;
  assignee: string;
  updatedAt: string;
  staleDays: number;
}

export interface PmMonthlySummary {
  completedCount: number;
  avgCompletionDays: number | null;
  handoffCount: number;
  parallelRatePercent: number | null;
  parallelProjectCount: number;
  totalProjectCount: number;
}

export interface PmProcessBottleneckRow {
  processType: string;
  completedThisMonth: number;
  avgWorkDays: number | null;
  pausedCount: number;
  workingCount: number;
}

export interface PmDashboardAnalytics {
  staleTasks: PmStaleTaskItem[];
  monthly: PmMonthlySummary;
  processBottlenecks: PmProcessBottleneckRow[];
}

export function getLocalMonthRange(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

export function diffCalendarDays(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  const fromDay = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((toDay - fromDay) / 86400000);
}

export function computeAvgCompletionDays(tasks: PmBoardTask[]): number | null {
  const durations: number[] = [];
  for (const t of tasks) {
    if (!t.startedAt?.trim() || !t.completedAt?.trim()) continue;
    const days = diffCalendarDays(t.startedAt, t.completedAt);
    if (days >= 0) durations.push(days);
  }
  if (durations.length === 0) return null;
  const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  return Math.round(avg * 10) / 10;
}

export function computeParallelRate(activeTasks: PmBoardTask[]): {
  parallelRatePercent: number | null;
  parallelProjectCount: number;
  totalProjectCount: number;
} {
  const projectIds = new Set<string>();
  const parallelIds = new Set<string>();
  for (const t of activeTasks) {
    const sid = t.seisanProjectId?.trim();
    if (!sid) continue;
    projectIds.add(sid);
    if (t.workMode === "parallel") {
      parallelIds.add(sid);
    }
  }
  const total = projectIds.size;
  if (total === 0) {
    return { parallelRatePercent: null, parallelProjectCount: 0, totalProjectCount: 0 };
  }
  return {
    parallelRatePercent: Math.round((parallelIds.size / total) * 100),
    parallelProjectCount: parallelIds.size,
    totalProjectCount: total,
  };
}

export function computeStaleTasks(
  boardTasks: PmBoardTask[],
  staleDays = PM_DASHBOARD_STALE_DAYS_DEFAULT,
  now = new Date()
): PmStaleTaskItem[] {
  const nowIso = now.toISOString();
  return boardTasks
    .filter((t) => t.status !== "完了")
    .map((t) => ({
      task: t,
      staleDays: diffCalendarDays(t.updatedAt, nowIso),
    }))
    .filter(({ staleDays: days }) => days >= staleDays)
    .sort((a, b) => b.staleDays - a.staleDays)
    .map(({ task: t, staleDays: days }) => ({
      taskId: t.id,
      seisanProjectNo: t.seisanProjectNo,
      projectName: t.projectName?.trim() || t.title?.trim() || "—",
      processType: t.processType,
      assignee: t.assignee.trim() || "—",
      updatedAt: t.updatedAt,
      staleDays: days,
    }));
}

export function computeProcessBottlenecks(
  activeTasks: PmBoardTask[],
  completedThisMonth: PmBoardTask[]
): PmProcessBottleneckRow[] {
  return DASHBOARD_PROCESS_TYPES.map((processType) => {
    const active = activeTasks.filter((t) => t.processType === processType);
    const completed = completedThisMonth.filter((t) => t.processType === processType);
    return {
      processType,
      completedThisMonth: completed.length,
      avgWorkDays: computeAvgCompletionDays(completed),
      pausedCount: active.filter((t) => t.status === "一時中断").length,
      workingCount: active.filter((t) => t.status === "作業中").length,
    };
  });
}

export function buildDashboardAnalytics(
  activeTasks: PmBoardTask[],
  completedThisMonth: PmBoardTask[],
  handoffCount: number,
  staleDays = PM_DASHBOARD_STALE_DAYS_DEFAULT,
  now = new Date()
): PmDashboardAnalytics {
  const parallel = computeParallelRate(activeTasks);
  return {
    staleTasks: computeStaleTasks(activeTasks, staleDays, now),
    monthly: {
      completedCount: completedThisMonth.length,
      avgCompletionDays: computeAvgCompletionDays(completedThisMonth),
      handoffCount,
      parallelRatePercent: parallel.parallelRatePercent,
      parallelProjectCount: parallel.parallelProjectCount,
      totalProjectCount: parallel.totalProjectCount,
    },
    processBottlenecks: computeProcessBottlenecks(activeTasks, completedThisMonth),
  };
}

function isNotStarted(status: string): boolean {
  return status !== "作業中" && status !== "完了" && status !== "一時中断";
}

function taskSnippet(t: PmBoardTask): string {
  return t.seisanProjectNo?.trim() || t.projectName?.trim() || t.title || "—";
}

export function computeMemberWorkloads(
  members: PmDashboardGroupMember[],
  boardTasks: PmBoardTask[]
): PmMemberWorkload[] {
  const activeBoard = boardTasks.filter((t) => t.status !== "完了");

  return members.map((m) => {
    const name = m.userName.trim();
    const primary = activeBoard.filter((t) => t.assignee.trim() === name);
    const workingTasks = primary.filter((t) => t.status === "作業中");
    const paused = primary.filter((t) => t.status === "一時中断").length;
    const notStarted = primary.filter((t) => isNotStarted(t.status)).length;
    const avg =
      workingTasks.length > 0
        ? Math.round(workingTasks.reduce((s, t) => s + t.progressPercent, 0) / workingTasks.length)
        : null;

    const supportActive = activeBoard.filter((t) =>
      (t.supportAssignees ?? []).some(
        (s) => s.username.trim() === name || (m.userNameId > 0 && s.userNameId === m.userNameId)
      )
    ).length;

    const activeSnippets = primary
      .filter((t) => t.status === "作業中" || t.status === "一時中断")
      .slice(0, 3)
      .map(taskSnippet);

    return {
      userNameId: m.userNameId,
      userName: m.userName,
      working: workingTasks.length,
      paused,
      notStarted,
      supportActive,
      avgWorkingProgressPercent: avg,
      activeSnippets,
    };
  });
}

export function collectBoardAssignees(boardTasks: PmBoardTask[]): PmDashboardGroupMember[] {
  const byKey = new Map<string, PmDashboardGroupMember>();
  for (const t of boardTasks) {
    if (t.status === "完了") continue;
    const name = t.assignee.trim();
    if (name) {
      const key = name.toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, {
          userNameId: t.assigneeUserNameId ?? 0,
          userName: name,
        });
      }
    }
    for (const s of t.supportAssignees ?? []) {
      const sn = s.username.trim();
      if (!sn) continue;
      const key = sn.toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, { userNameId: s.userNameId, userName: sn });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.userName.localeCompare(b.userName, "ja"));
}

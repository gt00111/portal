import { useMemo, useState } from "react";
import { ClipboardPenLine, LayoutGrid } from "lucide-react";

import type { PmBoardTask, PmTaskCompletionNotification } from "@shared/processMgmt.js";
import {
  computeMemberWorkloads,
  type PmDashboardAnalytics,
  type PmDashboardGroupContext,
  type PmMemberWorkload,
  type PmProcessBottleneckRow,
} from "@shared/processMgmtDashboard.js";
import type { SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { cn } from "@renderer/lib/cn.js";
import { formatBoardDateTime, isTodayIso } from "@renderer/routes/process-management/processMgmtBoardUtils.js";
import { processTypeLabel } from "@renderer/routes/process-management/processMgmtLabels.js";
import { PmTaskStatusBadge } from "@renderer/routes/process-management/processMgmtStatusBadge.js";

function primaryTaskLabel(t: PmBoardTask): string {
  return t.seisanProjectNo?.trim() || t.projectName?.trim() || t.title?.trim() || "—";
}

function formatDays(value: number | null, suffix = "日"): string {
  if (value == null) return "—";
  return `${value}${suffix}`;
}

function formatPercent(value: number | null): string {
  if (value == null) return "—";
  return `${value}％`;
}

export function ProcessMgmtDashboard({
  session,
  boardTasks,
  myTasks,
  notifications,
  notificationsLoading,
  analytics,
  groupContext,
  onRefreshNotifications,
  onGoBoard,
  onGoMyTasks,
  onFilterBoardByAssignee,
}: {
  session: SessionUser;
  boardTasks: PmBoardTask[];
  myTasks: PmBoardTask[];
  notifications: PmTaskCompletionNotification[];
  notificationsLoading: boolean;
  analytics: PmDashboardAnalytics | null;
  groupContext: PmDashboardGroupContext | null;
  onRefreshNotifications: () => void;
  onGoBoard: () => void;
  onGoMyTasks: () => void;
  onFilterBoardByAssignee: (assignee: string) => void;
}): JSX.Element {
  const [staleModalOpen, setStaleModalOpen] = useState(false);

  const summary = useMemo(() => {
    const active = boardTasks;
    return {
      working: active.filter((t) => t.status === "作業中").length,
      paused: active.filter((t) => t.status === "一時中断").length,
      notStarted: active.filter((t) => t.status !== "作業中" && t.status !== "完了" && t.status !== "一時中断")
        .length,
    };
  }, [boardTasks]);

  const memberWorkloads = useMemo((): PmMemberWorkload[] => {
    const members = groupContext?.members ?? [];
    return computeMemberWorkloads(members, boardTasks);
  }, [boardTasks, groupContext]);

  const myPrimary = myTasks.filter((t) => t.myTaskRole !== "support");
  const todayStarted = myPrimary.filter((t) => isTodayIso(t.startedAt)).length;
  const todayCompleted = myPrimary.filter((t) => isTodayIso(t.completedAt)).length;
  const notStartedMine = myPrimary.filter(
    (t) => t.status !== "作業中" && t.status !== "完了" && t.status !== "一時中断"
  ).length;

  const handoffNotify = notifications.filter((n) => n.summary?.kind === "handoff");
  const ganttNotify = notifications.filter((n) => n.summary?.kind === "gantt_duration");
  const completeNotify = notifications.filter(
    (n) => !n.summary?.kind || n.summary.kind === "task_complete"
  );

  const staleCount = analytics?.staleTasks.length ?? 0;
  const monthly = analytics?.monthly;
  const processBottlenecks = analytics?.processBottlenecks ?? [];

  return (
    <section className="space-y-6">
      <p className="text-sm text-fg-muted">
        {session.username} さん、工程の概要です。滞留や月次実績は下段の分析ブロックを参照してください。
      </p>

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-subtle">現在の状況</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="作業中" value={summary.working} tone="working" />
          <SummaryCard label="一時中断" value={summary.paused} tone="paused" />
          <SummaryCard label="未着手（全体）" value={summary.notStarted} tone="idle" />
          <SummaryCard label="自分の未着手" value={notStartedMine} tone="mine" />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-subtle">分析サマリー（当月）</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="放置タスク"
            value={staleCount}
            tone="stale"
            clickable
            onClick={() => setStaleModalOpen(true)}
            hint="7日以上未更新"
          />
          <SummaryCard
            label="今月完了"
            value={monthly?.completedCount ?? 0}
            tone="completed"
            suffix="件"
          />
          <SummaryCard
            label="今月平均"
            value={monthly?.avgCompletionDays ?? null}
            tone="avg"
            displayValue={formatDays(monthly?.avgCompletionDays ?? null)}
          />
          <SummaryCard
            label="並行率"
            value={monthly?.parallelRatePercent ?? null}
            tone="parallel"
            displayValue={formatPercent(monthly?.parallelRatePercent ?? null)}
          />
        </div>
        {monthly != null ? (
          <p className="mt-2 text-xs text-fg-muted">
            今月引渡し: <span className="font-semibold tabular-nums text-fg-primary">{monthly.handoffCount}</span> 回
            {monthly.totalProjectCount > 0 ? (
              <>
                {" "}
                · 並行案件 {monthly.parallelProjectCount} / {monthly.totalProjectCount}
              </>
            ) : null}
          </p>
        ) : (
          <p className="mt-2 text-xs text-fg-muted">分析データを読み込み中…</p>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-subtle">詳細ブロック</h2>
        <div className="grid gap-4 xl:grid-cols-3">
          <MemberWorkloadPanel
            groupContext={groupContext}
            memberWorkloads={memberWorkloads}
            onFilterBoardByAssignee={onFilterBoardByAssignee}
          />

          <ProcessBottleneckPanel rows={processBottlenecks} />

          <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg-primary">通知（未確認）</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={notificationsLoading}
                onClick={onRefreshNotifications}
              >
                更新
              </Button>
            </div>
            {notificationsLoading ? (
              <p className="mt-3 text-sm text-fg-muted">読み込み中…</p>
            ) : notifications.length === 0 ? (
              <p className="mt-3 text-sm text-fg-muted">未確認の通知はありません。</p>
            ) : (
              <div className="mt-4 space-y-4">
                <NotifyGroup title="CADへ受渡し" items={handoffNotify} />
                <NotifyGroup title="ガント変更" items={ganttNotify} />
                <NotifyGroup title="完了報告" items={completeNotify} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg-primary">自分の担当</h2>
          <ul className="mt-3 space-y-2 text-sm text-fg-muted">
            <li>
              今日着手: <span className="font-semibold tabular-nums text-fg-primary">{todayStarted}</span> 件
            </li>
            <li>
              今日完了: <span className="font-semibold tabular-nums text-fg-primary">{todayCompleted}</span> 件
            </li>
            <li>
              未着手（主担当）:{" "}
              <span className="font-semibold tabular-nums text-fg-primary">{notStartedMine}</span> 件
            </li>
          </ul>
          <Button type="button" variant="secondary" size="sm" className="mt-4 gap-1.5" onClick={onGoMyTasks}>
            <ClipboardPenLine className="h-4 w-4" aria-hidden />
            マイタスクへ
          </Button>
        </div>

        <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg-primary">クイックリンク</h2>
          <Button type="button" variant="secondary" size="sm" className="mt-3 gap-1.5" onClick={onGoBoard}>
            <LayoutGrid className="h-4 w-4" aria-hidden />
            ボード一覧へ
          </Button>
        </div>
      </div>

      {myPrimary.length > 0 ? (
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg-primary">主担当タスク（抜粋）</h2>
          <ul className="mt-3 space-y-2">
            {myPrimary.slice(0, 5).map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border-subtle/80 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-semibold text-fg-primary">
                  {primaryTaskLabel(t)}
                </span>
                <PmTaskStatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Modal open={staleModalOpen} onClose={() => setStaleModalOpen(false)} title="放置タスク" width="xl">
        {analytics == null ? (
          <p className="px-6 pb-6 text-sm text-fg-muted">読み込み中…</p>
        ) : analytics.staleTasks.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-fg-muted">7日以上更新されていない未完了タスクはありません。</p>
        ) : (
          <div className="overflow-x-auto px-6 pb-6">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border-subtle text-xs text-fg-subtle">
                <tr>
                  <th className="px-2 py-2">製番</th>
                  <th className="px-2 py-2">案件名</th>
                  <th className="px-2 py-2">工程</th>
                  <th className="px-2 py-2">担当</th>
                  <th className="px-2 py-2">最終更新日時</th>
                  <th className="px-2 py-2 text-right tabular-nums">放置日数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {analytics.staleTasks.map((row) => (
                  <tr key={row.taskId} className="text-fg-primary">
                    <td className="px-2 py-2 tabular-nums">{row.seisanProjectNo?.trim() || "—"}</td>
                    <td className="px-2 py-2">{row.projectName}</td>
                    <td className="px-2 py-2">{processTypeLabel(row.processType)}</td>
                    <td className="px-2 py-2">{row.assignee}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatBoardDateTime(row.updatedAt)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.staleDays}日</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </section>
  );
}

function MemberWorkloadPanel({
  groupContext,
  memberWorkloads,
  onFilterBoardByAssignee,
}: {
  groupContext: PmDashboardGroupContext | null;
  memberWorkloads: PmMemberWorkload[];
  onFilterBoardByAssignee: (assignee: string) => void;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <h2 className="text-sm font-semibold text-fg-primary">メンバーの作業状況</h2>
      {groupContext ? (
        <p className="mt-1 text-xs text-fg-muted">自グループ（{groupContext.groupName}）</p>
      ) : null}
      {memberWorkloads.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">表示対象のメンバーがいません。</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border-subtle text-xs text-fg-subtle">
              <tr>
                <th className="px-2 py-2">担当者</th>
                <th className="px-2 py-2 text-right tabular-nums">作業中</th>
                <th className="px-2 py-2 text-right tabular-nums">一時中断</th>
                <th className="px-2 py-2 text-right tabular-nums">未着手</th>
                <th className="px-2 py-2 text-right tabular-nums">補助</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {memberWorkloads.map((row) => (
                <tr key={row.userName} className="text-fg-primary">
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      className="font-medium text-accent-primary hover:underline"
                      onClick={() => onFilterBoardByAssignee(row.userName)}
                    >
                      {row.userName}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.working}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.paused}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.notStarted}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.supportActive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProcessBottleneckPanel({ rows }: { rows: PmProcessBottleneckRow[] }): JSX.Element {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <h2 className="text-sm font-semibold text-fg-primary">工程別分析</h2>
      <p className="mt-1 text-xs text-fg-muted">工程ごとの負荷・停滞（順位表示なし）</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">データがありません。</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div
              key={row.processType}
              className="rounded border border-border-subtle/80 bg-bg-elevated/40 px-3 py-3 text-sm"
            >
              <p className="font-semibold text-fg-primary">{processTypeLabel(row.processType)}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-fg-muted">
                <div>
                  <dt>今月完了</dt>
                  <dd className="font-semibold tabular-nums text-fg-primary">{row.completedThisMonth}件</dd>
                </div>
                <div>
                  <dt>平均作業日数</dt>
                  <dd className="font-semibold tabular-nums text-fg-primary">
                    {formatDays(row.avgWorkDays)}
                  </dd>
                </div>
                <div>
                  <dt>一時中断</dt>
                  <dd className="font-semibold tabular-nums text-fg-primary">{row.pausedCount}件</dd>
                </div>
                <div>
                  <dt>作業中</dt>
                  <dd className="font-semibold tabular-nums text-fg-primary">{row.workingCount}件</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  suffix,
  displayValue,
  clickable,
  onClick,
  hint,
}: {
  label: string;
  value: number | null;
  tone: "working" | "paused" | "idle" | "mine" | "stale" | "completed" | "avg" | "parallel";
  suffix?: string;
  displayValue?: string;
  clickable?: boolean;
  onClick?: () => void;
  hint?: string;
}): JSX.Element {
  const toneClass =
    tone === "working"
      ? "border-emerald-500/30 bg-emerald-500/8"
      : tone === "paused"
        ? "border-orange-500/30 bg-orange-500/8"
        : tone === "stale"
          ? "border-rose-500/30 bg-rose-500/8"
          : tone === "completed"
            ? "border-sky-500/30 bg-sky-500/8"
            : tone === "avg" || tone === "parallel"
              ? "border-violet-500/30 bg-violet-500/8"
              : "border-border-subtle bg-bg-elevated/50";

  const mainText =
    displayValue ?? (value != null ? `${value}${suffix ?? ""}` : "—");

  const inner = (
    <>
      <p className="text-xs text-fg-muted">{label}</p>
      {hint ? <p className="text-[10px] text-fg-subtle">{hint}</p> : null}
      <p className="mt-1 text-2xl font-bold tabular-nums text-fg-primary">{mainText}</p>
    </>
  );

  if (clickable && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "rounded-lg border p-4 text-left transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary",
          toneClass
        )}
      >
        {inner}
      </button>
    );
  }

  return <div className={cn("rounded-lg border p-4", toneClass)}>{inner}</div>;
}

function NotifyGroup({
  title,
  items,
}: {
  title: string;
  items: PmTaskCompletionNotification[];
}): JSX.Element {
  return (
    <div>
      <h3 className="text-xs font-semibold text-fg-subtle">
        {title}（{items.length}）
      </h3>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-fg-muted">なし</p>
      ) : (
        <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-fg-muted">
          {items.slice(0, 5).map((n) => (
            <li key={n.id} className="truncate">
              {n.summary?.message ?? n.summary?.projectName ?? "通知"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

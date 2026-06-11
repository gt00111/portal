import { cn } from "@renderer/lib/cn.js";

/** §8.7.7 状態バッジ — ボード・マイタスク・サイドパネル・ダッシュボード共通 */

export function pmTaskStatusBadgeClass(status: string): string {
  const s = status.trim();
  if (s === "完了" || s === "done") {
    return "border-blue-500/50 bg-blue-500/12 text-blue-700 dark:text-blue-300";
  }
  if (s === "作業中" || s === "in_progress") {
    return "border-emerald-500/50 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
  }
  if (s === "blocked" || s === "一時中断") {
    return "border-orange-500/55 bg-orange-500/15 text-orange-700 dark:text-orange-300";
  }
  return "border-border-subtle bg-bg-elevated text-fg-muted";
}

export function pmTaskStatusDotClass(status: string): string {
  const s = status.trim();
  if (s === "完了" || s === "done") return "bg-blue-500";
  if (s === "作業中" || s === "in_progress") return "bg-emerald-500";
  if (s === "blocked" || s === "一時中断") return "bg-orange-500";
  return "bg-fg-muted/50";
}

export function PmTaskStatusBadge({
  status,
  className,
  showDot = true,
}: {
  status: string;
  className?: string;
  showDot?: boolean;
}): JSX.Element {
  const label = status.trim() || "—";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold",
        pmTaskStatusBadgeClass(status),
        className
      )}
    >
      {showDot ? (
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", pmTaskStatusDotClass(status))}
          aria-hidden
        />
      ) : null}
      {label}
    </span>
  );
}

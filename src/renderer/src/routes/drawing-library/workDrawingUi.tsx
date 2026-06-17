import { cn } from "@renderer/lib/cn.js";

export function CurrentRevisionBadge({ isCurrent }: { isCurrent: boolean }): JSX.Element {
  if (isCurrent) {
    return (
      <span className="inline-flex w-fit items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
        現行
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] font-medium text-fg-muted"
      )}
    >
      旧図面
    </span>
  );
}

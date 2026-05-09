import { cn } from "@renderer/lib/cn.js";

export function ObsoleteOverlay({ show, className }: { show: boolean; className?: string }): JSX.Element | null {
  if (!show) {
    return null;
  }
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[inherit] bg-bg-base/55 backdrop-blur-[0.5px]",
        className
      )}
    >
      <span className="rounded-full bg-state-warning/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-state-warning shadow-sm ring-1 ring-state-warning/35">
        旧図面
      </span>
    </div>
  );
}

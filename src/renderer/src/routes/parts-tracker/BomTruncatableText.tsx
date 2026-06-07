import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { truncateBomTableText } from "@shared/bomTableText.js";

import { cn } from "@renderer/lib/cn.js";

interface Props {
  value: string | null | undefined;
  /** 空・null のときの表示 */
  emptyLabel?: string;
  className?: string;
  /** 品番・親品番向け */
  mono?: boolean;
  /** 品番ヘッダー重視に合わせた強調 */
  emphasize?: boolean;
  ariaLabel?: string;
}

export function BomTruncatableText({
  value,
  emptyLabel = "—",
  className,
  mono = false,
  emphasize = false,
  ariaLabel,
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const popoverId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const raw = value?.trim() ?? "";
  if (!raw) {
    return <span className={cn("whitespace-nowrap text-sm text-fg-subtle", className)}>{emptyLabel}</span>;
  }

  const { display, isTruncated, full } = truncateBomTableText(raw);

  useEffect(() => {
    if (!expanded) {
      setPopoverPos(null);
      return;
    }
    const updatePos = (): void => {
      const el = buttonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 4, left: rect.left });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      const pop = document.getElementById(popoverId);
      if (pop?.contains(target)) return;
      setExpanded(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded, popoverId]);

  const label = ariaLabel ?? full;

  if (!isTruncated) {
    return (
      <span
        className={cn(
          "inline-block max-w-full whitespace-nowrap text-sm",
          mono && "font-mono",
          emphasize && "font-semibold text-fg-primary",
          className
        )}
      >
        {full}
      </span>
    );
  }

  const popover =
    expanded && popoverPos
      ? createPortal(
          <span
            id={popoverId}
            role="tooltip"
            style={{ top: popoverPos.top, left: popoverPos.left }}
            className={cn(
              "fixed z-[80] block max-w-[min(28rem,calc(100vw-1.5rem))]",
              "whitespace-normal break-all rounded-md border border-border-strong bg-bg-surface px-2.5 py-2 text-sm text-fg-primary shadow-lg",
              mono && "font-mono",
              emphasize && "font-semibold"
            )}
          >
            {full}
          </span>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "inline-block max-w-full whitespace-nowrap text-left text-sm transition-colors",
          "cursor-pointer hover:text-accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary rounded-sm",
          mono && "font-mono",
          emphasize && "font-semibold text-fg-primary",
          className
        )}
        aria-label={`${label}（全文を表示）`}
        aria-expanded={expanded}
        aria-controls={expanded ? popoverId : undefined}
        onClick={() => setExpanded((v) => !v)}
      >
        {display}
      </button>
      {popover}
    </>
  );
}

import type { InputHTMLAttributes } from "react";

import { cn } from "@renderer/lib/cn.js";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function TextField({ label, id, className, ...rest }: Props): JSX.Element {
  const inputId = id ?? `field-${label}`;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm">
      <span className="text-fg-muted">{label}</span>
      <input
        id={inputId}
        className={cn(
          "h-10 rounded-lg border border-border-strong bg-bg-surface px-3 text-fg-primary",
          "placeholder:text-fg-subtle",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
          className
        )}
        {...rest}
      />
    </label>
  );
}

import type { SelectHTMLAttributes } from "react";

import { cn } from "@renderer/lib/cn.js";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function Select({ label, id, className, options, ...rest }: Props): JSX.Element {
  const selectId = id ?? `select-${label}`;
  return (
    <label htmlFor={selectId} className="flex flex-col gap-1.5 text-sm">
      <span className="text-fg-muted">{label}</span>
      <select
        id={selectId}
        className={cn(
          "h-10 rounded-lg border border-border-strong bg-bg-surface px-3 text-fg-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
          className
        )}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { MasterRow } from "@shared/master.js";

import { cn } from "@renderer/lib/cn.js";
import {
  filterSuppliers,
  findSupplierById,
  supplierLabel,
} from "@renderer/routes/parts-tracker/supplierComboboxUtils.js";

interface Props {
  suppliers: MasterRow[];
  value: number | null;
  onChange: (supplierId: number | null) => void;
  /** モーダル用ラベル。省略時は aria-label のみ */
  label?: string;
  ariaLabel?: string;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function SupplierCombobox({
  suppliers,
  value,
  onChange,
  label,
  ariaLabel = "商社",
  compact = false,
  className,
  disabled = false,
  placeholder = "コードまたは名称で検索",
}: Props): JSX.Element {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => findSupplierById(suppliers, value), [suppliers, value]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);

  const candidates = useMemo(() => filterSuppliers(suppliers, query), [suppliers, query]);

  const displayValue = open ? query : selected ? supplierLabel(selected) : "";

  const closeList = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlightIndex(0);
  }, []);

  const commitSupplier = useCallback(
    (supplier: MasterRow | null) => {
      onChange(supplier?.id ?? null);
      closeList();
    },
    [closeList, onChange]
  );

  const syncHighlight = useCallback((list: MasterRow[]) => {
    setHighlightIndex(list.length > 0 ? 0 : -1);
  }, []);

  useEffect(() => {
    if (open) syncHighlight(candidates);
  }, [candidates, open, syncHighlight]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeList();
    };
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, [closeList, open]);

  const handleFocus = () => {
    if (disabled) return;
    setOpen(true);
    setQuery(selected ? supplierLabel(selected) : "");
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const handleInputChange = (text: string) => {
    setQuery(text);
    setOpen(true);
  };

  const handleBlur = () => {
    const trimmed = query.trim();
    if (!trimmed) {
      if (selected) commitSupplier(null);
      else closeList();
      return;
    }
    const exact = filterSuppliers(suppliers, trimmed);
    if (exact.length === 1) {
      commitSupplier(exact[0] ?? null);
      return;
    }
    if (highlightIndex >= 0 && candidates[highlightIndex]) {
      commitSupplier(candidates[highlightIndex] ?? null);
      return;
    }
    closeList();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeList();
      inputRef.current?.blur();
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (candidates.length === 0) return;
      setHighlightIndex((i) => (i + 1) % candidates.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (candidates.length === 0) return;
      setHighlightIndex((i) => (i <= 0 ? candidates.length - 1 : i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && candidates[highlightIndex]) {
        commitSupplier(candidates[highlightIndex] ?? null);
        inputRef.current?.blur();
        return;
      }
      if (candidates.length === 1) {
        commitSupplier(candidates[0] ?? null);
        inputRef.current?.blur();
      }
    }
  };

  const inputClass = cn(
    "w-full rounded border border-border-strong bg-bg-surface text-fg-primary placeholder:text-fg-subtle",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-primary",
    compact ? "h-7 min-w-[8rem] max-w-[13rem] px-2 py-0 text-sm" : "h-10 px-3 text-sm"
  );

  const field = (
    <div ref={rootRef} className={cn("relative", compact ? "min-w-[8rem] max-w-[13rem]" : "w-full", className)}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={label ?? ariaLabel}
        className={inputClass}
        value={displayValue}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={handleFocus}
        onChange={(e) => handleInputChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {open && candidates.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            "absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border-strong bg-bg-surface py-1 shadow-lg",
            compact ? "min-w-[14rem]" : ""
          )}
        >
          {candidates.map((s, index) => (
            <li key={s.id} role="option" aria-selected={index === highlightIndex}>
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-1.5 text-left text-sm text-fg-primary hover:bg-bg-elevated",
                  index === highlightIndex && "bg-accent-primary/10 text-accent-primary"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  commitSupplier(s);
                  inputRef.current?.blur();
                }}
              >
                {supplierLabel(s)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && candidates.length === 0 && query.trim() ? (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-xs text-fg-muted shadow-lg">
          該当する商社がありません
        </div>
      ) : null}
    </div>
  );

  if (label) {
    return (
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-fg-muted">{label}</span>
        {field}
      </label>
    );
  }

  return field;
}

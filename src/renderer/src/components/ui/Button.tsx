import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@renderer/lib/cn.js";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-accent-primary/90 hover:bg-accent-primary text-white shadow-glow disabled:opacity-50",
  secondary:
    "bg-bg-elevated hover:bg-bg-elevated/80 text-fg-primary border border-border-strong disabled:opacity-50",
  ghost: "bg-transparent hover:bg-bg-surface text-fg-primary disabled:opacity-50",
  danger:
    "bg-state-danger/90 hover:bg-state-danger text-white disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 min-w-0 px-2.5 text-xs sm:px-3 sm:text-sm",
  md: "h-10 min-w-0 px-3 text-sm sm:px-4",
  lg: "min-h-12 min-w-0 px-4 text-sm sm:h-12 sm:px-6 sm:text-base",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "min-w-0 max-w-full whitespace-normal break-words text-center leading-snug",
        "[&_svg]:shrink-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

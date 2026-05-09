import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@renderer/lib/cn.js";

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...rest }: Props): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border-subtle bg-bg-surface/80 p-6 backdrop-blur",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

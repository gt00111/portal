import { X } from "lucide-react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@renderer/lib/cn.js";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** `full` はビューポート周囲に余白を取り、パネルをほぼ全画面に広げます。 */
  width?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
}

const widths = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
  "2xl": "max-w-6xl",
} as const;

export function Modal({ open, title, onClose, children, width = "md" }: Props): JSX.Element {
  const isFull = width === "full";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "fixed inset-0 z-40 flex bg-bg-base/80 backdrop-blur",
            isFull ? "items-stretch justify-stretch p-3 sm:p-4 md:p-5" : "items-center justify-center p-4"
          )}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex w-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface shadow-xl",
              isFull
                ? "max-h-full min-h-0 flex-1"
                : `${widths[width as keyof typeof widths]} max-h-[calc(100vh-2rem)] overflow-y-auto`
            )}
          >
            <div
              className={cn(
                "flex shrink-0 items-center justify-between",
                isFull
                  ? "border-b border-border-subtle px-4 py-3 sm:px-6 sm:py-4"
                  : "px-6 pt-6 pb-3"
              )}
            >
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto",
                isFull ? "px-4 py-4 sm:px-6 sm:py-5" : "px-6 pb-6 pt-1"
              )}
            >
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

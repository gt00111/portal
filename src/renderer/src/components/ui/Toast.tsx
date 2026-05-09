import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

type ToastKind = "success" | "warning" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContext {
  push: (kind: ToastKind, message: string) => void;
}

const Ctx = createContext<ToastContext | null>(null);

export function useToast(): ToastContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ToastProvider が必要です。");
  return ctx;
}

const icons: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 size={18} className="text-state-success" />,
  warning: <AlertTriangle size={18} className="text-state-warning" />,
  error: <XCircle size={18} className="text-state-danger" />,
  info: <Info size={18} className="text-accent-primary" />,
};

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const value = useMemo<ToastContext>(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-6 top-6 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 32 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto flex min-w-[260px] items-start gap-2 rounded-lg border border-border-subtle bg-bg-elevated/95 p-3 text-sm shadow-lg backdrop-blur"
            >
              {icons[t.kind]}
              <p className="flex-1 leading-snug">{t.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

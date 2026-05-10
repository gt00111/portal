import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  mottos: string[];
  intervalMs?: number;
}

export function HeroCarousel({ mottos, intervalMs = 4200 }: Props): JSX.Element {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (mottos.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % mottos.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [mottos.length, intervalMs]);

  const current = mottos[index] ?? "";

  return (
    <div className="relative inline-flex w-max max-w-[min(100%,calc(100vw-3rem))] flex-col items-center overflow-visible">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, rotateY: 35, y: 10 }}
          animate={{ opacity: 1, rotateY: 0, y: 0 }}
          exit={{ opacity: 0, rotateY: -35, y: -10 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
          className="text-center"
        >
          <p className="mb-2 text-sm tracking-[0.3em] text-accent-secondary">OUR PHILOSOPHY</p>
          <p className="bg-gradient-to-r from-accent-primary via-fg-primary to-accent-secondary bg-clip-text text-5xl font-bold leading-tight tracking-wide text-transparent md:text-6xl">
            {current}
          </p>
        </motion.div>
      </AnimatePresence>

      <div className="mt-4 flex items-center gap-2">
        {mottos.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-8 bg-accent-primary" : "w-3 bg-border-strong"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";

import type { AppDescriptor } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";

interface Props {
  app: AppDescriptor;
  onOpen: (appId: string) => void;
}

export function AppSection({ app, onOpen }: Props): JSX.Element {
  return (
    <section id={`app-${app.id}`} className="scroll-mt-20">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <Card className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2 text-xs tracking-widest text-fg-subtle">
              <span>#{app.id}</span>
              <span className="rounded bg-bg-elevated px-2 py-0.5 text-[10px]">
                {app.kind === "internal" ? "内蔵" : "外部"}
              </span>
              {!app.ready && (
                <span className="rounded bg-state-warning/20 px-2 py-0.5 text-[10px] text-state-warning">
                  準備中
                </span>
              )}
            </div>
            <h3 className="mb-1 text-2xl font-semibold text-fg-primary">{app.displayName}</h3>
            <p className="text-sm leading-relaxed text-fg-muted">{app.description}</p>
          </div>
          <div className="flex shrink-0">
            <Button variant="primary" size="lg" onClick={() => onOpen(app.id)}>
              {app.kind === "external" ? "起動" : "開く"}
              <ArrowUpRight size={18} />
            </Button>
          </div>
        </Card>
      </motion.div>
    </section>
  );
}

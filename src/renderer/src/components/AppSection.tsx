import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";

import type { AppDescriptor } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Card } from "@renderer/components/ui/Card.js";
import { getPortalAppListIconUrl } from "@renderer/lib/portalAppBranding.js";

interface Props {
  app: AppDescriptor;
  onOpen: (appId: string) => void;
}

export function AppSection({ app, onOpen }: Props): JSX.Element {
  const listIconUrl = getPortalAppListIconUrl(app.id);

  return (
    <section id={`app-${app.id}`} className="scroll-mt-20">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <Card className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
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
            <div className="mb-1 flex flex-wrap items-center gap-4">
              {listIconUrl ? (
                <img
                  src={listIconUrl}
                  alt=""
                  width={64}
                  height={64}
                  decoding="async"
                  className="h-16 w-16 shrink-0 rounded-xl bg-bg-elevated object-contain shadow-sm ring-1 ring-border-subtle"
                  aria-hidden
                />
              ) : null}
              <h3 className="text-2xl font-semibold text-fg-primary">{app.displayName}</h3>
            </div>
            <p className="break-words text-sm leading-relaxed text-fg-muted">{app.description}</p>
          </div>
          <div className="flex w-full shrink-0 md:w-auto md:justify-end">
            <Button
              variant="primary"
              size="lg"
              className="w-full min-w-0 md:w-auto"
              onClick={() => onOpen(app.id)}
            >
              <span className="min-w-0">{app.kind === "external" ? "起動" : "開く"}</span>
              <ArrowUpRight size={18} className="shrink-0" />
            </Button>
          </div>
        </Card>
      </motion.div>
    </section>
  );
}

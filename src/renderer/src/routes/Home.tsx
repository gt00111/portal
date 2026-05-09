import { useCallback, useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";
import { motion } from "framer-motion";

import type { AppDescriptor, SessionUser, SettingsSnapshot } from "@shared/types.js";

import { AppSection } from "@renderer/components/AppSection.js";
import { HeroCarousel } from "@renderer/components/HeroCarousel.js";
import { Navbar } from "@renderer/components/Navbar.js";
import { Button } from "@renderer/components/ui/Button.js";
import { useToast } from "@renderer/components/ui/Toast.js";
import { invoke } from "@renderer/lib/api.js";

interface Props {
  session: SessionUser;
  settings: SettingsSnapshot;
  onLogout: () => Promise<void>;
}

export function Home({ session, settings, onLogout }: Props): JSX.Element {
  const [apps, setApps] = useState<AppDescriptor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const loadApps = useCallback(async () => {
    try {
      const list = await invoke<AppDescriptor[]>("launcher:list");
      setApps(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  async function openApp(appId: string): Promise<void> {
    setError(null);
    try {
      const d = await invoke<AppDescriptor>("launcher:openApp", { appId });
      toast.push(
        "success",
        d.kind === "external" ? "アプリを起動しました。" : "別ウィンドウを開きました。"
      );
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : String(err));
    }
  }

  function scrollToApps(): void {
    document.getElementById("apps-anchor")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div id="top" className="min-h-screen bg-bg-base">
      <Navbar
        companyName={settings.company.companyName}
        apps={apps}
        session={session}
        onLogout={onLogout}
      />

      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              "radial-gradient(1200px 600px at 50% -10%, rgb(96 165 250 / 0.25), transparent 60%), radial-gradient(800px 400px at 80% 20%, rgb(167 139 250 / 0.2), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-6 py-20 md:py-28">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <p className="mb-4 text-xs tracking-[0.4em] text-accent-secondary">
              INTEGRATED PORTAL
            </p>
            <h1 className="mb-4 text-4xl font-bold md:text-5xl">
              {settings.company.companyName}
            </h1>
            <p className="mx-auto max-w-xl text-fg-muted">
              社内のすべての業務アプリケーションを、ひとつの入口から。
            </p>
          </motion.div>

          <div className="mt-12">
            <HeroCarousel mottos={settings.company.mottos} />
          </div>

          <div className="mt-10 flex justify-center">
            <Button variant="secondary" size="lg" onClick={scrollToApps}>
              アプリ一覧へ
              <ArrowDown size={18} />
            </Button>
          </div>
        </div>
      </section>

      <div id="apps-anchor" />

      <section className="mx-auto max-w-5xl px-6 py-16">
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-2xl font-semibold"
        >
          利用できるアプリ
        </motion.h2>

        {error && (
          <div className="mb-6 rounded-lg border border-state-danger/40 bg-state-danger/10 p-3 text-sm text-state-danger">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-5">
          {apps.map((app) => (
            <AppSection key={app.id} app={app} onOpen={openApp} />
          ))}
        </div>
      </section>

      <footer className="border-t border-border-subtle py-8 text-center text-xs text-fg-subtle">
        <p>© {new Date().getFullYear()} {settings.company.companyName}</p>
      </footer>
    </div>
  );
}

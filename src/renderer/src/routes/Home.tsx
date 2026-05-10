import { useCallback, useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";
import { motion } from "framer-motion";

import {
  HOME_LP_BACKGROUNDS,
  PORTAL_APP_SECTION_META,
  PORTAL_APP_SECTION_ORDER,
} from "@shared/constants.js";
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

  const heroBgUrl =
    settings.company.homeHeroBackgroundFileUrl?.trim() || HOME_LP_BACKGROUNDS.hero.trim();

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
        {/* 青枠相当：ナビ下〜アプリ一覧ボタンまで一枚の背景 */}
        {heroBgUrl ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url("${heroBgUrl}")` }}
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-0 bg-bg-base/15" aria-hidden />
          </>
        ) : (
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                "radial-gradient(1200px 600px at 50% -10%, rgb(96 165 250 / 0.25), transparent 60%), radial-gradient(800px 400px at 80% 20%, rgb(167 139 250 / 0.2), transparent 60%)",
            }}
          />
        )}

        {/* 会社名エリア：文字に合わせたオーバーレイ */}
        <div className="relative z-10 flex justify-center px-6 pt-20 pb-8 md:pt-28 md:pb-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="w-fit max-w-full rounded-2xl border border-white/10 bg-bg-base/82 px-5 py-5 text-center shadow-[0_12px_48px_rgb(0_0_0/0.45)] backdrop-blur-md md:px-7 md:py-6"
          >
            <p className="mb-3 text-xs tracking-[0.4em] text-accent-secondary drop-shadow-sm">
              INTEGRATED PORTAL
            </p>
            <h1 className="mb-3 whitespace-normal text-4xl font-bold leading-tight drop-shadow-md md:text-5xl">
              {settings.company.companyName}
            </h1>
            <p className="max-w-[min(22rem,calc(100vw-4rem))] text-center text-sm leading-snug text-fg-muted drop-shadow-sm md:text-base">
              社内のすべての業務アプリケーションを、ひとつの入口から。
            </p>
          </motion.div>
        </div>

        {/* カルーセル：モットー幅に合わせたオーバーレイ */}
        <div className="relative z-10 flex justify-center px-6 pb-10 pt-2">
          <div className="w-fit max-w-full rounded-2xl border border-white/10 bg-bg-base/78 px-3 py-2.5 shadow-[0_12px_48px_rgb(0_0_0/0.4)] backdrop-blur-md md:px-4 md:py-3">
            <HeroCarousel mottos={settings.company.mottos} />
          </div>
        </div>

        <div className="relative z-10 mx-auto flex max-w-7xl justify-center px-6 pb-20 pt-2">
          <Button variant="secondary" size="lg" onClick={scrollToApps}>
            アプリ一覧へ
            <ArrowDown size={18} />
          </Button>
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

        <div className="space-y-16">
          {PORTAL_APP_SECTION_ORDER.map((sectionId) => {
            const meta = PORTAL_APP_SECTION_META[sectionId];
            const sectionApps = apps.filter((a) => a.section === sectionId);
            if (sectionApps.length === 0) {
              return null;
            }
            return (
              <div key={sectionId}>
                <h3 className="text-xl font-semibold tracking-tight text-fg-primary">
                  {meta.title}
                </h3>
                <p className="mt-2 mb-8 max-w-3xl text-sm leading-relaxed text-fg-muted">
                  {meta.lead}
                </p>
                <div className="flex flex-col gap-5">
                  {sectionApps.map((app) => (
                    <AppSection key={app.id} app={app} onOpen={openApp} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border-subtle py-8 text-center text-xs text-fg-subtle">
        <p>© {new Date().getFullYear()} {settings.company.companyName}</p>
      </footer>
    </div>
  );
}

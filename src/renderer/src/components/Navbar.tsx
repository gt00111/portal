import { useState } from "react";
import { LogOut, Menu, Settings as SettingsIcon, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { AppDescriptor, SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { cn } from "@renderer/lib/cn.js";

interface Props {
  companyName: string;
  apps: AppDescriptor[];
  session: SessionUser | null;
  onLogout: () => void;
}

export function Navbar({ companyName, apps, session, onLogout }: Props): JSX.Element {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function scrollTo(id: string): void {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeMobileMenu(): void {
    setMobileMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-bg-base/80 backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-2 px-4 py-2 md:min-h-[3.75rem] md:gap-2 md:px-6 md:py-2 lg:gap-3">
        <button
          type="button"
          onClick={() => {
            scrollTo("top");
            closeMobileMenu();
          }}
          className={cn(
            "min-w-0 truncate text-left text-base font-semibold tracking-wide text-fg-primary hover:text-accent-primary",
            "flex-1 md:flex-none md:max-w-[min(100%,20rem)]",
            "md:text-lg"
          )}
        >
          {companyName}
        </button>

        <nav
          className="hidden min-w-0 flex-1 md:flex md:flex-wrap md:items-center md:justify-center md:gap-x-2 md:gap-y-1.5 md:px-1 lg:gap-x-3 lg:gap-y-1.5"
          aria-label="アプリへスクロール"
        >
          {apps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => scrollTo(`app-${app.id}`)}
              className="whitespace-nowrap text-xs text-fg-muted transition-colors hover:text-fg-primary xl:text-sm"
            >
              {app.displayName}
            </button>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex md:gap-3">
          {session && (
            <span className="hidden text-sm text-fg-muted md:inline">
              {session.username}
              <span className="ml-2 rounded bg-bg-elevated px-2 py-0.5 text-xs text-fg-subtle">
                {session.role}
              </span>
            </span>
          )}
          {session?.role === "admin" && (
            <Button
              variant="secondary"
              size="sm"
              className="max-w-full shrink-0"
              onClick={() => navigate("/admin/settings")}
            >
              <SettingsIcon size={16} />
              <span className="min-w-0">管理</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" className="max-w-full shrink-0" onClick={onLogout}>
            <LogOut size={16} />
            <span className="min-w-0">ログアウト</span>
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex shrink-0 rounded-lg p-2 text-fg-primary hover:bg-bg-elevated md:hidden"
          aria-expanded={mobileMenuOpen}
          aria-controls="portal-home-mobile-nav"
          aria-label={mobileMenuOpen ? "メニューを閉じる" : "メニューを開く"}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
        </button>
      </div>

      {mobileMenuOpen ? (
        <div
          id="portal-home-mobile-nav"
          className="border-t border-border-subtle bg-bg-base/95 backdrop-blur md:hidden"
        >
          <nav className="mx-auto max-w-7xl space-y-1 px-4 py-3">
            <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-widest text-fg-subtle">
              アプリへ移動
            </p>
            {apps.map((app) => (
              <button
                key={app.id}
                type="button"
                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-fg-primary hover:bg-bg-elevated"
                onClick={() => {
                  scrollTo(`app-${app.id}`);
                  closeMobileMenu();
                }}
              >
                {app.displayName}
              </button>
            ))}
            {session && (
              <div className="mt-3 border-t border-border-subtle pt-3">
                <p className="px-2 text-xs text-fg-muted">
                  {session.username}
                  <span className="ml-2 rounded bg-bg-elevated px-2 py-0.5 text-[10px] text-fg-subtle">
                    {session.role}
                  </span>
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {session.role === "admin" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-center"
                      onClick={() => {
                        closeMobileMenu();
                        navigate("/admin/settings");
                      }}
                    >
                      <SettingsIcon size={16} />
                      管理
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center"
                    onClick={() => {
                      closeMobileMenu();
                      void onLogout();
                    }}
                  >
                    <LogOut size={16} />
                    ログアウト
                  </Button>
                </div>
              </div>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

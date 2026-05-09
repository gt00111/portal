import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { AppDescriptor, SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";

interface Props {
  companyName: string;
  apps: AppDescriptor[];
  session: SessionUser | null;
  onLogout: () => void;
}

export function Navbar({ companyName, apps, session, onLogout }: Props): JSX.Element {
  const navigate = useNavigate();

  function scrollTo(id: string): void {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-bg-base/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <button
          type="button"
          onClick={() => scrollTo("top")}
          className="text-lg font-semibold tracking-wide text-fg-primary hover:text-accent-primary"
        >
          {companyName}
        </button>

        <nav className="hidden items-center gap-5 md:flex">
          {apps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => scrollTo(`app-${app.id}`)}
              className="text-sm text-fg-muted transition-colors hover:text-fg-primary"
            >
              {app.displayName}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {session && (
            <span className="hidden text-sm text-fg-muted sm:inline">
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
              onClick={() => navigate("/admin/settings")}
            >
              <SettingsIcon size={16} />
              管理
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut size={16} />
            ログアウト
          </Button>
        </div>
      </div>
    </header>
  );
}

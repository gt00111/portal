import { Diff, History, Package, User } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { getAppRole, type AppRole } from "@shared/auth.js";
import type { SessionUser } from "@shared/types.js";

import { PortalAppHeaderLogo } from "@renderer/components/PortalAppHeaderLogo.js";
import { cn } from "@renderer/lib/cn.js";

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "管理者",
  editor: "編集者",
  viewer: "閲覧者",
};

interface Props {
  session: SessionUser;
}

export function PartsTrackerLayout({ session }: Props): JSX.Element {
  const role = getAppRole(session, "parts-tracker");

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
      isActive
        ? "bg-accent-primary/15 text-accent-primary"
        : "text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-base text-sm text-fg-primary">
      <header className="sticky top-0 z-40 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-border-subtle bg-bg-surface px-3 py-2 sm:flex-nowrap sm:px-4 sm:py-0">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 sm:gap-4">
          <PortalAppHeaderLogo
            appId="parts-tracker"
            className="h-8 w-auto max-h-9 max-w-[min(200px,50vw)] shrink-0 object-contain sm:h-9 sm:max-w-[min(200px,28vw)]"
          />
          <div className="flex min-w-0 items-center gap-2">
            <Package className="h-5 w-5 shrink-0 text-accent-primary sm:hidden" aria-hidden />
            <h1 className="truncate text-sm font-semibold text-fg-primary">部材管理</h1>
          </div>
          <nav className="flex items-center gap-1 border-l border-border-subtle pl-3">
            <NavLink to="/apps/parts-tracker" end className={navClass}>
              部品一覧
            </NavLink>
            <NavLink to="/apps/parts-tracker/compare" className={navClass}>
              <span className="inline-flex items-center gap-1">
                <Diff size={14} aria-hidden />
                案件間比較
              </span>
            </NavLink>
            <NavLink to="/apps/parts-tracker/history" className={navClass}>
              <span className="inline-flex items-center gap-1">
                <History size={14} aria-hidden />
                変更履歴
              </span>
            </NavLink>
          </nav>
        </div>
        <div className="flex w-full min-w-0 shrink-0 items-center justify-end gap-2 text-sm text-fg-muted sm:w-auto">
          <User className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="max-w-[min(8rem,35vw)] truncate sm:max-w-[8rem]">{session.username}</span>
          <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-sm text-fg-subtle">
            {ROLE_LABELS[role ?? "viewer"]}
          </span>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

import { Database, Settings as SettingsIcon, Users, ArrowLeft, LayoutGrid } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import type { SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { cn } from "@renderer/lib/cn.js";

interface Props {
  session: SessionUser;
  onLogout: () => Promise<void>;
}

const links = [
  { to: "/admin/settings", label: "設定", icon: SettingsIcon, adminOnly: true },
  { to: "/admin/operators", label: "操作者", icon: Users, adminOnly: true },
  { to: "/apps/master-database", label: "マスタ", icon: Database, adminOnly: false },
];

export function AdminLayout({ session, onLogout }: Props): JSX.Element {
  const navigate = useNavigate();
  const visible = links.filter((l) => !l.adminOnly || session.role === "admin");

  return (
    <div className="flex min-h-screen flex-col bg-bg-base md:flex-row">
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col gap-1 border-b border-border-subtle bg-bg-surface/60 p-4",
          "sticky top-0 z-20 max-h-screen overflow-y-auto",
          "md:w-60 md:border-b-0 md:border-r md:self-start md:max-h-[100dvh]"
        )}
      >
        <button
          type="button"
          onClick={() => navigate("/home")}
          className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
        >
          <ArrowLeft size={16} />
          ホームへ戻る
        </button>
        <div className="flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-widest text-fg-subtle">
          <LayoutGrid size={14} />
          <span>管理メニュー</span>
        </div>
        {visible.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-accent-primary/15 text-accent-primary"
                  : "text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}

        <div className="mt-auto border-t border-border-subtle pt-3">
          <p className="px-3 text-xs text-fg-subtle">
            {session.username}
            <span className="ml-2 rounded bg-bg-elevated px-1.5 py-0.5 text-[10px]">
              {session.role}
            </span>
          </p>
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={onLogout}>
            ログアウト
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

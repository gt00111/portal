import { NavLink, Outlet, useOutletContext } from "react-router-dom";

import { canWrite } from "@shared/auth.js";
import { MASTER_TABLES, MASTER_TABLE_LABELS, type MasterTable } from "@shared/master.js";
import type { SessionUser } from "@shared/types.js";

import { MasterCrud } from "@renderer/components/MasterCrud.js";
import { PortalAppHeaderLogo } from "@renderer/components/PortalAppHeaderLogo.js";
import { cn } from "@renderer/lib/cn.js";

interface Props {
  session: SessionUser;
}

export function MasterDatabase({ session }: Props): JSX.Element {
  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "sticky top-0 z-30 border-b border-border-subtle bg-bg-base/95 pb-4 backdrop-blur-md",
          "supports-[backdrop-filter]:bg-bg-base/80"
        )}
      >
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
          <PortalAppHeaderLogo
            appId="master-database"
            className="h-10 w-auto max-w-[min(280px,90vw)] shrink-0 self-start object-contain object-left sm:max-w-[min(280px,45vw)]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-fg-muted">
              客先・機種・図面番号(品番) などの中央マスタを管理します。SKU タブではマスタの組み合わせに加え、台帳用の図面番号表記や Rev を登録できます。
            </p>
          </div>
        </header>

        <nav className="mt-4 flex flex-wrap gap-1 rounded-xl border border-border-subtle bg-bg-surface/60 p-1">
          {MASTER_TABLES.map((t) => (
            <NavLink
              key={t}
              to={t}
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent-primary/15 text-accent-primary"
                    : "text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                )
              }
            >
              {MASTER_TABLE_LABELS[t]}
            </NavLink>
          ))}
          <NavLink
            to="m_skus"
            className={({ isActive }) =>
              cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-accent-secondary/15 text-accent-secondary"
                  : "text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
              )
            }
          >
            SKU（関係）
          </NavLink>
        </nav>
      </div>

      <div className="pt-6">
        <Outlet context={{ session, canWrite: canWrite(session.role) }} />
      </div>
    </div>
  );
}

interface MasterContext {
  session: SessionUser;
  canWrite: boolean;
}

export function useMasterContext(): MasterContext {
  return useOutletContext<MasterContext>();
}

export function MasterTableRoute({ table }: { table: MasterTable }): JSX.Element {
  const ctx = useMasterContext();
  return <MasterCrud table={table} canWrite={ctx.canWrite} />;
}

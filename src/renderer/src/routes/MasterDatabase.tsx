import { Database } from "lucide-react";
import { NavLink, Outlet, useOutletContext } from "react-router-dom";

import { canWrite } from "@shared/auth.js";
import { MASTER_TABLES, MASTER_TABLE_LABELS, type MasterTable } from "@shared/master.js";
import type { SessionUser } from "@shared/types.js";

import { MasterCrud } from "@renderer/components/MasterCrud.js";
import { cn } from "@renderer/lib/cn.js";

interface Props {
  session: SessionUser;
}

export function MasterDatabase({ session }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <div className="rounded-xl bg-accent-primary/15 p-3">
          <Database size={24} className="text-accent-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">マスターデータベース</h1>
          <p className="text-sm text-fg-muted">
            客先・機種・図面番号(品番) などの中央マスタを管理します。SKU タブではマスタの組み合わせに加え、台帳用の図面番号表記や Rev を登録できます。
          </p>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 rounded-xl border border-border-subtle bg-bg-surface/60 p-1">
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

      <Outlet context={{ session, canWrite: canWrite(session.role) }} />
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

import { HelpCircle } from "lucide-react";
import { NavLink, Outlet, useLocation, useOutletContext } from "react-router-dom";
import { useMemo, useState } from "react";

import { isPortalAdmin } from "@shared/auth.js";
import {
  CATEGORY_SCOPES,
  CATEGORY_SCOPE_LABELS,
  MASTER_TABLES,
  MASTER_TABLE_LABELS,
  type MasterTable,
} from "@shared/master.js";
import type { SessionUser } from "@shared/types.js";

import { MasterCrud } from "@renderer/components/MasterCrud.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { PortalAppHeaderLogo } from "@renderer/components/PortalAppHeaderLogo.js";
import { Button } from "@renderer/components/ui/Button.js";
import { cn } from "@renderer/lib/cn.js";
import {
  MasterDatabaseHelpContent,
  masterHelpTitle,
  type MasterHelpVariant,
} from "@renderer/routes/master/MasterDatabaseHelpContent.js";
import { HELP_TAB_CONTENT } from "@renderer/routes/master/masterDatabaseHelpCopy.js";

const CATEGORY_SCOPE_CHOICES = CATEGORY_SCOPES.map((s) => ({
  value: s,
  label: CATEGORY_SCOPE_LABELS[s],
}));

interface Props {
  session: SessionUser;
}

function resolveHelpVariant(pathname: string): MasterHelpVariant {
  const seg = pathname.split("/").filter(Boolean).pop() ?? "m_customers";
  if (seg in HELP_TAB_CONTENT) return seg as MasterHelpVariant;
  if ((MASTER_TABLES as readonly string[]).includes(seg)) return seg as MasterTable;
  return "m_customers";
}

export function MasterDatabase({ session }: Props): JSX.Element {
  const location = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const helpVariant = useMemo(() => resolveHelpVariant(location.pathname), [location.pathname]);

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
          <Button type="button" variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
            <HelpCircle size={16} aria-hidden />
            ヘルプ
          </Button>
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
          {isPortalAdmin(session.role) && (
            <NavLink
              to="user-access"
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent-primary/15 text-accent-primary"
                    : "text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                )
              }
            >
              ユーザー権限
            </NavLink>
          )}
          {isPortalAdmin(session.role) && (
            <NavLink
              to="audit-log"
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent-primary/15 text-accent-primary"
                    : "text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                )
              }
            >
              監査ログ
            </NavLink>
          )}
          <NavLink
            to="procurement-lead-times"
            className={({ isActive }) =>
              cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-accent-secondary/15 text-accent-secondary"
                  : "text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
              )
            }
          >
            標準 LT
          </NavLink>
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

      <Modal
        open={helpOpen}
        title={masterHelpTitle(helpVariant)}
        onClose={() => setHelpOpen(false)}
        width="lg"
      >
        <MasterDatabaseHelpContent variant={helpVariant} />
      </Modal>

      <div className="pt-6">
        <Outlet context={{ session, canWrite: isPortalAdmin(session.role) }} />
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
  if (table === "m_categories") {
    return (
      <MasterCrud
        table={table}
        canWrite={ctx.canWrite}
        scopes={CATEGORY_SCOPE_CHOICES}
        defaultScope="drawing-library/work"
      />
    );
  }
  return <MasterCrud table={table} canWrite={ctx.canWrite} />;
}

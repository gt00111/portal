import { User } from "lucide-react";

import { getAppRole, type AppRole } from "@shared/auth.js";
import type { SessionUser } from "@shared/types.js";

import { PortalAppHeaderLogo } from "@renderer/components/PortalAppHeaderLogo.js";
import { PartSearchPage } from "@renderer/routes/sheet-metal-support/PartSearchPage.js";

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "管理者",
  editor: "編集者",
  viewer: "閲覧者",
};

interface Props {
  session: SessionUser;
}

export function SheetMetalSupportApp({ session }: Props): JSX.Element {
  const role = getAppRole(session, "sheet-metal-support");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-base">
      <header className="sticky top-0 z-40 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <PortalAppHeaderLogo
            appId="sheet-metal-support"
            className="h-8 w-auto max-h-9 max-w-[min(200px,40vw)] shrink-0 object-contain"
          />
          <h1 className="truncate text-base font-semibold text-fg-primary">板金製造支援</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-fg-muted">
          <User className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="max-w-[min(8rem,35vw)] truncate">{session.username}</span>
          <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-subtle">
            {ROLE_LABELS[role ?? "viewer"]}
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
        <PartSearchPage />
      </main>
    </div>
  );
}

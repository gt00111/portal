import { FolderOpen, GitCompare, PenLine, User } from "lucide-react";
import { useState } from "react";

import { canAppWrite, getAppRole, type AppRole } from "@shared/auth.js";
import type { SessionUser } from "@shared/types.js";

import { PortalAppHeaderLogo } from "@renderer/components/PortalAppHeaderLogo.js";
import { cn } from "@renderer/lib/cn.js";
import { DrawingDbTab } from "@renderer/routes/drawing-library/DrawingDbTab.js";
import { PdfCompareBonusTab } from "@renderer/routes/drawing-library/PdfCompareBonusTab.js";
import { SeisanProvidedFilesTab } from "@renderer/routes/drawing-library/SeisanProvidedFilesTab.js";

type TabId = "seisan" | "workDb" | "pdfCompare";

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "管理者",
  editor: "編集者",
  viewer: "閲覧者",
};

interface Props {
  session: SessionUser;
}

export function DrawingLibraryApp({ session }: Props): JSX.Element {
  const [tab, setTab] = useState<TabId>("seisan");
  const dlRole = getAppRole(session, "drawing-library");
  const writable = canAppWrite(session, "drawing-library");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-base">
      <header className="sticky top-0 z-40 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-border-subtle bg-bg-surface px-3 py-2 sm:flex-nowrap sm:px-4 sm:py-0">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-y-2 sm:flex-nowrap sm:gap-4 lg:gap-6">
          <PortalAppHeaderLogo
            appId="drawing-library"
            className="h-8 w-auto max-h-9 max-w-[min(200px,50vw)] shrink-0 object-contain sm:h-9 sm:max-w-[min(200px,28vw)]"
          />
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5 sm:gap-2 sm:pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                ["seisan", "顧客図面", FolderOpen, "main"] as const,
                ["workDb", "自社発行", PenLine, "main"] as const,
                ["pdfCompare", "PDF比較", GitCompare, "bonus"] as const,
              ] as const
            ).map(([id, label, Icon, kind]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                title={
                  id === "seisan"
                    ? "提供ファイル（生産ボードと同期）"
                    : id === "workDb"
                      ? "drawing-library.db に登録した自社図面"
                      : "外部 PDF 2 件の比較（補助）"
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
                  kind === "bonus" && "sm:text-xs",
                  tab === id
                    ? "bg-accent-primary text-bg-base shadow-sm"
                    : "text-fg-muted hover:bg-bg-elevated hover:text-fg-primary"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="flex w-full min-w-0 shrink-0 items-center justify-end gap-2 text-sm text-fg-muted sm:w-auto">
          <User className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="max-w-[min(8rem,35vw)] truncate sm:max-w-[8rem]">{session.username}</span>
          <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-subtle">
            {ROLE_LABELS[dlRole ?? "viewer"]}
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="w-full space-y-4 px-3 py-4 sm:px-4">
          {tab === "seisan" && <SeisanProvidedFilesTab writable={writable} />}
          {tab === "workDb" && <DrawingDbTab writable={writable} />}
          {tab === "pdfCompare" && <PdfCompareBonusTab />}
        </div>
      </main>
    </div>
  );
}

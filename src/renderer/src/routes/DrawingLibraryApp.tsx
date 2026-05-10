import { FileSearch, FolderOpen, GitCompare, PenLine, User } from "lucide-react";
import { useState } from "react";

import type { AppRole } from "@shared/auth.js";
import type { SessionUser } from "@shared/types.js";

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-base">
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-4">
        <div className="flex min-w-0 items-center gap-4 lg:gap-6">
          <div className="flex shrink-0 items-center gap-2">
            <FileSearch className="h-7 w-7 shrink-0 text-accent-secondary" aria-hidden />
            <span className="truncate text-sm font-semibold text-fg-primary sm:text-base">図面ライブラリ</span>
          </div>
          <nav className="flex min-w-0 items-center gap-1 sm:gap-2">
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
        <div className="flex shrink-0 items-center gap-2 text-sm text-fg-muted">
          <User className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="max-w-[6rem] truncate sm:max-w-[8rem]">{session.username}</span>
          <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-subtle">
            {ROLE_LABELS[session.role] ?? session.role}
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-6xl px-4 py-6">
          {tab === "seisan" && <SeisanProvidedFilesTab role={session.role} />}
          {tab === "workDb" && <DrawingDbTab role={session.role} />}
          {tab === "pdfCompare" && <PdfCompareBonusTab />}
        </div>
      </main>
    </div>
  );
}

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";

import type { PmBoardTask } from "@shared/processMgmt.js";
import { canEditPmTaskLifecycle, canStartPmTask } from "@shared/processMgmtPermissions.js";
import type { SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { cn } from "@renderer/lib/cn.js";
import { canEditSwParallel } from "@renderer/routes/process-management/ProcessMgmtParallelPanel.js";
import {
  PM_UI_HANDOFF_ACTION,
  PM_UI_SUPPORT_ACTION,
  PM_UI_WORK_MODE_ACTION,
} from "@renderer/routes/process-management/processMgmtLabels.js";
import { cadShowsPauseInsteadOfComplete } from "@renderer/routes/process-management/processMgmtBoardUtils.js";

export interface ProcessMgmtActionHandlers {
  onStart: (id: number) => void;
  onComplete: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onWorkMode: (task: PmBoardTask) => void;
  onSupport: (task: PmBoardTask) => void;
  onHandoff: (task: PmBoardTask) => void;
  onUndoComplete?: (task: PmBoardTask) => void;
}

export function ProcessMgmtActionMenu({
  task,
  session,
  boardMode,
  canOperate,
  pmAdmin,
  handlers,
}: {
  task: PmBoardTask;
  session: SessionUser;
  boardMode: "active" | "history";
  canOperate: boolean;
  pmAdmin: boolean;
  handlers: ProcessMgmtActionHandlers;
}): JSX.Element | null {
  if (!canOperate && !(pmAdmin && boardMode === "history")) return null;

  const items: Array<{ key: string; label: string; onClick: () => void; danger?: boolean }> = [];

  const canLifecycle = canEditPmTaskLifecycle(session, task.assignee);
  const canStart = canStartPmTask(session, task.assignee);

  if (canOperate && boardMode === "active") {
    if (
      canStart &&
      task.status !== "作業中" &&
      task.status !== "完了" &&
      task.status !== "一時中断"
    ) {
      items.push({ key: "start", label: "開始", onClick: () => handlers.onStart(task.id) });
    }
    if (canLifecycle) {
      if (task.status === "一時中断") {
        items.push({ key: "resume", label: "再開", onClick: () => handlers.onResume(task.id) });
      }
      if (task.status === "作業中" && cadShowsPauseInsteadOfComplete(task)) {
        items.push({ key: "pause", label: "一時中断", onClick: () => handlers.onPause(task.id) });
      }
      if (task.status === "作業中" && !cadShowsPauseInsteadOfComplete(task)) {
        items.push({ key: "complete", label: "完了", onClick: () => handlers.onComplete(task.id) });
      }
    }

    const swEdit = canEditSwParallel(session, task);
    const parallel = task.workMode === "parallel";
    if (task.seisanProjectId && task.processType === "solidworks" && swEdit) {
      if (items.length > 0) {
        items.push({
          key: "_sep1",
          label: "—",
          onClick: () => {},
        });
      }
      items.push({
        key: "workmode",
        label: PM_UI_WORK_MODE_ACTION,
        onClick: () => handlers.onWorkMode(task),
      });
      items.push({
        key: "support",
        label: PM_UI_SUPPORT_ACTION,
        onClick: () => handlers.onSupport(task),
      });
      if (parallel) {
        items.push({
          key: "handoff",
          label: PM_UI_HANDOFF_ACTION,
          onClick: () => handlers.onHandoff(task),
        });
      }
    }
  }

  if (pmAdmin && boardMode === "history" && handlers.onUndoComplete) {
    items.push({
      key: "undo",
      label: "完了取り消し",
      onClick: () => handlers.onUndoComplete!(task),
      danger: true,
    });
  }

  if (items.length === 0) return <span className="text-xs text-fg-muted">—</span>;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button type="button" variant="secondary" size="sm" className="gap-1 whitespace-nowrap">
          操作
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[10rem] rounded-md border border-border-subtle bg-bg-surface p-1 shadow-lg"
          sideOffset={4}
          align="end"
        >
          {items.map((item) =>
            item.key.startsWith("_sep") ? (
              <DropdownMenu.Separator
                key={item.key}
                className="my-1 h-px bg-border-subtle"
              />
            ) : (
              <DropdownMenu.Item
                key={item.key}
                className={cn(
                  "cursor-pointer rounded px-3 py-2 text-sm outline-none",
                  item.danger
                    ? "text-state-danger focus:bg-state-danger/10"
                    : "text-fg-primary focus:bg-bg-elevated"
                )}
                onSelect={() => item.onClick()}
              >
                {item.label}
              </DropdownMenu.Item>
            )
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

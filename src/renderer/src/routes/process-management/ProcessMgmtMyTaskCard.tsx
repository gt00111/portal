import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { getAppRole } from "@shared/auth.js";
import type { PmBoardTask } from "@shared/processMgmt.js";
import type { SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { invoke } from "@renderer/lib/api.js";
import { cn } from "@renderer/lib/cn.js";
import { cadShowsPauseInsteadOfComplete } from "@renderer/routes/process-management/processMgmtBoardUtils.js";
import { processTypeLabel } from "@renderer/routes/process-management/processMgmtLabels.js";
import { PmTaskStatusBadge } from "@renderer/routes/process-management/processMgmtStatusBadge.js";

const PROGRESS_NOTE_MAX_LENGTH = 2000;

function canEditTaskProgressNote(session: SessionUser, task: PmBoardTask): boolean {
  if (getAppRole(session, "process-management") === "admin") return true;
  if (task.myTaskRole === "support") return true;
  return task.assignee.trim() === session.username.trim();
}

export function ProcessMgmtMyTaskCard({
  task,
  session,
  writable,
  onRefresh,
  onError,
  onOpenCaseDetail,
}: {
  task: PmBoardTask;
  session: SessionUser;
  writable: boolean;
  onRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
  onOpenCaseDetail: (seisanProjectId: string | null) => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(task.progressNote);
  const [percent, setPercent] = useState(task.progressPercent);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote(task.progressNote);
    setPercent(task.progressPercent);
  }, [task.id, task.progressNote, task.progressPercent]);

  const canEditNote = canEditTaskProgressNote(session, task);
  const showActions = writable && task.status !== "完了";
  const isSupport = task.myTaskRole === "support";
  const showPause =
    task.processType === "cadmac" && task.status === "作業中" && cadShowsPauseInsteadOfComplete(task);
  const showResume = task.processType === "cadmac" && task.status === "一時中断";

  const projectLabel =
    task.seisanProjectNo?.trim() ||
    task.projectName?.trim() ||
    task.drawingNumber?.trim() ||
    "—";

  async function handleSaveNote(): Promise<void> {
    try {
      setSaving(true);
      onError(null);
      await invoke("process-mgmt:task:updateProgressNote", {
        id: task.id,
        progressNote: note,
        progressPercent: percent,
      });
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleStart(): Promise<void> {
    try {
      onError(null);
      await invoke("process-mgmt:task:start", { id: task.id });
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleComplete(): Promise<void> {
    try {
      onError(null);
      await invoke("process-mgmt:task:complete", { id: task.id });
      setPercent(100);
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePause(): Promise<void> {
    try {
      onError(null);
      await invoke("process-mgmt:task:pause", { id: task.id });
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleResume(): Promise<void> {
    try {
      onError(null);
      await invoke("process-mgmt:task:resume", { id: task.id });
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <li className="rounded-lg border border-border-subtle bg-bg-surface text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-fg-primary">{processTypeLabel(task.processType)}</div>
          <div className="mt-0.5 text-xs text-fg-muted">{projectLabel}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PmTaskStatusBadge status={task.status} />
            {isSupport ? (
              <span className="rounded border border-border-subtle px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle">
                補助
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 text-sm tabular-nums text-fg-primary">
            進捗 <span className="font-semibold">{task.progressPercent}</span>%
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0 gap-1"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              閉じる
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            </>
          ) : (
            <>
              開く
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </>
          )}
        </Button>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-border-subtle px-4 py-3">
          <div className="text-xs text-fg-muted">
            {task.projectName}
            {task.seisanProjectNo ? `（製番 ${task.seisanProjectNo}）` : ""}
          </div>
          <div className="text-xs text-fg-muted">
            {task.client} / {task.drawingNumber} Rev {task.revision}
          </div>
          <div className="text-xs text-fg-subtle">
            {task.processType} · {task.status}
            {!isSupport && task.assignee ? ` · 担当 ${task.assignee}` : ""}
            {task.activeBatchNo != null ? ` · バッチ${task.activeBatchNo}` : ""}
          </div>

          {showActions && (
            <div className="flex flex-wrap gap-2">
              {task.status !== "作業中" && task.status !== "一時中断" && (
                <Button type="button" size="sm" onClick={() => void handleStart()}>
                  開始
                </Button>
              )}
              {showResume && (
                <Button type="button" size="sm" onClick={() => void handleResume()}>
                  再開
                </Button>
              )}
              {showPause && (
                <Button type="button" size="sm" onClick={() => void handlePause()}>
                  一時中断
                </Button>
              )}
              {task.status === "作業中" && !showPause && (
                <Button type="button" size="sm" onClick={() => void handleComplete()}>
                  完了
                </Button>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-fg-subtle">進捗（0〜100％）</label>
            <div className="flex min-w-0 items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
                disabled={!canEditNote}
                className={cn(
                  "h-2 min-w-0 flex-1 cursor-pointer accent-accent-primary",
                  !canEditNote && "cursor-not-allowed opacity-60"
                )}
              />
              <span className="shrink-0 tabular-nums text-sm font-semibold">{percent}%</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-fg-subtle">進捗メモ</label>
            <textarea
              className={cn(
                "min-h-[5rem] w-full resize-y rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-fg-primary",
                !canEditNote && "cursor-default"
              )}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              readOnly={!canEditNote}
              maxLength={PROGRESS_NOTE_MAX_LENGTH}
            />
            {canEditNote && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                disabled={saving}
                onClick={() => void handleSaveNote()}
              >
                {saving ? "保存中…" : "進捗（％・メモ）を保存"}
              </Button>
            )}
          </div>

          {task.seisanProjectId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-accent-secondary"
              onClick={() => onOpenCaseDetail(task.seisanProjectId)}
            >
              案件内容（閲覧）
            </Button>
          ) : null}

          {!isSupport &&
          task.processType === "solidworks" &&
          (task.supportProgressList?.length ?? 0) > 0 ? (
            <div className="rounded-md border border-border-subtle bg-bg-elevated/60 p-3">
              <p className="text-xs font-semibold text-fg-muted">補助担当の進捗（閲覧のみ）</p>
              <ul className="mt-2 space-y-2">
                {task.supportProgressList!.map((entry) => (
                  <li key={entry.userNameId} className="rounded border border-border-subtle/80 px-2 py-1.5 text-xs">
                    <div className="flex justify-between font-medium">
                      <span>{entry.username}</span>
                      <span className="tabular-nums">{entry.progressPercent}%</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-fg-muted">
                      {entry.progressNote.trim() || "（メモなし）"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

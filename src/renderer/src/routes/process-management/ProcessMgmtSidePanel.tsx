import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { PmBoardTask } from "@shared/processMgmt.js";
import type { PmHandoffEvent } from "@shared/processMgmtParallel.js";

import { Button } from "@renderer/components/ui/Button.js";
import { invoke } from "@renderer/lib/api.js";
import { ParallelMetaBadges } from "@renderer/routes/process-management/ProcessMgmtParallelPanel.js";
import {
  PM_UI_WORK_MODE_LABELS,
} from "@renderer/routes/process-management/processMgmtLabels.js";
import { formatBoardDateTime } from "@renderer/routes/process-management/processMgmtBoardUtils.js";
import { PmTaskStatusBadge } from "@renderer/routes/process-management/processMgmtStatusBadge.js";
import { processTypeLabel } from "@renderer/routes/process-management/processMgmtLabels.js";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="grid gap-0.5 border-b border-border-subtle py-2 last:border-0">
      <dt className="text-xs font-medium text-fg-subtle">{label}</dt>
      <dd className="text-sm text-fg-primary">{children}</dd>
    </div>
  );
}

export function ProcessMgmtSidePanel({
  task,
  projectTasks,
  onClose,
  onOpenSeisanDetail,
}: {
  task: PmBoardTask | null;
  projectTasks: PmBoardTask[];
  onClose: () => void;
  onOpenSeisanDetail: (seisanProjectId: string) => void;
}): JSX.Element | null {
  const [handoffs, setHandoffs] = useState<PmHandoffEvent[]>([]);
  const [handoffLoading, setHandoffLoading] = useState(false);

  const sid = task?.seisanProjectId ?? null;
  const related = sid ? projectTasks : [];

  useEffect(() => {
    if (!task || !sid) {
      setHandoffs([]);
      return;
    }
    let cancelled = false;
    setHandoffLoading(true);
    void (async () => {
      try {
        const list = await invoke<PmHandoffEvent[]>("process-mgmt:handoff:listByProject", {
          seisanProjectId: sid,
        });
        if (!cancelled) setHandoffs(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setHandoffs([]);
      } finally {
        if (!cancelled) setHandoffLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task?.id, sid]);

  if (!task) return null;

  const swTask = related.find((t) => t.processType === "solidworks") ?? (task.processType === "solidworks" ? task : null);
  const supportList = swTask?.supportProgressList ?? task.supportProgressList ?? [];

  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border-subtle bg-bg-surface shadow-xl sm:top-14"
      aria-label="案件詳細"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg-primary">案件詳細</h2>
          <p className="mt-0.5 truncate text-xs text-fg-muted">{task.projectName}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onClose} aria-label="閉じる">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <dl>
          <DetailRow label="製番">{task.seisanProjectNo || "—"}</DetailRow>
          <DetailRow label="案件名">{task.projectName}</DetailRow>
          <DetailRow label="客先">{task.client || "—"}</DetailRow>
          <DetailRow label="図番">{task.drawingNumber || "—"}</DetailRow>
          <DetailRow label="Rev">{task.revision || "—"}</DetailRow>
          {task.workMode ? (
            <DetailRow label="作業モード">{PM_UI_WORK_MODE_LABELS[task.workMode]}</DetailRow>
          ) : null}
        </dl>

        <ParallelMetaBadges task={task} />

        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">工程一覧</h3>
          <ul className="mt-2 space-y-2">
            {(related.length > 0 ? related : [task]).map((t) => (
              <li
                key={t.id}
                className="rounded-md border border-border-subtle bg-bg-elevated/50 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{processTypeLabel(t.processType)}</span>
                  <PmTaskStatusBadge status={t.status} />
                </div>
                <div className="mt-1 text-xs text-fg-muted">
                  担当: {t.assignee || "—"} · 進捗 {t.progressPercent}%
                </div>
                {t.title ? <div className="mt-0.5 text-xs text-fg-subtle">{t.title}</div> : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">進捗メモ（主担当）</h3>
          <p className="mt-2 whitespace-pre-wrap rounded-md border border-border-subtle bg-bg-elevated/40 px-3 py-2 text-sm text-fg-primary">
            {task.progressNote.trim() || "（未申告）"}
          </p>
        </section>

        {sid ? (
          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">引渡し履歴</h3>
            {handoffLoading ? (
              <p className="mt-2 text-xs text-fg-muted">読み込み中…</p>
            ) : handoffs.length === 0 ? (
              <p className="mt-2 text-xs text-fg-muted">引渡し履歴はありません。</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {handoffs.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-md border border-border-subtle px-3 py-2 text-xs"
                  >
                    <div className="font-semibold text-fg-primary">バッチ{h.batchNo}</div>
                    <div className="mt-0.5 text-fg-muted">
                      {formatBoardDateTime(h.handoffAt)} · {h.handoffByUsername}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-fg-primary">{h.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {supportList.length > 0 ? (
          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">補助担当</h3>
            <ul className="mt-2 space-y-2">
              {supportList.map((s) => (
                <li key={s.userNameId} className="rounded-md border border-border-subtle px-3 py-2 text-xs">
                  <div className="flex justify-between gap-2 font-medium text-fg-primary">
                    <span>{s.username}</span>
                    <span className="tabular-nums">{s.progressPercent}%</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-fg-muted">
                    {s.progressNote.trim() || "（メモなし）"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">更新履歴</h3>
          <dl className="mt-2 space-y-1 text-xs text-fg-muted">
            <div>更新: {formatBoardDateTime(task.updatedAt)}</div>
            <div>着手: {formatBoardDateTime(task.startedAt)}</div>
            <div>完了: {formatBoardDateTime(task.completedAt)}</div>
          </dl>
        </section>

        {sid ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-4 w-full"
            onClick={() => onOpenSeisanDetail(sid)}
          >
            生産ボードで案件内容を開く
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

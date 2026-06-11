import { useEffect, useMemo, useState } from "react";

import type { PmBoardTask } from "@shared/processMgmt.js";
import type {
  PmGanttDurationChange,
  PmGanttTemplateMapping,
  PmWorkMode,
} from "@shared/processMgmtParallel.js";
import {
  PM_GANTT_CADMAC_TEMPLATE_NAME,
  PM_GANTT_SW_TEMPLATE_NAME,
} from "@shared/processMgmtParallel.js";
import {
  PM_UI_HANDOFF_ACTION,
  PM_UI_WORK_MODE_LABELS,
} from "@renderer/routes/process-management/processMgmtLabels.js";
import type { SessionUser } from "@shared/types.js";
import { canProxyPmSwParallelOps } from "@shared/processMgmtPermissions.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { cn } from "@renderer/lib/cn.js";

export function GanttChangeBanner({
  changes,
  onAcknowledge,
  acknowledging,
}: {
  changes: PmGanttDurationChange[];
  onAcknowledge: () => void;
  acknowledging: boolean;
}): JSX.Element | null {
  if (changes.length === 0) return null;
  return (
    <div className="mb-4 rounded-lg border border-state-warning/50 bg-state-warning/10 p-4 text-sm text-fg-primary">
      <p className="font-semibold text-state-warning">計画（所要日数）に変更がありました</p>
      <ul className="mt-2 space-y-1 text-xs text-fg-muted">
        {changes.map((ch) => (
          <li key={ch.seisanProjectId}>
            {ch.seisanProjectNo ? `${ch.seisanProjectNo} · ` : ""}
            {ch.projectName} — 設計{" "}
            {ch.previousSwDays ?? "—"}日→{ch.currentSwDays ?? "—"}日 / レーザー{" "}
            {ch.previousCadmacDays ?? "—"}日→{ch.currentCadmacDays ?? "—"}日
            {ch.currentSwDays != null &&
            ch.currentCadmacDays != null &&
            ch.currentSwDays <= 7 &&
            ch.currentCadmacDays <= 7 ? (
              <span className="ml-1 text-accent-secondary">（並行推奨）</span>
            ) : null}
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-3"
        disabled={acknowledging}
        onClick={onAcknowledge}
      >
        {acknowledging ? "確認中…" : "確認した"}
      </Button>
    </div>
  );
}

export function ParallelMetaBadges({ task }: { task: PmBoardTask }): JSX.Element | null {
  if (!task.seisanProjectId) return null;
  const items: JSX.Element[] = [];
  if (task.workMode === "parallel") {
    items.push(
      <span
        key="mode"
        className="inline-flex rounded border border-accent-secondary/40 bg-accent-secondary/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-secondary"
      >
        並行作業
      </span>
    );
  }
  if (task.latestBatchNo != null && task.latestBatchNo > 0) {
    items.push(
      <span
        key="batch"
        title={task.latestBatchNote ?? undefined}
        className="inline-flex rounded border border-border-subtle bg-bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-fg-muted"
      >
        バッチ{task.latestBatchNo}
      </span>
    );
  }
  if (task.parallelRecommend) {
    items.push(
      <span
        key="rec"
        className="inline-flex rounded border border-state-warning/40 bg-state-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-state-warning"
      >
        並行推奨
      </span>
    );
  }
  if (items.length === 0) return null;
  return <div className="mt-1 flex flex-wrap gap-1">{items}</div>;
}

function canEditSwParallel(session: SessionUser, task: PmBoardTask): boolean {
  if (canProxyPmSwParallelOps(session)) return true;
  return task.processType === "solidworks" && task.assignee.trim() === session.username.trim();
}

export function HandoffModal({
  open,
  task,
  nextBatchNo,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  task: PmBoardTask | null;
  nextBatchNo: number;
  onClose: () => void;
  onSubmit: (note: string) => void;
  submitting: boolean;
}): JSX.Element | null {
  const [note, setNote] = useState("");
  if (!open || !task) return null;
  return (
    <Modal open={open} onClose={onClose} title={`バッチ${nextBatchNo} を ${PM_UI_HANDOFF_ACTION}`}>
      <p className="mb-3 text-sm text-fg-muted">
        {task.projectName} — 引渡し内容をメモに記録してください（必須）。
      </p>
      <textarea
        className="min-h-[6rem] w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-fg-primary"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="例: 板金3点分のデータ"
        maxLength={2000}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
          キャンセル
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={submitting || !note.trim()}
          onClick={() => onSubmit(note.trim())}
        >
          {submitting ? "登録中…" : PM_UI_HANDOFF_ACTION}
        </Button>
      </div>
    </Modal>
  );
}

export function WorkModeModal({
  open,
  task,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  task: PmBoardTask | null;
  onClose: () => void;
  onSubmit: (mode: PmWorkMode, note: string) => void;
  submitting: boolean;
}): JSX.Element | null {
  const [mode, setMode] = useState<PmWorkMode>(task?.workMode ?? "sequential");
  const [note, setNote] = useState("");
  if (!open || !task) return null;
  return (
    <Modal open={open} onClose={onClose} title="作業モード">
      <p className="mb-3 text-sm text-fg-muted">{task.projectName}</p>
      <div className="flex gap-2">
        {(["sequential", "parallel"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={cn(
              "rounded-md border px-3 py-2 text-sm font-medium",
              mode === m
                ? "border-accent-primary bg-accent-primary/15 text-accent-primary"
                : "border-border-subtle text-fg-muted"
            )}
            onClick={() => setMode(m)}
          >
            {PM_UI_WORK_MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-xs text-fg-subtle">メモ（任意）</label>
      <input
        className="mt-1 w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
          キャンセル
        </Button>
        <Button type="button" size="sm" disabled={submitting} onClick={() => onSubmit(mode, note)}>
          {submitting ? "保存中…" : "保存"}
        </Button>
      </div>
    </Modal>
  );
}

export function SupportAssigneesModal({
  open,
  task,
  candidates,
  loadingCandidates,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  task: PmBoardTask | null;
  candidates: Array<{ userNameId: number; name: string }>;
  loadingCandidates: boolean;
  onClose: () => void;
  onSubmit: (userNameIds: number[]) => void;
  submitting: boolean;
}): JSX.Element | null {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const primaryId = task?.assigneeUserNameId ?? null;

  useEffect(() => {
    if (!open || !task) return;
    const ids = new Set((task.supportAssignees ?? []).map((s) => s.userNameId));
    setSelected(ids);
  }, [open, task]);

  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => a.name.localeCompare(b.name, "ja")),
    [candidates]
  );

  if (!open || !task) return null;

  function toggle(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="補助担当（SolidWorks）">
      <p className="mb-2 text-sm text-fg-muted">
        {task.projectName} — 主担当: {task.assignee || "（未割当）"}
      </p>
      <p className="mb-3 text-xs text-fg-subtle">
        補助担当は自分専用の進捗％・メモを更新できます。引き渡し後も登録・更新可能です。
      </p>
      {loadingCandidates ? (
        <p className="text-sm text-fg-muted">ユーザー一覧を読み込み中…</p>
      ) : sortedCandidates.length === 0 ? (
        <p className="text-sm text-fg-muted">登録可能なユーザーがありません。</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border-subtle p-2">
          {sortedCandidates.map((u) => {
            const isPrimary = primaryId != null && u.userNameId === primaryId;
            const checked = selected.has(u.userNameId);
            return (
              <li key={u.userNameId}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm",
                    isPrimary ? "cursor-not-allowed opacity-50" : "hover:bg-bg-elevated"
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={checked}
                    disabled={isPrimary || submitting}
                    onChange={() => toggle(u.userNameId)}
                  />
                  <span>{u.name}</span>
                  {isPrimary ? <span className="text-xs text-fg-subtle">（主担当）</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
          キャンセル
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={submitting || loadingCandidates}
          onClick={() => onSubmit([...selected])}
        >
          {submitting ? "保存中…" : "保存"}
        </Button>
      </div>
    </Modal>
  );
}

export function GanttTemplateMappingModal({
  open,
  mapping,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  mapping: PmGanttTemplateMapping | null;
  onClose: () => void;
  onSubmit: (input: PmGanttTemplateMapping) => void;
  submitting: boolean;
}): JSX.Element | null {
  const [swName, setSwName] = useState(PM_GANTT_SW_TEMPLATE_NAME);
  const [cadName, setCadName] = useState(PM_GANTT_CADMAC_TEMPLATE_NAME);

  useEffect(() => {
    if (!open || !mapping) return;
    setSwName(mapping.swTemplateName);
    setCadName(mapping.cadmacTemplateName);
  }, [open, mapping]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="ガント工程名マッピング">
      <p className="mb-3 text-xs text-fg-muted">
        生産ボードの工程テンプレート名と工程管理の所要日数を対応付けます。未設定時は既定値（設計 /
        レーザー切断プログラム作成）を使用します。
      </p>
      <label className="block text-xs text-fg-subtle">SolidWorks 所要（設計）</label>
      <input
        className="mt-1 w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm"
        value={swName}
        onChange={(e) => setSwName(e.target.value)}
        maxLength={120}
      />
      <label className="mt-3 block text-xs text-fg-subtle">CADMAC 所要（レーザー）</label>
      <input
        className="mt-1 w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm"
        value={cadName}
        onChange={(e) => setCadName(e.target.value)}
        maxLength={120}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
          キャンセル
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={submitting || !swName.trim() || !cadName.trim()}
          onClick={() => onSubmit({ swTemplateName: swName.trim(), cadmacTemplateName: cadName.trim() })}
        >
          {submitting ? "保存中…" : "保存"}
        </Button>
      </div>
    </Modal>
  );
}

export function BoardParallelActions({
  task,
  session,
  boardMode,
  canOperate,
  onWorkMode,
  onHandoff,
  onSupport,
  onPause,
  onResume,
}: {
  task: PmBoardTask;
  session: SessionUser;
  boardMode: "active" | "history";
  canOperate: boolean;
  onWorkMode: (task: PmBoardTask) => void;
  onHandoff: (task: PmBoardTask) => void;
  onSupport: (task: PmBoardTask) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
}): JSX.Element | null {
  if (!canOperate || boardMode !== "active" || !task.seisanProjectId) return null;
  const swEdit = canEditSwParallel(session, task);
  const isCad = task.processType === "cadmac";
  const isSw = task.processType === "solidworks";
  const parallel = task.workMode === "parallel";

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {isSw && swEdit ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onWorkMode(task)}>
          モード
        </Button>
      ) : null}
      {isSw && swEdit ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onSupport(task)}>
          補助
        </Button>
      ) : null}
      {isSw && swEdit && parallel ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onHandoff(task)}>
          引渡し
        </Button>
      ) : null}
      {isCad && parallel && task.status === "作業中" ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onPause(task.id)}>
          一時中断
        </Button>
      ) : null}
      {isCad && task.status === "一時中断" ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onResume(task.id)}>
          再開
        </Button>
      ) : null}
    </div>
  );
}

export { canEditSwParallel };

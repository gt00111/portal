import {
  ClipboardPenLine,
  HelpCircle,
  LayoutDashboard,
  LayoutGrid,
  User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { AppRole } from "@shared/auth.js";
import {
  canAppWrite,
  canOperateProcessMgmtApp,
  getAppRole,
} from "@shared/auth.js";
import type { PmDashboardAnalytics, PmDashboardGroupContext } from "@shared/processMgmtDashboard.js";
import type { PmBoardTask, PmTaskCompletionNotification } from "@shared/processMgmt.js";
import type {
  PmGanttDurationChange,
  PmGanttTemplateMapping,
  PmWorkMode,
} from "@shared/processMgmtParallel.js";
import { PROCESS_VIEW_LABELS, type ProcessView } from "@shared/processView.js";
import { SEISAN_CHANNELS } from "@shared/seisan/channels.js";
import type { ProjectWithRelations } from "@shared/seisan/project.js";
import { PROJECT_STATUS_LABELS } from "@shared/seisan/status.js";
import type { SessionUser } from "@shared/types.js";

import { Button } from "@renderer/components/ui/Button.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { PortalAppHeaderLogo } from "@renderer/components/PortalAppHeaderLogo.js";
import { invoke } from "@renderer/lib/api.js";
import { cn } from "@renderer/lib/cn.js";
import {
  BOARD_HELP_ACTIVE_HISTORY_HINT,
  BOARD_HELP_HISTORY,
  BOARD_HELP_OVERVIEW,
  BOARD_HELP_PROGRESS,
  BOARD_HELP_UNDO_ADMIN,
  BOARD_HELP_LIFECYCLE,
  BOARD_HELP_PARALLEL,
  BOARD_HELP_UNDO_VIEWER,
  BOARD_HELP_VIEW_ACTIVE_TEMPLATE,
  BOARD_PAGE_TAGLINE,
  HELP_DB_STORAGE_NOTE,
  MY_TASKS_HELP_CASE_VIEW,
  MY_TASKS_HELP_COMPLETE_MISTAKE_VIEWER,
  MY_TASKS_HELP_INPUT,
  MY_TASKS_HELP_SCOPE_TEMPLATE,
  MY_TASKS_PAGE_TAGLINE,
} from "@renderer/routes/process-management/processManagementHelpCopy.js";
import { ProcessMgmtNotificationBell } from "@renderer/routes/process-management/ProcessMgmtNotificationBell.js";
import { ProcessMgmtActionMenu } from "@renderer/routes/process-management/ProcessMgmtActionMenu.js";
import { ProcessMgmtDashboard } from "@renderer/routes/process-management/ProcessMgmtDashboard.js";
import { ProcessMgmtMyTaskCard } from "@renderer/routes/process-management/ProcessMgmtMyTaskCard.js";
import {
  GanttChangeBanner,
  GanttTemplateMappingModal,
  HandoffModal,
  ParallelMetaBadges,
  SupportAssigneesModal,
  WorkModeModal,
} from "@renderer/routes/process-management/ProcessMgmtParallelPanel.js";
import { ProcessMgmtSidePanel } from "@renderer/routes/process-management/ProcessMgmtSidePanel.js";
import {
  boardRowProjectKey,
  formatBoardDateTime,
  tasksForProject,
} from "@renderer/routes/process-management/processMgmtBoardUtils.js";
import { processTypeLabel } from "@renderer/routes/process-management/processMgmtLabels.js";
import { PmTaskStatusBadge } from "@renderer/routes/process-management/processMgmtStatusBadge.js";

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "管理者",
  editor: "編集者",
  viewer: "閲覧者",
};

const COMPLETION_UNDO_REASON_MAX_LENGTH = 2000;

const BOARD_HISTORY_VIEWS = ["solidworks", "cadmac", "both"] as const;

const BOARD_PAGE_SIZES = [20, 50, 100] as const;
type BoardPageSize = (typeof BOARD_PAGE_SIZES)[number];

type BoardSortKey =
  | "updatedAt"
  | "project"
  | "title"
  | "processType"
  | "assignee"
  | "status"
  | "startedAt"
  | "completedAt"
  | "progressPercent"
  | "progressNote";

function boardRowProjectLabel(t: PmBoardTask): string {
  const sn = t.seisanProjectNo ? `${t.seisanProjectNo} · ` : "";
  return `${sn}${t.projectName}（${t.drawingNumber} Rev ${t.revision}）`;
}

function compareNullableIso(a: string | null, b: string | null): number {
  if (!a?.trim() && !b?.trim()) return 0;
  if (!a?.trim()) return 1;
  if (!b?.trim()) return -1;
  return a.localeCompare(b);
}

function applyBoardTextQuery(list: PmBoardTask[], q: string): PmBoardTask[] {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  return list.filter((t) => {
    const hay = [
      t.projectName,
      t.drawingNumber,
      t.title,
      t.note,
      t.seisanProjectNo ?? "",
      String(t.progressPercent),
      t.progressNote,
      t.client,
      t.assignee,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(s);
  });
}

function applyBoardCascade(
  list: PmBoardTask[],
  client: string,
  projectKey: string,
  processType: string,
  assignee: string
): PmBoardTask[] {
  return list.filter((t) => {
    if (client && t.client.trim() !== client) return false;
    if (projectKey && boardRowProjectKey(t) !== projectKey) return false;
    if (processType && t.processType !== processType) return false;
    if (assignee) {
      if (assignee === "__unassigned__") {
        if (t.assignee.trim()) return false;
      } else if (t.assignee.trim() !== assignee) return false;
    }
    return true;
  });
}

function sortBoardTasks(list: PmBoardTask[], key: BoardSortKey, dir: "asc" | "desc"): PmBoardTask[] {
  const m = dir === "asc" ? 1 : -1;
  const out = [...list];
  out.sort((a, b) => {
    let c = 0;
    switch (key) {
      case "project":
        c =
          a.projectName.localeCompare(b.projectName, "ja") || boardRowProjectKey(a).localeCompare(boardRowProjectKey(b));
        break;
      case "title":
        c = a.title.localeCompare(b.title, "ja");
        break;
      case "processType":
        c = a.processType.localeCompare(b.processType, "ja");
        break;
      case "assignee":
        c = (a.assignee || "").localeCompare(b.assignee || "", "ja");
        break;
      case "status":
        c = a.status.localeCompare(b.status, "ja");
        break;
      case "startedAt":
        c = compareNullableIso(a.startedAt, b.startedAt);
        break;
      case "completedAt":
        c = compareNullableIso(a.completedAt, b.completedAt);
        break;
      case "progressPercent":
        c = a.progressPercent - b.progressPercent;
        break;
      case "progressNote":
        c = a.progressNote.localeCompare(b.progressNote, "ja");
        break;
      case "updatedAt":
      default:
        c = a.updatedAt.localeCompare(b.updatedAt);
        break;
    }
    return c * m;
  });
  return out;
}

const BOARD_SORT_DESC_DEFAULT = new Set<BoardSortKey>([
  "updatedAt",
  "startedAt",
  "completedAt",
  "progressPercent",
]);

function BoardSortHeader({
  label,
  subLabel,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  subLabel?: string;
  sortKey: BoardSortKey;
  activeKey: BoardSortKey;
  dir: "asc" | "desc";
  onSort: (key: BoardSortKey) => void;
  className?: string;
  align?: "left" | "right";
}): JSX.Element {
  const active = activeKey === sortKey;
  const hint = active ? (dir === "asc" ? "昇順" : "降順") : "並び替え";
  const arrow = active ? (dir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      scope="col"
      className={cn(
        "cursor-pointer select-none px-3 py-2 align-middle hover:bg-bg-base/60",
        align === "right" && "text-right",
        className
      )}
      title={hint}
      onClick={() => onSort(sortKey)}
    >
      <span className="block">
        <span className="font-medium text-fg-subtle">
          {label}
          <span className="tabular-nums text-fg-muted">{arrow}</span>
        </span>
      </span>
      {subLabel ? <span className="mt-0.5 block font-normal text-fg-muted">{subLabel}</span> : null}
    </th>
  );
}

function formatSeisanDeadline(raw: string): string {
  if (!raw?.trim() || raw === "9999-12-31") return "—";
  const d = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("ja-JP", { dateStyle: "medium" });
}

function dashIfEmpty(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : "—";
}

function SeisanDetailRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="grid gap-0.5 border-b border-border-subtle py-2.5 last:border-0 sm:grid-cols-[8.5rem_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-fg-subtle">{label}</dt>
      <dd className="min-w-0 text-sm text-fg-primary">{children}</dd>
    </div>
  );
}

function SeisanProjectDetailDialog({
  open,
  onClose,
  loading,
  error,
  project,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  project: ProjectWithRelations | null;
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="seisan-detail-title"
        className="relative max-h-[min(90vh,42rem)] w-full max-w-lg overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <h2 id="seisan-detail-title" className="text-sm font-semibold text-fg-primary">
            案件内容（閲覧のみ）
          </h2>
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onClose}>
            閉じる
          </Button>
        </div>
        <div className="max-h-[min(78vh,36rem)] overflow-y-auto">
          {loading && <p className="px-4 py-6 text-sm text-fg-muted">読み込み中…</p>}
          {!loading && error && (
            <p className="px-4 py-6 text-sm text-state-danger">{error}</p>
          )}
          {!loading && !error && project && (
            <dl className="px-4 pb-4">
              <SeisanDetailRow label="製番">{dashIfEmpty(project.project_no)}</SeisanDetailRow>
              <SeisanDetailRow label="ステータス">{PROJECT_STATUS_LABELS[project.status]}</SeisanDetailRow>
              <SeisanDetailRow label="案件名">{dashIfEmpty(project.project_name)}</SeisanDetailRow>
              <SeisanDetailRow label="客先">{dashIfEmpty(project.company_name)}</SeisanDetailRow>
              <SeisanDetailRow label="グループ">{dashIfEmpty(project.group_name)}</SeisanDetailRow>
              <SeisanDetailRow label="機種">{dashIfEmpty(project.model_type)}</SeisanDetailRow>
              <SeisanDetailRow label="図面番号">{dashIfEmpty(project.part_number)}</SeisanDetailRow>
              <SeisanDetailRow label="リビジョン">{dashIfEmpty(project.revision)}</SeisanDetailRow>
              <SeisanDetailRow label="号機">{dashIfEmpty(project.unit_number)}</SeisanDetailRow>
              <SeisanDetailRow label="納期">{formatSeisanDeadline(project.deadline)}</SeisanDetailRow>
              <SeisanDetailRow label="優先度">{String(project.priority)}</SeisanDetailRow>
              <SeisanDetailRow label="受付日時">{formatBoardDateTime(project.received_at)}</SeisanDetailRow>
              <SeisanDetailRow label="案件完了日時">{formatBoardDateTime(project.completed_at)}</SeisanDetailRow>
              <SeisanDetailRow label="入力者">{dashIfEmpty(project.input_by_username)}</SeisanDetailRow>
              <SeisanDetailRow label="依頼内容">
                <span className="whitespace-pre-wrap break-words">{dashIfEmpty(project.request_content)}</span>
              </SeisanDetailRow>
              <SeisanDetailRow label="メモ">
                <span className="whitespace-pre-wrap break-words">{dashIfEmpty(project.notes)}</span>
              </SeisanDetailRow>
            </dl>
          )}
        </div>
        <p className="border-t border-border-subtle px-4 py-2 text-[0.7rem] text-fg-muted">
          内容の編集・承認は生産ボードアプリから行ってください。ここでは表示のみです。
        </p>
      </div>
    </div>
  );
}

function UndoCompleteDialog({
  task,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
  submitting,
  error,
}: {
  task: PmBoardTask | null;
  reason: string;
  onReasonChange: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  error: string | null;
}): JSX.Element | null {
  useEffect(() => {
    if (!task) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, submitting, onClose]);

  if (!task) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={() => !submitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="undo-complete-title"
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-subtle px-4 py-3">
          <h2 id="undo-complete-title" className="text-sm font-semibold text-fg-primary">
            完了の取り消し（管理者）
          </h2>
          <p className="mt-1 text-xs text-fg-muted">
            「{task.title}」を完了から「作業中」に戻します。担当からの報告内容を記録してください。
          </p>
        </div>
        <div className="space-y-2 px-4 py-3">
          <label className="block text-xs font-medium text-fg-subtle">報告内容（必須）</label>
          <textarea
            className="min-h-[6rem] w-full resize-y rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-fg-primary"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            disabled={submitting}
            maxLength={COMPLETION_UNDO_REASON_MAX_LENGTH}
            placeholder="例: 担当○○より誤完了の連絡あり。作業継続のため取り消し。"
          />
          <div className="text-[0.7rem] text-fg-subtle">
            {reason.trim().length === 0 ? "入力必須です" : `${reason.length} / ${COMPLETION_UNDO_REASON_MAX_LENGTH}`}
          </div>
          {error && <p className="text-xs text-state-danger">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <Button type="button" variant="secondary" size="sm" disabled={submitting} onClick={onClose}>
            キャンセル
          </Button>
          <Button type="button" variant="danger" size="sm" disabled={submitting} onClick={onConfirm}>
            {submitting ? "実行中…" : "取り消す"}
          </Button>
        </div>
      </div>
    </div>
  );
}

type TabId = "dashboard" | "board" | "mytasks";
type MyTaskFilter = "all" | "primary" | "support";

interface Props {
  session: SessionUser;
}

function hasProcessMgmtGroup(
  groupNameId: number | null | undefined,
  groupName: string | null | undefined
): boolean {
  return groupNameId != null && (groupName?.trim() ?? "").length > 0;
}

export function ProcessManagementApp({ session }: Props): JSX.Element {
  const [groupNameId, setGroupNameId] = useState(session.groupNameId);
  const [groupName, setGroupName] = useState(session.groupName);
  const hasPmGroup = hasProcessMgmtGroup(groupNameId, groupName);
  const canWritePmTasks = canAppWrite(session, "process-management");
  const [tab, setTab] = useState<TabId>(() =>
    hasProcessMgmtGroup(session.groupNameId, session.groupName) ? "dashboard" : "mytasks"
  );
  const [groupContext, setGroupContext] = useState<PmDashboardGroupContext | null>(null);
  const [dashboardAnalytics, setDashboardAnalytics] = useState<PmDashboardAnalytics | null>(null);
  const [sidePanelTask, setSidePanelTask] = useState<PmBoardTask | null>(null);
  const [myTaskFilter, setMyTaskFilter] = useState<MyTaskFilter>("primary");
  const [dashNotifications, setDashNotifications] = useState<PmTaskCompletionNotification[]>([]);
  const [dashNotifyLoading, setDashNotifyLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [boardMode, setBoardMode] = useState<"active" | "history">("active");
  const [boardHistoryProcessView, setBoardHistoryProcessView] = useState<ProcessView>(() =>
    session.processView === "cadmac" ? "cadmac" : "solidworks"
  );
  const [boardQuery, setBoardQuery] = useState("");
  const [boardCascadeClient, setBoardCascadeClient] = useState("");
  const [boardCascadeProject, setBoardCascadeProject] = useState("");
  const [boardCascadeProcess, setBoardCascadeProcess] = useState("");
  const [boardCascadeAssignee, setBoardCascadeAssignee] = useState("");
  const [boardSortKey, setBoardSortKey] = useState<BoardSortKey>("updatedAt");
  const [boardSortDir, setBoardSortDir] = useState<"asc" | "desc">("desc");
  const [boardPage, setBoardPage] = useState(1);
  const [boardPageSize, setBoardPageSize] = useState<BoardPageSize>(BOARD_PAGE_SIZES[0]);
  const [boardTasks, setBoardTasks] = useState<PmBoardTask[]>([]);
  const [ganttChanges, setGanttChanges] = useState<PmGanttDurationChange[]>([]);
  const [ganttAckSubmitting, setGanttAckSubmitting] = useState(false);
  const [handoffTarget, setHandoffTarget] = useState<PmBoardTask | null>(null);
  const [handoffSubmitting, setHandoffSubmitting] = useState(false);
  const [workModeTarget, setWorkModeTarget] = useState<PmBoardTask | null>(null);
  const [workModeSubmitting, setWorkModeSubmitting] = useState(false);
  const [supportTarget, setSupportTarget] = useState<PmBoardTask | null>(null);
  const [supportCandidates, setSupportCandidates] = useState<Array<{ userNameId: number; name: string }>>([]);
  const [supportCandidatesLoading, setSupportCandidatesLoading] = useState(false);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [ganttMappingOpen, setGanttMappingOpen] = useState(false);
  const [ganttMapping, setGanttMapping] = useState<PmGanttTemplateMapping | null>(null);
  const [ganttMappingSubmitting, setGanttMappingSubmitting] = useState(false);

  const [myTasks, setMyTasks] = useState<PmBoardTask[]>([]);

  const [caseDetailOpen, setCaseDetailOpen] = useState(false);
  const [caseDetailLoading, setCaseDetailLoading] = useState(false);
  const [caseDetailError, setCaseDetailError] = useState<string | null>(null);
  const [caseDetailProject, setCaseDetailProject] = useState<ProjectWithRelations | null>(null);

  const [undoTarget, setUndoTarget] = useState<PmBoardTask | null>(null);
  const [undoReason, setUndoReason] = useState("");
  const [undoSubmitting, setUndoSubmitting] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  const syncGanttDurations = useCallback(async (acknowledge: boolean) => {
    const result = await invoke<{ changes: PmGanttDurationChange[] }>("process-mgmt:gantt:syncDurations", {
      acknowledge,
    });
    if (!acknowledge) {
      setGanttChanges(result.changes ?? []);
    } else {
      setGanttChanges([]);
    }
  }, []);

  const refreshBoard = useCallback(async () => {
    const data = await invoke<PmBoardTask[]>("process-mgmt:task:listBoard", {
      mode: boardMode,
      query: "",
      client: "",
      ...(boardMode === "history" ? { boardProcessView: boardHistoryProcessView } : {}),
    });
    setBoardTasks(data);
    if (boardMode === "active") {
      await syncGanttDurations(false);
    } else {
      setGanttChanges([]);
    }
  }, [boardMode, boardHistoryProcessView, syncGanttDurations]);

  const boardCascadeMeta = useMemo(() => {
    const clientOptions = [
      ...new Set(boardTasks.map((t) => t.client.trim()).filter((c) => c.length > 0)),
    ].sort((a, b) => a.localeCompare(b, "ja"));

    const afterClient = boardCascadeClient
      ? boardTasks.filter((t) => t.client.trim() === boardCascadeClient)
      : boardTasks;

    const projectEntries = new Map<string, string>();
    for (const t of afterClient) {
      const k = boardRowProjectKey(t);
      if (!projectEntries.has(k)) projectEntries.set(k, boardRowProjectLabel(t));
    }
    const projectOptions = [...projectEntries.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ja"));

    const afterProject = boardCascadeProject
      ? afterClient.filter((t) => boardRowProjectKey(t) === boardCascadeProject)
      : afterClient;

    const processOptions = [...new Set(afterProject.map((t) => t.processType))].sort((a, b) =>
      a.localeCompare(b, "ja")
    );

    const afterProcess = boardCascadeProcess
      ? afterProject.filter((t) => t.processType === boardCascadeProcess)
      : afterProject;

    const assigneeOptions: { value: string; label: string }[] = [];
    const seenAssignee = new Set<string>();
    for (const t of afterProcess) {
      const trimmed = t.assignee.trim();
      const value = trimmed.length > 0 ? trimmed : "__unassigned__";
      const label = trimmed.length > 0 ? trimmed : "（未割当）";
      if (!seenAssignee.has(value)) {
        seenAssignee.add(value);
        assigneeOptions.push({ value, label });
      }
    }
    assigneeOptions.sort((a, b) => {
      if (a.value === "__unassigned__") return 1;
      if (b.value === "__unassigned__") return -1;
      return a.label.localeCompare(b.label, "ja");
    });

    return { clientOptions, projectOptions, processOptions, assigneeOptions };
  }, [
    boardTasks,
    boardCascadeClient,
    boardCascadeProject,
    boardCascadeProcess,
  ]);

  useEffect(() => {
    if (boardCascadeClient && !boardCascadeMeta.clientOptions.includes(boardCascadeClient)) {
      setBoardCascadeClient("");
      setBoardCascadeProject("");
      setBoardCascadeProcess("");
      setBoardCascadeAssignee("");
    }
  }, [boardCascadeClient, boardCascadeMeta.clientOptions]);

  useEffect(() => {
    if (
      boardCascadeProject &&
      !boardCascadeMeta.projectOptions.some((p) => p.value === boardCascadeProject)
    ) {
      setBoardCascadeProject("");
      setBoardCascadeProcess("");
      setBoardCascadeAssignee("");
    }
  }, [boardCascadeProject, boardCascadeMeta.projectOptions]);

  useEffect(() => {
    if (boardCascadeProcess && !boardCascadeMeta.processOptions.includes(boardCascadeProcess)) {
      setBoardCascadeProcess("");
      setBoardCascadeAssignee("");
    }
  }, [boardCascadeProcess, boardCascadeMeta.processOptions]);

  useEffect(() => {
    if (boardCascadeAssignee && !boardCascadeMeta.assigneeOptions.some((a) => a.value === boardCascadeAssignee)) {
      setBoardCascadeAssignee("");
    }
  }, [boardCascadeAssignee, boardCascadeMeta.assigneeOptions]);

  const boardFilteredTasks = useMemo(() => {
    let list = applyBoardCascade(
      boardTasks,
      boardCascadeClient,
      boardCascadeProject,
      boardCascadeProcess,
      boardCascadeAssignee
    );
    list = applyBoardTextQuery(list, boardQuery);
    return sortBoardTasks(list, boardSortKey, boardSortDir);
  }, [
    boardTasks,
    boardCascadeClient,
    boardCascadeProject,
    boardCascadeProcess,
    boardCascadeAssignee,
    boardQuery,
    boardSortKey,
    boardSortDir,
  ]);

  const boardTotal = boardFilteredTasks.length;
  const boardTotalPages = Math.max(1, Math.ceil(boardTotal / boardPageSize));

  const pageRows = useMemo(() => {
    const start = (boardPage - 1) * boardPageSize;
    return boardFilteredTasks.slice(start, start + boardPageSize);
  }, [boardFilteredTasks, boardPage, boardPageSize]);

  useEffect(() => {
    setBoardPage((p) => Math.min(p, boardTotalPages));
  }, [boardTotalPages]);

  useEffect(() => {
    setBoardPage(1);
  }, [
    boardQuery,
    boardCascadeClient,
    boardCascadeProject,
    boardCascadeProcess,
    boardCascadeAssignee,
    boardPageSize,
  ]);

  function handleBoardSort(key: BoardSortKey): void {
    if (key === boardSortKey) {
      setBoardSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setBoardSortKey(key);
      setBoardSortDir(BOARD_SORT_DESC_DEFAULT.has(key) ? "desc" : "asc");
    }
  }

  function setCascadeClient(v: string): void {
    setBoardCascadeClient(v);
    setBoardCascadeProject("");
    setBoardCascadeProcess("");
    setBoardCascadeAssignee("");
  }

  function setCascadeProject(v: string): void {
    setBoardCascadeProject(v);
    setBoardCascadeProcess("");
    setBoardCascadeAssignee("");
  }

  function setCascadeProcess(v: string): void {
    setBoardCascadeProcess(v);
    setBoardCascadeAssignee("");
  }

  const refreshMyTasks = useCallback(async () => {
    const data = await invoke<PmBoardTask[]>("process-mgmt:task:listMy");
    setMyTasks(data);
  }, []);

  const openCaseDetailReadOnly = useCallback(async (seisanProjectId: string | null) => {
    if (!seisanProjectId?.trim()) {
      setMessage("生産ボード案件と紐づいていない行のため、案件内容を表示できません。");
      return;
    }
    setMessage(null);
    setCaseDetailOpen(true);
    setCaseDetailLoading(true);
    setCaseDetailError(null);
    setCaseDetailProject(null);
    try {
      const p = await invoke<ProjectWithRelations>(SEISAN_CHANNELS.project.get, { id: seisanProjectId });
      setCaseDetailProject(p);
    } catch (err) {
      setCaseDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setCaseDetailLoading(false);
    }
  }, []);

  const closeCaseDetail = useCallback(() => {
    setCaseDetailOpen(false);
    setCaseDetailLoading(false);
    setCaseDetailError(null);
    setCaseDetailProject(null);
  }, []);

  useEffect(() => {
    if (tab !== "board") return;
    void (async () => {
      try {
        setMessage(null);
        await refreshBoard();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [tab, refreshBoard]);

  useEffect(() => {
    if (tab !== "mytasks") return;
    void (async () => {
      try {
        setMessage(null);
        await refreshMyTasks();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [tab, refreshMyTasks]);

  const refreshDashNotifications = useCallback(async () => {
    setDashNotifyLoading(true);
    try {
      const list = await invoke<PmTaskCompletionNotification[]>("process-mgmt:notify:listPending", undefined);
      setDashNotifications(Array.isArray(list) ? list : []);
    } catch {
      setDashNotifications([]);
    } finally {
      setDashNotifyLoading(false);
    }
  }, []);

  useEffect(() => {
    void invoke<SessionUser>("auth:syncSession")
      .then((s) => {
        setGroupNameId(s.groupNameId);
        setGroupName(s.groupName);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "dashboard" || !hasPmGroup) return;
    void (async () => {
      try {
        setMessage(null);
        const [data, ctx, analytics] = await Promise.all([
          invoke<PmBoardTask[]>("process-mgmt:task:listBoard", {
            mode: "active",
            query: "",
            client: "",
            boardProcessView: "both",
          }),
          invoke<PmDashboardGroupContext | null>("process-mgmt:dashboard:groupContext", undefined),
          invoke<PmDashboardAnalytics>("process-mgmt:dashboard:analytics", { staleDays: 7 }),
        ]);
        setBoardTasks(data);
        setGroupContext(ctx);
        setDashboardAnalytics(analytics);
        await refreshMyTasks();
        await refreshDashNotifications();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [tab, hasPmGroup, refreshDashNotifications, refreshMyTasks]);

  const filteredMyTasks = useMemo(() => {
    if (myTaskFilter === "all") return myTasks;
    if (myTaskFilter === "support") return myTasks.filter((t) => t.myTaskRole === "support");
    return myTasks.filter((t) => t.myTaskRole !== "support");
  }, [myTasks, myTaskFilter]);

  const sidePanelProjectTasks = useMemo(() => {
    if (!sidePanelTask?.seisanProjectId) return [];
    return tasksForProject(boardTasks, sidePanelTask.seisanProjectId);
  }, [boardTasks, sidePanelTask?.seisanProjectId]);

  async function handleStartTask(id: number): Promise<void> {
    try {
      setMessage(null);
      await invoke<PmBoardTask>("process-mgmt:task:start", { id });
      await refreshBoard();
      if (tab === "mytasks" || tab === "dashboard") await refreshMyTasks();
      if (tab === "dashboard") await refreshDashNotifications();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCompleteTask(id: number): Promise<void> {
    try {
      setMessage(null);
      await invoke<PmBoardTask>("process-mgmt:task:complete", { id });
      await refreshBoard();
      if (tab === "mytasks" || tab === "dashboard") await refreshMyTasks();
      if (tab === "dashboard") await refreshDashNotifications();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handlePauseTask(id: number): Promise<void> {
    try {
      setMessage(null);
      await invoke("process-mgmt:task:pause", { id });
      await refreshBoard();
      if (tab === "mytasks" || tab === "dashboard") await refreshMyTasks();
      if (tab === "dashboard") await refreshDashNotifications();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleResumeTask(id: number): Promise<void> {
    try {
      setMessage(null);
      await invoke("process-mgmt:task:resume", { id });
      await refreshBoard();
      if (tab === "mytasks" || tab === "dashboard") await refreshMyTasks();
      if (tab === "dashboard") await refreshDashNotifications();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function submitHandoff(note: string): Promise<void> {
    if (!handoffTarget) return;
    setHandoffSubmitting(true);
    try {
      setMessage(null);
      await invoke("process-mgmt:task:handoffToCadmac", { taskId: handoffTarget.id, note });
      setHandoffTarget(null);
      await refreshBoard();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setHandoffSubmitting(false);
    }
  }

  const openSupportModal = useCallback(async (task: PmBoardTask): Promise<void> => {
    setSupportTarget(task);
    setSupportCandidatesLoading(true);
    try {
      const list = await invoke<Array<{ userNameId: number; name: string }>>(
        "process-mgmt:support:listUserCandidates"
      );
      setSupportCandidates(list);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setSupportTarget(null);
    } finally {
      setSupportCandidatesLoading(false);
    }
  }, []);

  async function submitSupportAssignees(userNameIds: number[]): Promise<void> {
    if (!supportTarget) return;
    setSupportSubmitting(true);
    try {
      setMessage(null);
      await invoke("process-mgmt:task:setSupportAssignees", {
        taskId: supportTarget.id,
        userNameIds,
      });
      setSupportTarget(null);
      await refreshBoard();
      if (tab === "mytasks" || tab === "dashboard") await refreshMyTasks();
      if (tab === "dashboard") await refreshDashNotifications();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSupportSubmitting(false);
    }
  }

  const openGanttMappingModal = useCallback(async (): Promise<void> => {
    setGanttMappingOpen(true);
    try {
      const mapping = await invoke<PmGanttTemplateMapping>("process-mgmt:gantt:getTemplateMapping");
      setGanttMapping(mapping);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setGanttMappingOpen(false);
    }
  }, []);

  async function submitGanttMapping(input: PmGanttTemplateMapping): Promise<void> {
    setGanttMappingSubmitting(true);
    try {
      setMessage(null);
      const mapping = await invoke<PmGanttTemplateMapping>("process-mgmt:gantt:setTemplateMapping", input);
      setGanttMapping(mapping);
      setGanttMappingOpen(false);
      if (boardMode === "active") {
        await syncGanttDurations(false);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setGanttMappingSubmitting(false);
    }
  }

  async function submitWorkMode(mode: PmWorkMode, note: string): Promise<void> {
    if (!workModeTarget?.seisanProjectId) return;
    setWorkModeSubmitting(true);
    try {
      setMessage(null);
      await invoke("process-mgmt:project:setWorkMode", {
        seisanProjectId: workModeTarget.seisanProjectId,
        workMode: mode,
        note,
      });
      setWorkModeTarget(null);
      await refreshBoard();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkModeSubmitting(false);
    }
  }

  async function acknowledgeGanttChanges(): Promise<void> {
    setGanttAckSubmitting(true);
    try {
      await syncGanttDurations(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setGanttAckSubmitting(false);
    }
  }

  async function confirmUndoComplete(): Promise<void> {
    if (!undoTarget) return;
    if (!undoReason.trim()) {
      setUndoError("報告内容を入力してください。");
      return;
    }
    setUndoError(null);
    setUndoSubmitting(true);
    try {
      await invoke("process-mgmt:task:undoComplete", { id: undoTarget.id, reason: undoReason });
      setUndoTarget(null);
      setUndoReason("");
      setMessage(null);
      await refreshBoard();
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : String(err));
    } finally {
      setUndoSubmitting(false);
    }
  }

  function closeUndoDialog(): void {
    if (undoSubmitting) return;
    setUndoTarget(null);
    setUndoReason("");
    setUndoError(null);
  }

  const pmAdmin = getAppRole(session, "process-management") === "admin";
  const showNotifyBell = canOperateProcessMgmtApp(session) || getAppRole(session, "process-management") != null;
  const showBoardOpsCol = canWritePmTasks || (pmAdmin && boardMode === "history");

  const headerTabs = [
    ["dashboard", "ダッシュボード", LayoutDashboard] as const,
    ["mytasks", "マイタスク", ClipboardPenLine] as const,
    ["board", "ボード", LayoutGrid] as const,
  ] as const;

  function filterBoardByAssignee(assignee: string): void {
    setBoardCascadeAssignee(assignee.trim());
    setBoardPage(1);
    setTab("board");
  }
  const showBoardHistoryDateCols = boardMode === "history";
  const boardColCount =
    5 + (showBoardHistoryDateCols ? 2 : 0) + (showBoardOpsCol ? 1 : 0);

  const boardRangeStart = boardTotal === 0 ? 0 : (boardPage - 1) * boardPageSize + 1;
  const boardRangeEnd = boardTotal === 0 ? 0 : Math.min(boardPage * boardPageSize, boardTotal);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-base">
      <header className="sticky top-0 z-40 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-border-subtle bg-bg-surface px-3 py-2 sm:flex-nowrap sm:px-4 sm:py-0">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-y-2 sm:flex-nowrap sm:gap-4 lg:gap-6">
          <PortalAppHeaderLogo
            appId="process-management"
            className="h-8 w-auto max-h-9 max-w-[min(200px,50vw)] shrink-0 object-contain sm:h-9 sm:max-w-[min(200px,28vw)]"
          />
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5 sm:gap-2 sm:pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {headerTabs.map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
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
        <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 text-sm text-fg-muted sm:w-auto">
          <ProcessMgmtNotificationBell username={session.username} enabled={showNotifyBell} />
          <User className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
          <span className="max-w-[min(8rem,35vw)] truncate sm:max-w-[8rem]">{session.username}</span>
          <span className="hidden rounded-md bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-subtle sm:inline">
            {PROCESS_VIEW_LABELS[session.processView]}
          </span>
          <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-subtle">
            {ROLE_LABELS[getAppRole(session, "process-management") ?? "viewer"]}
          </span>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-3 w-auto max-w-none py-2 sm:mx-10 sm:py-3">
          {message && (
            <div className="mb-4 rounded-lg border border-state-danger/40 bg-state-danger/10 p-3 text-sm text-state-danger">
              {message}
            </div>
          )}

          {tab === "dashboard" && !hasPmGroup && (
            <section className="mx-auto max-w-lg rounded-lg border border-border-subtle bg-bg-surface p-8 text-center">
              <LayoutDashboard className="mx-auto h-10 w-10 text-fg-muted" aria-hidden />
              <h2 className="mt-4 text-base font-semibold text-fg-primary">ダッシュボードは利用できません</h2>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                グループに所属していないため、チームの作業状況を表示できません。ポータル管理者に
                <strong className="text-fg-primary">所属グループ</strong>
                の設定を依頼してください。
              </p>
              <p className="mt-2 text-xs text-fg-subtle">
                設定後は一度ログアウトして再ログインすると反映されます。ボード・マイタスクは通常どおり利用できます。
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setTab("mytasks")}>
                  マイタスクへ
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setTab("board")}>
                  ボードへ
                </Button>
              </div>
            </section>
          )}

          {tab === "dashboard" && hasPmGroup && (
            <ProcessMgmtDashboard
              session={session}
              boardTasks={boardTasks}
              myTasks={myTasks}
              notifications={dashNotifications}
              notificationsLoading={dashNotifyLoading}
              analytics={dashboardAnalytics}
              groupContext={groupContext}
              onRefreshNotifications={() => void refreshDashNotifications()}
              onGoBoard={() => setTab("board")}
              onGoMyTasks={() => setTab("mytasks")}
              onFilterBoardByAssignee={filterBoardByAssignee}
            />
          )}

          {tab === "board" && boardMode === "active" && (
            <GanttChangeBanner
              changes={ganttChanges}
              onAcknowledge={() => void acknowledgeGanttChanges()}
              acknowledging={ganttAckSubmitting}
            />
          )}

          {tab === "board" && (
            <section className="space-y-3">
              <div className="flex justify-end gap-2">
                {pmAdmin ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void openGanttMappingModal()}
                  >
                    ガント工程名
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
                  <HelpCircle size={16} aria-hidden />
                  ヘルプ
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs text-fg-subtle">表示</label>
                  <div className="flex rounded-md border border-border-subtle bg-bg-surface p-0.5">
                    <button
                      type="button"
                      className={cn(
                        "rounded px-3 py-1.5 text-xs font-medium",
                        boardMode === "active" ? "bg-accent-primary text-bg-base" : "text-fg-muted"
                      )}
                      onClick={() => setBoardMode("active")}
                    >
                      アクティブ
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded px-3 py-1.5 text-xs font-medium",
                        boardMode === "history" ? "bg-accent-primary text-bg-base" : "text-fg-muted"
                      )}
                      onClick={() => {
                        setBoardMode("history");
                        setBoardSortKey("completedAt");
                        setBoardSortDir("desc");
                        setBoardPage(1);
                      }}
                    >
                      履歴
                    </button>
                  </div>
                </div>
                {boardMode === "history" && (
                  <div>
                    <label className="mb-1 block text-xs text-fg-subtle">履歴の工程</label>
                    <div className="flex rounded-md border border-border-subtle bg-bg-surface p-0.5">
                      {BOARD_HISTORY_VIEWS.map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={cn(
                            "rounded px-2.5 py-1.5 text-xs font-medium sm:px-3",
                            boardHistoryProcessView === v ? "bg-accent-primary text-bg-base" : "text-fg-muted"
                          )}
                          onClick={() => setBoardHistoryProcessView(v)}
                        >
                          {v === "solidworks" ? "SolidWorks" : v === "cadmac" ? "CADMAC" : "両方"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="min-w-[8rem]">
                  <label className="mb-1 block text-xs text-fg-subtle">客先</label>
                  <select
                    className="w-full min-w-[8rem] rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-fg-primary"
                    value={boardCascadeClient}
                    onChange={(e) => setCascadeClient(e.target.value)}
                  >
                    <option value="">（すべて）</option>
                    {boardCascadeMeta.clientOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[12rem] max-w-[20rem]">
                  <label className="mb-1 block text-xs text-fg-subtle">案件</label>
                  <select
                    className="w-full rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-fg-primary"
                    value={boardCascadeProject}
                    onChange={(e) => setCascadeProject(e.target.value)}
                    disabled={boardCascadeMeta.projectOptions.length === 0}
                  >
                    <option value="">（すべて）</option>
                    {boardCascadeMeta.projectOptions.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[8rem]">
                  <label className="mb-1 block text-xs text-fg-subtle">工程</label>
                  <select
                    className="w-full rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-fg-primary"
                    value={boardCascadeProcess}
                    onChange={(e) => setCascadeProcess(e.target.value)}
                    disabled={boardCascadeMeta.processOptions.length === 0}
                  >
                    <option value="">（すべて）</option>
                    {boardCascadeMeta.processOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[8rem]">
                  <label className="mb-1 block text-xs text-fg-subtle">担当</label>
                  <select
                    className="w-full rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-fg-primary"
                    value={boardCascadeAssignee}
                    onChange={(e) => setBoardCascadeAssignee(e.target.value)}
                    disabled={boardCascadeMeta.assigneeOptions.length === 0}
                  >
                    <option value="">（すべて）</option>
                    {boardCascadeMeta.assigneeOptions.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[10rem] flex-1">
                  <label className="mb-1 block text-xs text-fg-subtle">検索</label>
                  <input
                    className="w-full rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-fg-primary"
                    value={boardQuery}
                    onChange={(e) => setBoardQuery(e.target.value)}
                    placeholder="製番・案件名・タスクなど"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void refreshBoard().catch((err) =>
                      setMessage(err instanceof Error ? err.message : String(err))
                    );
                  }}
                >
                  再読込
                </Button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-border-subtle bg-bg-elevated text-xs text-fg-subtle">
                    <tr>
                      <BoardSortHeader
                        label="案件"
                        sortKey="project"
                        activeKey={boardSortKey}
                        dir={boardSortDir}
                        onSort={handleBoardSort}
                      />
                      <BoardSortHeader
                        label="工程"
                        sortKey="processType"
                        activeKey={boardSortKey}
                        dir={boardSortDir}
                        onSort={handleBoardSort}
                      />
                      <BoardSortHeader
                        label="担当"
                        sortKey="assignee"
                        activeKey={boardSortKey}
                        dir={boardSortDir}
                        onSort={handleBoardSort}
                      />
                      <BoardSortHeader
                        label="状態"
                        sortKey="status"
                        activeKey={boardSortKey}
                        dir={boardSortDir}
                        onSort={handleBoardSort}
                        className="min-w-[4.5rem] whitespace-nowrap"
                      />
                      <BoardSortHeader
                        label="進捗"
                        sortKey="progressPercent"
                        activeKey={boardSortKey}
                        dir={boardSortDir}
                        onSort={handleBoardSort}
                        align="right"
                        className="w-20 tabular-nums"
                      />
                      {showBoardHistoryDateCols && (
                        <>
                          <BoardSortHeader
                            label="着手"
                            sortKey="startedAt"
                            activeKey={boardSortKey}
                            dir={boardSortDir}
                            onSort={handleBoardSort}
                            className="min-w-[7.5rem] whitespace-nowrap"
                          />
                          <BoardSortHeader
                            label="完了"
                            sortKey="completedAt"
                            activeKey={boardSortKey}
                            dir={boardSortDir}
                            onSort={handleBoardSort}
                            className="min-w-[7.5rem] whitespace-nowrap"
                          />
                        </>
                      )}
                      {showBoardOpsCol && (
                        <th className="whitespace-nowrap px-3 py-2 text-left align-middle text-fg-subtle">
                          操作
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle text-fg-primary">
                    {boardTotal === 0 && (
                      <tr>
                        <td colSpan={boardColCount} className="px-3 py-8 text-center text-fg-muted">
                          該当タスクはありません。
                        </td>
                      </tr>
                    )}
                    {pageRows.map((t) => (
                      <tr
                        key={t.id}
                        className={cn(
                          "bg-bg-surface",
                          sidePanelTask?.id === t.id && "bg-accent-primary/5"
                        )}
                      >
                        <td className="align-middle px-3 py-2">
                          <button
                            type="button"
                            className="w-full text-left rounded-md px-1 py-0.5 hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
                            onClick={() => setSidePanelTask(t)}
                          >
                            <div className="font-medium text-fg-primary">{t.projectName}</div>
                            <div className="text-xs text-fg-muted">
                              {t.seisanProjectNo ? `製番 ${t.seisanProjectNo}` : t.title}
                            </div>
                          </button>
                          <ParallelMetaBadges task={t} />
                        </td>
                        <td className="align-middle px-3 py-2 text-fg-muted">
                          {processTypeLabel(t.processType)}
                        </td>
                        <td className="align-middle px-3 py-2 text-fg-muted">
                          {t.assignee || "—"}
                          {t.supportAssigneeSummary ? (
                            <div className="text-[10px] text-fg-subtle">補: {t.supportAssigneeSummary}</div>
                          ) : null}
                        </td>
                        <td className="align-middle whitespace-nowrap px-3 py-2">
                          <PmTaskStatusBadge status={t.status} />
                        </td>
                        <td
                          className="align-middle px-3 py-2 text-right tabular-nums"
                          title="マイタスクのスライダーで入力した進捗（％）"
                        >
                          <span className="font-semibold text-fg-primary">{t.progressPercent}</span>
                          <span className="text-xs text-fg-muted">％</span>
                        </td>
                        {showBoardHistoryDateCols && (
                          <>
                            <td className="align-middle whitespace-nowrap px-3 py-2 text-xs text-fg-muted">
                              {formatBoardDateTime(t.startedAt)}
                            </td>
                            <td className="align-middle whitespace-nowrap px-3 py-2 text-xs text-fg-muted">
                              {formatBoardDateTime(t.completedAt)}
                            </td>
                          </>
                        )}
                        {showBoardOpsCol && (
                          <td className="align-middle whitespace-nowrap px-3 py-2">
                            <ProcessMgmtActionMenu
                              task={t}
                              session={session}
                              boardMode={boardMode}
                              canOperate={canWritePmTasks}
                              pmAdmin={pmAdmin}
                              handlers={{
                                onStart: handleStartTask,
                                onComplete: handleCompleteTask,
                                onPause: handlePauseTask,
                                onResume: handleResumeTask,
                                onWorkMode: setWorkModeTarget,
                                onSupport: (task) => void openSupportModal(task),
                                onHandoff: setHandoffTarget,
                                onUndoComplete: (task) => {
                                  setUndoTarget(task);
                                  setUndoReason("");
                                  setUndoError(null);
                                },
                              }}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <p className="text-xs text-fg-muted">
                  全{" "}
                  <span className="tabular-nums font-medium text-fg-primary">{boardTotal}</span>{" "}
                  件中{" "}
                  <span className="tabular-nums font-medium text-fg-primary">
                    {boardRangeStart}–{boardRangeEnd}
                  </span>{" "}
                  件を表示
                  <span className="mx-1.5 text-fg-subtle">·</span>
                  <span className="text-fg-subtle">
                    {boardPage} / {boardTotalPages} ページ
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <label className="flex items-center gap-2 text-xs text-fg-subtle">
                    <span>表示件数</span>
                    <select
                      className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1.5 text-sm text-fg-primary"
                      value={boardPageSize}
                      onChange={(e) => setBoardPageSize(Number(e.target.value) as BoardPageSize)}
                    >
                      {BOARD_PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={boardPage <= 1}
                      onClick={() => setBoardPage((p) => Math.max(1, p - 1))}
                    >
                      前へ
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={boardPage >= boardTotalPages}
                      onClick={() => setBoardPage((p) => Math.min(boardTotalPages, p + 1))}
                    >
                      次へ
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {tab === "mytasks" && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex rounded-md border border-border-subtle bg-bg-surface p-0.5">
                  {(
                    [
                      ["primary", "主担当"],
                      ["support", "補助"],
                      ["all", "すべて"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={cn(
                        "rounded px-3 py-1.5 text-xs font-medium",
                        myTaskFilter === id ? "bg-accent-primary text-bg-base" : "text-fg-muted"
                      )}
                      onClick={() => setMyTaskFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void refreshMyTasks().catch((err) =>
                        setMessage(err instanceof Error ? err.message : String(err))
                      );
                    }}
                  >
                    再読込
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
                    <HelpCircle size={16} aria-hidden />
                    ヘルプ
                  </Button>
                </div>
              </div>
              <ul className="space-y-3">
                {filteredMyTasks.length === 0 && (
                  <li className="rounded-lg border border-border-subtle bg-bg-surface p-8 text-center text-sm text-fg-muted">
                    {myTasks.length === 0
                      ? "未完了の担当タスクはありません。"
                      : "選択した条件に該当するタスクはありません。"}
                  </li>
                )}
                {filteredMyTasks.map((t) => (
                  <ProcessMgmtMyTaskCard
                    key={t.id}
                    task={t}
                    session={session}
                    writable={canWritePmTasks}
                    onRefresh={refreshMyTasks}
                    onError={(msg) => setMessage(msg)}
                    onOpenCaseDetail={(id) => void openCaseDetailReadOnly(id)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      {sidePanelTask ? (
        <div
          className="fixed inset-0 z-40 bg-black/20 sm:top-14"
          role="presentation"
          onClick={() => setSidePanelTask(null)}
        />
      ) : null}
      <ProcessMgmtSidePanel
        task={sidePanelTask}
        projectTasks={sidePanelProjectTasks}
        onClose={() => setSidePanelTask(null)}
        onOpenSeisanDetail={(id) => void openCaseDetailReadOnly(id)}
      />
      <Modal
        open={helpOpen}
        title={
          tab === "board"
            ? "工程管理（ボード）のヘルプ"
            : tab === "mytasks"
              ? "工程管理（マイタスク）のヘルプ"
              : "工程管理（ダッシュボード）のヘルプ"
        }
        onClose={() => setHelpOpen(false)}
        width="lg"
      >
        <div className="space-y-4 text-sm leading-relaxed text-fg-primary">
          <p className="font-medium text-fg-primary">
            {tab === "board"
              ? BOARD_PAGE_TAGLINE
              : tab === "mytasks"
                ? MY_TASKS_PAGE_TAGLINE
                : "工程の概要と未確認通知を確認できます。詳細操作はボードまたはマイタスクから行ってください。"}
          </p>
          <p className="text-fg-muted">{HELP_DB_STORAGE_NOTE}</p>
          {tab === "board" ? (
            <>
              <p>{BOARD_HELP_OVERVIEW}</p>
              <p>{BOARD_HELP_PROGRESS}</p>
              <p>{BOARD_HELP_VIEW_ACTIVE_TEMPLATE(PROCESS_VIEW_LABELS[session.processView])}</p>
              <p>{BOARD_HELP_HISTORY}</p>
              <p className="text-xs text-fg-muted">{BOARD_HELP_ACTIVE_HISTORY_HINT}</p>
              <p className="text-xs text-fg-muted">{BOARD_HELP_PARALLEL}</p>
              <p className="text-xs text-fg-muted">{BOARD_HELP_LIFECYCLE}</p>
              <p className="text-xs text-fg-muted">{pmAdmin ? BOARD_HELP_UNDO_ADMIN : BOARD_HELP_UNDO_VIEWER}</p>
            </>
          ) : (
            <>
              <p>{MY_TASKS_HELP_SCOPE_TEMPLATE(session.username)}</p>
              <p>{MY_TASKS_HELP_INPUT}</p>
              <p>{MY_TASKS_HELP_CASE_VIEW}</p>
              {!pmAdmin && <p className="text-xs text-fg-muted">{MY_TASKS_HELP_COMPLETE_MISTAKE_VIEWER}</p>}
            </>
          )}
        </div>
      </Modal>
      <UndoCompleteDialog
        task={undoTarget}
        reason={undoReason}
        onReasonChange={setUndoReason}
        onClose={closeUndoDialog}
        onConfirm={() => void confirmUndoComplete()}
        submitting={undoSubmitting}
        error={undoError}
      />
      <SeisanProjectDetailDialog
        open={caseDetailOpen}
        onClose={closeCaseDetail}
        loading={caseDetailLoading}
        error={caseDetailError}
        project={caseDetailProject}
      />
      <HandoffModal
        open={handoffTarget != null}
        task={handoffTarget}
        nextBatchNo={(handoffTarget?.handoffCount ?? 0) + 1}
        onClose={() => setHandoffTarget(null)}
        onSubmit={(note) => void submitHandoff(note)}
        submitting={handoffSubmitting}
      />
      <WorkModeModal
        open={workModeTarget != null}
        task={workModeTarget}
        onClose={() => setWorkModeTarget(null)}
        onSubmit={(mode, note) => void submitWorkMode(mode, note)}
        submitting={workModeSubmitting}
      />
      <SupportAssigneesModal
        open={supportTarget != null}
        task={supportTarget}
        candidates={supportCandidates}
        loadingCandidates={supportCandidatesLoading}
        onClose={() => setSupportTarget(null)}
        onSubmit={(ids) => void submitSupportAssignees(ids)}
        submitting={supportSubmitting}
      />
      <GanttTemplateMappingModal
        open={ganttMappingOpen}
        mapping={ganttMapping}
        onClose={() => setGanttMappingOpen(false)}
        onSubmit={(input) => void submitGanttMapping(input)}
        submitting={ganttMappingSubmitting}
      />
    </div>
  );
}

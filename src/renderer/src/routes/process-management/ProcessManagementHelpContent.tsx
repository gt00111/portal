import {
  BOARD_HELP_ACTIVE_HISTORY_HINT,
  BOARD_HELP_HISTORY,
  BOARD_HELP_LIFECYCLE,
  BOARD_HELP_OVERVIEW,
  BOARD_HELP_PARALLEL,
  BOARD_HELP_PROGRESS,
  BOARD_HELP_UNDO_ADMIN,
  BOARD_HELP_UNDO_VIEWER,
  BOARD_HELP_VIEW_ACTIVE_TEMPLATE,
  BOARD_PAGE_TAGLINE,
  DASHBOARD_PAGE_TAGLINE,
  HELP_DASHBOARD_SECTIONS,
  MY_TASKS_HELP_CASE_VIEW,
  MY_TASKS_HELP_COMPLETE_MISTAKE_VIEWER,
  MY_TASKS_HELP_INPUT,
  MY_TASKS_HELP_SCOPE_TEMPLATE,
  MY_TASKS_PAGE_TAGLINE,
} from "@renderer/routes/process-management/processManagementHelpCopy.js";
import { PROCESS_VIEW_LABELS, type ProcessView } from "@shared/processView.js";

export type ProcessMgmtHelpVariant = "dashboard" | "board" | "mytasks";

const TAGLINES: Record<ProcessMgmtHelpVariant, string> = {
  dashboard: DASHBOARD_PAGE_TAGLINE,
  board: BOARD_PAGE_TAGLINE,
  mytasks: MY_TASKS_PAGE_TAGLINE,
};

const TITLES: Record<ProcessMgmtHelpVariant, string> = {
  dashboard: "工程管理（ダッシュボード）の見方",
  board: "工程管理（ボード）のヘルプ",
  mytasks: "工程管理（マイタスク）のヘルプ",
};

function SectionList({ items }: { items: readonly string[] }): JSX.Element {
  return (
    <ul className="list-inside list-disc space-y-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function processMgmtHelpTitle(variant: ProcessMgmtHelpVariant): string {
  return TITLES[variant];
}

export function ProcessManagementHelpContent({
  variant,
  username,
  processView,
  pmAdmin,
}: {
  variant: ProcessMgmtHelpVariant;
  username: string;
  processView: ProcessView;
  pmAdmin: boolean;
}): JSX.Element {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-fg-primary">
      <p className="font-medium text-fg-primary">{TAGLINES[variant]}</p>

      {variant === "dashboard" &&
        HELP_DASHBOARD_SECTIONS.map((sec) => (
          <section key={sec.title}>
            <h3 className="mb-1 font-semibold text-fg-primary">{sec.title}</h3>
            {"body" in sec && sec.body ? <p className="text-fg-muted">{sec.body}</p> : null}
            {"items" in sec && sec.items ? <SectionList items={sec.items} /> : null}
          </section>
        ))}

      {variant === "board" && (
        <>
          <p>{BOARD_HELP_OVERVIEW}</p>
          <p>{BOARD_HELP_PROGRESS}</p>
          <p>{BOARD_HELP_VIEW_ACTIVE_TEMPLATE(PROCESS_VIEW_LABELS[processView])}</p>
          <p>{BOARD_HELP_HISTORY}</p>
          <p className="text-xs text-fg-muted">{BOARD_HELP_ACTIVE_HISTORY_HINT}</p>
          <p className="text-xs text-fg-muted">{BOARD_HELP_PARALLEL}</p>
          <p className="text-xs text-fg-muted">{BOARD_HELP_LIFECYCLE}</p>
          <p className="text-xs text-fg-muted">{pmAdmin ? BOARD_HELP_UNDO_ADMIN : BOARD_HELP_UNDO_VIEWER}</p>
        </>
      )}

      {variant === "mytasks" && (
        <>
          <p>{MY_TASKS_HELP_SCOPE_TEMPLATE(username)}</p>
          <p>{MY_TASKS_HELP_INPUT}</p>
          <p>{MY_TASKS_HELP_CASE_VIEW}</p>
          {!pmAdmin && <p className="text-xs text-fg-muted">{MY_TASKS_HELP_COMPLETE_MISTAKE_VIEWER}</p>}
        </>
      )}
    </div>
  );
}

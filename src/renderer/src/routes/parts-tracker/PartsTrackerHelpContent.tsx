import type { AppRole } from "@shared/auth.js";

import {
  HELP_ADD_EDIT,
  HELP_ARRANGED,
  HELP_ASSEMBLY_BADGE,
  HELP_TABLE_TEXT,
  HELP_BOM_DIFF,
  HELP_CSV_IMPORT,
  HELP_DB_STORAGE_NOTE,
  HELP_EXPORT,
  HELP_HIDDEN,
  HELP_HISTORY,
  HELP_INLINE_EDIT,
  HELP_MASTER,
  HELP_PROJECT_COMPLETE,
  HELP_PROJECT_SELECT,
  HELP_REVISION,
  HELP_RISK,
  HELP_ROW_COLORS,
  HELP_ROLES_ADMIN,
  HELP_ROLES_EDITOR,
  HELP_ROLES_VIEWER,
  HELP_WELDING_MAPPING,
  PARTS_TRACKER_COMPARE_PAGE_TAGLINE,
  PARTS_TRACKER_HISTORY_PAGE_TAGLINE,
  PARTS_TRACKER_PAGE_TAGLINE,
} from "@renderer/routes/parts-tracker/partsTrackerHelpCopy.js";

type Variant = "main" | "compare" | "history";

interface Props {
  variant: Variant;
  appRole: AppRole | null;
}

function roleHelpParagraph(role: AppRole | null): string {
  if (role === "admin") return `${HELP_ROLES_EDITOR} ${HELP_ROLES_ADMIN}`;
  if (role === "editor") return HELP_ROLES_EDITOR;
  return HELP_ROLES_VIEWER;
}

export function PartsTrackerHelpContent({ variant, appRole }: Props): JSX.Element {
  const tagline =
    variant === "compare"
      ? PARTS_TRACKER_COMPARE_PAGE_TAGLINE
      : variant === "history"
        ? PARTS_TRACKER_HISTORY_PAGE_TAGLINE
        : PARTS_TRACKER_PAGE_TAGLINE;

  return (
    <div className="space-y-3 text-sm leading-relaxed text-fg-primary">
      <p className="font-medium text-fg-primary">{tagline}</p>
      {variant === "main" && <p className="text-fg-muted">{HELP_DB_STORAGE_NOTE}</p>}
      {variant === "main" && (
        <>
          <p>{HELP_PROJECT_SELECT}</p>
          <p>{HELP_ADD_EDIT}</p>
          <p>{HELP_INLINE_EDIT}</p>
          <p>{HELP_RISK}</p>
          <p>{HELP_ARRANGED}</p>
          <p>{HELP_ROW_COLORS}</p>
          <p>{HELP_PROJECT_COMPLETE}</p>
          {appRole === "admin" && <p>{HELP_WELDING_MAPPING}</p>}
          <p>{HELP_REVISION}</p>
          <p>{HELP_HIDDEN}</p>
          <p>{HELP_CSV_IMPORT}</p>
          <p>{HELP_ASSEMBLY_BADGE}</p>
          <p>{HELP_TABLE_TEXT}</p>
          <p>{HELP_EXPORT}</p>
          <p>{HELP_HISTORY}</p>
          <p>{HELP_BOM_DIFF}</p>
          <p>{HELP_MASTER}</p>
          <p>{roleHelpParagraph(appRole)}</p>
        </>
      )}
      {variant === "compare" && (
        <>
          <p>{HELP_BOM_DIFF}</p>
          <p>{HELP_ASSEMBLY_BADGE}</p>
          <p>{HELP_TABLE_TEXT}</p>
          <p className="text-fg-muted">{HELP_PROJECT_SELECT}</p>
        </>
      )}
      {variant === "history" && (
        <>
          <p>{HELP_HISTORY}</p>
          <p>{HELP_ASSEMBLY_BADGE}</p>
          <p>{HELP_TABLE_TEXT}</p>
          <p>{HELP_EXPORT}</p>
          <p className="text-fg-muted">{HELP_DB_STORAGE_NOTE}</p>
        </>
      )}
    </div>
  );
}

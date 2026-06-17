import {
  HELP_COMPARE_SECTIONS,
  HELP_HISTORY_SECTIONS,
  HELP_MAIN_SECTIONS,
  HELP_ROLES_ADMIN,
  HELP_ROLES_EDITOR,
  HELP_ROLES_VIEWER,
  HELP_WELDING_MAPPING,
  PARTS_TRACKER_COMPARE_PAGE_TAGLINE,
  PARTS_TRACKER_HISTORY_PAGE_TAGLINE,
  PARTS_TRACKER_PAGE_TAGLINE,
} from "@renderer/routes/parts-tracker/partsTrackerHelpCopy.js";
import type { AppRole } from "@shared/auth.js";

export type PartsTrackerHelpVariant = "main" | "compare" | "history";

const TAGLINES: Record<PartsTrackerHelpVariant, string> = {
  main: PARTS_TRACKER_PAGE_TAGLINE,
  compare: PARTS_TRACKER_COMPARE_PAGE_TAGLINE,
  history: PARTS_TRACKER_HISTORY_PAGE_TAGLINE,
};

const SECTIONS: Record<
  PartsTrackerHelpVariant,
  readonly { title: string; body?: string; steps?: readonly string[]; items?: readonly string[] }[]
> = {
  main: HELP_MAIN_SECTIONS,
  compare: HELP_COMPARE_SECTIONS,
  history: HELP_HISTORY_SECTIONS,
};

function SectionList({ items }: { items: readonly string[] }): JSX.Element {
  return (
    <ul className="list-inside list-disc space-y-1 text-fg-muted">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function StepsList({ steps }: { steps: readonly string[] }): JSX.Element {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-fg-muted">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

function roleHelpParagraph(role: AppRole | null): string {
  if (role === "admin") return `${HELP_ROLES_EDITOR} ${HELP_ROLES_ADMIN}`;
  if (role === "editor") return HELP_ROLES_EDITOR;
  return HELP_ROLES_VIEWER;
}

export function PartsTrackerHelpContent({
  variant,
  appRole,
}: {
  variant: PartsTrackerHelpVariant;
  appRole: AppRole | null;
}): JSX.Element {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-fg-primary">
      <p className="font-medium text-fg-primary">{TAGLINES[variant]}</p>

      {SECTIONS[variant].map((sec) => (
        <section key={sec.title}>
          <h3 className="mb-1 font-semibold text-fg-primary">{sec.title}</h3>
          {"body" in sec && sec.body ? <p className="text-fg-muted">{sec.body}</p> : null}
          {"items" in sec && sec.items ? <SectionList items={sec.items} /> : null}
          {"steps" in sec && sec.steps ? <StepsList steps={sec.steps} /> : null}
        </section>
      ))}

      {variant === "main" && (
        <section>
          <h3 className="mb-1 font-semibold text-fg-primary">権限別にできること</h3>
          <p className="text-fg-muted">{roleHelpParagraph(appRole)}</p>
          {appRole === "admin" && <p className="mt-1 text-fg-muted">{HELP_WELDING_MAPPING}</p>}
        </section>
      )}
    </div>
  );
}

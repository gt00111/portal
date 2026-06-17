import {
  DASHBOARD_PAGE_TAGLINE,
  GANTT_PAGE_TAGLINE,
  HELP_DASHBOARD_SECTIONS,
  HELP_GANTT_SECTIONS,
  HELP_PROJECT_DETAIL_SECTIONS,
  HELP_PROJECTS_SECTIONS,
  PROJECT_DETAIL_PAGE_TAGLINE,
  PROJECTS_PAGE_TAGLINE,
} from "@renderer/apps/seisan-board/seisanBoardHelpCopy.js";

export type SeisanHelpVariant = "dashboard" | "projects" | "project-detail" | "gantt";

const TAGLINES: Record<SeisanHelpVariant, string> = {
  dashboard: DASHBOARD_PAGE_TAGLINE,
  projects: PROJECTS_PAGE_TAGLINE,
  "project-detail": PROJECT_DETAIL_PAGE_TAGLINE,
  gantt: GANTT_PAGE_TAGLINE,
};

const TITLES: Record<SeisanHelpVariant, string> = {
  dashboard: "ダッシュボードの見方",
  projects: "案件一覧のヘルプ",
  "project-detail": "案件詳細のヘルプ",
  gantt: "ガントスケジュールのヘルプ",
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

function StepsList({ steps }: { steps: readonly string[] }): JSX.Element {
  return (
    <ol className="list-decimal space-y-1 pl-5">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

export function seisanHelpTitle(variant: SeisanHelpVariant): string {
  return TITLES[variant];
}

export function SeisanBoardHelpContent({ variant }: { variant: SeisanHelpVariant }): JSX.Element {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
      <p className="font-medium text-foreground">{TAGLINES[variant]}</p>

      {variant === "dashboard" &&
        HELP_DASHBOARD_SECTIONS.map((sec) => (
          <section key={sec.title}>
            <h3 className="mb-1 font-semibold text-foreground">{sec.title}</h3>
            {"body" in sec && sec.body ? <p>{sec.body}</p> : null}
            {"items" in sec && sec.items ? <SectionList items={sec.items} /> : null}
          </section>
        ))}

      {variant === "projects" &&
        HELP_PROJECTS_SECTIONS.map((sec) => (
          <section key={sec.title}>
            <h3 className="mb-1 font-semibold text-foreground">{sec.title}</h3>
            {"body" in sec && sec.body ? <p className="mb-1">{sec.body}</p> : null}
            {"steps" in sec && sec.steps ? <StepsList steps={sec.steps} /> : null}
          </section>
        ))}

      {variant === "project-detail" &&
        HELP_PROJECT_DETAIL_SECTIONS.map((sec) => (
          <section key={sec.title}>
            <h3 className="mb-1 font-semibold text-foreground">{sec.title}</h3>
            {"body" in sec && sec.body ? <p className="mb-1">{sec.body}</p> : null}
            {"items" in sec && sec.items ? <SectionList items={sec.items} /> : null}
            {"steps" in sec && sec.steps ? <StepsList steps={sec.steps} /> : null}
          </section>
        ))}

      {variant === "gantt" && (
        <>
          <p className="text-xs">
            取締役・部長・工場長が毎日開き、納期に間に合うか全体の進捗を確認する画面です。
          </p>
          {HELP_GANTT_SECTIONS.map((sec) => (
            <section key={sec.title}>
              <h3 className="mb-1 font-semibold text-foreground">{sec.title}</h3>
              <StepsList steps={sec.steps} />
            </section>
          ))}
        </>
      )}
    </div>
  );
}

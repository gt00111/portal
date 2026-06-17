import {
  HELP_COMMON_INTRO,
  HELP_TAB_CONTENT,
  MASTER_DATABASE_PAGE_TAGLINE,
  masterCrudHelpSteps,
} from "@renderer/routes/master/masterDatabaseHelpCopy.js";
import { MASTER_TABLE_LABELS, type MasterTable } from "@shared/master.js";

export type MasterHelpVariant =
  | MasterTable
  | "user-access"
  | "audit-log"
  | "procurement-lead-times"
  | "m_skus";

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

export function masterHelpTitle(variant: MasterHelpVariant): string {
  const tab = HELP_TAB_CONTENT[variant];
  return tab ? `マスターデータベース（${tab.title}）のヘルプ` : "マスターデータベースのヘルプ";
}

export function MasterDatabaseHelpContent({ variant }: { variant: MasterHelpVariant }): JSX.Element {
  const tab = HELP_TAB_CONTENT[variant];
  const tableLabel = variant in MASTER_TABLE_LABELS ? MASTER_TABLE_LABELS[variant as MasterTable] : tab?.title;

  return (
    <div className="space-y-4 text-sm leading-relaxed text-fg-primary">
      <p className="font-medium text-fg-primary">{tab?.tagline ?? MASTER_DATABASE_PAGE_TAGLINE}</p>

      <section>
        <h3 className="mb-1 font-semibold text-fg-primary">{HELP_COMMON_INTRO.title}</h3>
        <SectionList items={HELP_COMMON_INTRO.items} />
      </section>

      {tab && (
        <section>
          <h3 className="mb-1 font-semibold text-fg-primary">このタブで登録するもの</h3>
          <p className="text-fg-muted">{tab.registers}</p>
          <p className="mt-1 text-fg-muted">
            <span className="font-medium text-fg-primary">使われ方: </span>
            {tab.usedBy}
          </p>
        </section>
      )}

      <section>
        <h3 className="mb-1 font-semibold text-fg-primary">
          操作手順{tableLabel ? ` — ${tableLabel}` : ""}
        </h3>
        <StepsList steps={masterCrudHelpSteps(variant)} />
        {variant in MASTER_TABLE_LABELS && !tab?.steps ? (
          <p className="mt-2 text-xs text-fg-muted">
            上記は {tableLabel} タブを含む名称マスタ共通の手順です。
          </p>
        ) : null}
      </section>

      {tab?.extra?.map((sec) => (
        <section key={sec.title}>
          <h3 className="mb-1 font-semibold text-fg-primary">{sec.title}</h3>
          {sec.body ? <p className="text-fg-muted">{sec.body}</p> : null}
          {sec.steps ? <StepsList steps={sec.steps} /> : null}
        </section>
      ))}
    </div>
  );
}

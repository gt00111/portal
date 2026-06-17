import {
  CUSTOMER_DRAWINGS_PAGE_TAGLINE,
  HELP_CUSTOMER_SECTIONS,
  HELP_PDF_COMPARE_SECTIONS,
  HELP_WORK_SECTIONS,
  PDF_COMPARE_PAGE_TAGLINE,
  WORK_DRAWINGS_PAGE_TAGLINE,
} from "@renderer/routes/drawing-library/drawingLibraryHelpCopy.js";

export type DrawingLibraryHelpVariant = "customer" | "work" | "pdf-compare";

const TAGLINES: Record<DrawingLibraryHelpVariant, string> = {
  customer: CUSTOMER_DRAWINGS_PAGE_TAGLINE,
  work: WORK_DRAWINGS_PAGE_TAGLINE,
  "pdf-compare": PDF_COMPARE_PAGE_TAGLINE,
};

const TITLES: Record<DrawingLibraryHelpVariant, string> = {
  customer: "図面ライブラリ（顧客図面）のヘルプ",
  work: "図面ライブラリ（自社発行）のヘルプ",
  "pdf-compare": "図面ライブラリ（PDF比較）のヘルプ",
};

const SECTIONS: Record<
  DrawingLibraryHelpVariant,
  readonly { title: string; body?: string; steps?: readonly string[] }[]
> = {
  customer: HELP_CUSTOMER_SECTIONS,
  work: HELP_WORK_SECTIONS,
  "pdf-compare": HELP_PDF_COMPARE_SECTIONS,
};

function StepsList({ steps }: { steps: readonly string[] }): JSX.Element {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-fg-muted">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

export function drawingLibraryHelpTitle(variant: DrawingLibraryHelpVariant): string {
  return TITLES[variant];
}

export function DrawingLibraryHelpContent({
  variant,
}: {
  variant: DrawingLibraryHelpVariant;
}): JSX.Element {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-fg-primary">
      <p className="font-medium text-fg-primary">{TAGLINES[variant]}</p>
      {SECTIONS[variant].map((sec) => (
        <section key={sec.title}>
          <h3 className="mb-1 font-semibold text-fg-primary">{sec.title}</h3>
          {"body" in sec && sec.body ? <p className="text-fg-muted">{sec.body}</p> : null}
          {"steps" in sec && sec.steps ? <StepsList steps={sec.steps} /> : null}
        </section>
      ))}
    </div>
  );
}

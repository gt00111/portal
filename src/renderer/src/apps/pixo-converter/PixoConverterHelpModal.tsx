import {
  HELP_PIXO_SECTIONS,
  PIXO_COMMON_USE,
  PIXO_HELP_TITLES,
  type PixoHelpVariant,
} from "@renderer/apps/pixo-converter/pixoConverterHelpCopy.js";

function StepsList({ steps }: { steps: readonly string[] }): JSX.Element {
  return (
    <ol
      style={{
        listStyle: "decimal",
        paddingLeft: "1.25rem",
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        color: "var(--text-secondary, #64748b)",
        fontSize: "0.875rem",
        lineHeight: 1.6,
      }}
    >
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

export function pixoHelpTitle(variant: PixoHelpVariant): string {
  return PIXO_HELP_TITLES[variant];
}

export function PixoConverterHelpContent({ variant }: { variant: PixoHelpVariant }): JSX.Element {
  const sec = HELP_PIXO_SECTIONS[variant];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.875rem", lineHeight: 1.6 }}>
      <p style={{ margin: 0, fontWeight: 600, color: "var(--text-primary, #1e293b)" }}>{sec.body}</p>
      <p style={{ margin: 0, color: "var(--text-secondary, #64748b)" }}>{PIXO_COMMON_USE}</p>
      <section>
        <h3
          style={{
            margin: "0 0 0.35rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--text-primary, #1e293b)",
          }}
        >
          操作手順
        </h3>
        <StepsList steps={sec.steps} />
      </section>
    </div>
  );
}

/** Flask 原型（Process management）の `process_view` と同値。工程管理 UI の表示切替に使用 */
export const PROCESS_VIEWS = ["solidworks", "cadmac", "both"] as const;
export type ProcessView = (typeof PROCESS_VIEWS)[number];

export function assertProcessView(value: unknown): asserts value is ProcessView {
  if (value !== "solidworks" && value !== "cadmac" && value !== "both") {
    throw new Error("工程表示は solidworks / cadmac / both のいずれかにしてください。");
  }
}

export function parseProcessView(value: string | null | undefined): ProcessView {
  if (value === "solidworks" || value === "cadmac" || value === "both") {
    return value;
  }
  return "both";
}

export const PROCESS_VIEW_LABELS: Record<ProcessView, string> = {
  solidworks: "SolidWorks工程のみ",
  cadmac: "CADMAC工程のみ",
  both: "両方",
};

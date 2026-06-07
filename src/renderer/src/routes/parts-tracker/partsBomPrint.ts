import {
  PART_LINE_STATUS_LABELS,
  PART_SOURCE_TYPE_LABELS,
  showsProcurementLeadTime,
  type ProjectPartLine,
} from "@shared/partsTracker.js";

export interface BomPrintMeta {
  title: string;
  projectLabel: string;
  lineCount: number;
}

function escHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function materialFromNote(note: string | null): string {
  if (!note) return "—";
  const m = note.match(/^材質:\s*(.+?)(?:\s\/\s|$)/);
  return m?.[1]?.trim() || "—";
}

function riskLabel(risk: ProjectPartLine["risk"]): string {
  if (risk === "delayed") return "遅延";
  if (risk === "need_order") return "要発注";
  return "—";
}

function printRowCells(line: ProjectPartLine): string {
  const showLt = showsProcurementLeadTime(line.sourceType);
  const rev = line.revision?.trim() || "—";
  const cells = [
    String(line.bomLevel),
    escHtml(line.partNumber),
    escHtml(line.partName),
    escHtml(rev),
    String(line.quantity),
    escHtml(materialFromNote(line.note)),
    escHtml(line.parentAssemblyPartNumber?.trim() || "—"),
    escHtml(PART_SOURCE_TYPE_LABELS[line.sourceType]),
    escHtml(line.supplierName ?? "—"),
    showLt ? String(line.leadTimeDays) : "—",
    escHtml(line.requiredDate),
    showLt ? escHtml(line.orderByDate ?? "—") : "—",
    escHtml(PART_LINE_STATUS_LABELS[line.status]),
    line.isArranged ? "済" : "—",
    escHtml(riskLabel(line.risk)),
  ];
  return cells.map((c) => `<td>${c}</td>`).join("");
}

/** 表示中行を A4 横想定の HTML 表で印刷（別ウィンドウ） */
export function openBomPrintWindow(lines: ProjectPartLine[], meta: BomPrintMeta): boolean {
  const sorted = [...lines].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const printedAt = new Date().toLocaleString("ja-JP");
  const rows = sorted.map((line) => `<tr>${printRowCells(line)}</tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(meta.title)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: "Yu Gothic UI", "Meiryo", sans-serif; font-size: 9pt; color: #111; margin: 0; }
    h1 { font-size: 14pt; margin: 0 0 4px; }
    .meta { font-size: 9pt; color: #444; margin-bottom: 10px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #999; padding: 3px 5px; text-align: left; vertical-align: top; }
    th { background: #eee; font-weight: 600; white-space: nowrap; }
    td.num { text-align: right; }
    tr:nth-child(even) { background: #f8f8f8; }
  </style>
</head>
<body>
  <h1>${escHtml(meta.title)}</h1>
  <p class="meta">
    ${escHtml(meta.projectLabel)}<br />
    行数: ${meta.lineCount}　印刷: ${escHtml(printedAt)}
  </p>
  <table>
    <thead>
      <tr>
        <th>Lv</th>
        <th>品番</th>
        <th>名称</th>
        <th>Rev</th>
        <th>個数</th>
        <th>材質</th>
        <th>親品番</th>
        <th>区分</th>
        <th>商社</th>
        <th>LT</th>
        <th>必要着日</th>
        <th>発注期限</th>
        <th>状態</th>
        <th>手配</th>
        <th>リスク</th>
      </tr>
    </thead>
    <tbody>${rows || "<tr><td colspan=\"15\">行がありません</td></tr>"}</tbody>
  </table>
</body>
</html>`;

  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  const doPrint = (): void => {
    win.print();
    win.addEventListener("afterprint", () => win.close());
  };
  if (win.document.readyState === "complete") {
    doPrint();
  } else {
    win.addEventListener("load", doPrint);
  }
  return true;
}

import { getProcessMgmtDb } from "@main/db/processMgmtConnection.js";
import {
  PM_GANTT_CADMAC_TEMPLATE_NAME,
  PM_GANTT_SW_TEMPLATE_NAME,
  type PmGanttTemplateMapping,
} from "@shared/processMgmtParallel.js";

const KEY_SW = "gantt_sw_template_name";
const KEY_CADMAC = "gantt_cadmac_template_name";

function readMeta(key: string): string | null {
  const db = getProcessMgmtDb();
  const row = db.prepare(`SELECT value FROM process_mgmt_meta WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  const v = row?.value?.trim();
  return v ? v : null;
}

function writeMeta(key: string, value: string): void {
  const db = getProcessMgmtDb();
  db.prepare(
    `
      INSERT INTO process_mgmt_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `
  ).run(key, value);
}

export function getGanttTemplateMapping(): PmGanttTemplateMapping {
  return {
    swTemplateName: readMeta(KEY_SW) ?? PM_GANTT_SW_TEMPLATE_NAME,
    cadmacTemplateName: readMeta(KEY_CADMAC) ?? PM_GANTT_CADMAC_TEMPLATE_NAME,
  };
}

export function setGanttTemplateMapping(input: {
  swTemplateName?: string;
  cadmacTemplateName?: string;
}): PmGanttTemplateMapping {
  const sw = (input.swTemplateName ?? "").trim();
  const cad = (input.cadmacTemplateName ?? "").trim();
  if (!sw) throw new Error("SolidWorks（設計）のガント工程名を入力してください。");
  if (!cad) throw new Error("CADMAC のガント工程名を入力してください。");
  writeMeta(KEY_SW, sw);
  writeMeta(KEY_CADMAC, cad);
  return getGanttTemplateMapping();
}

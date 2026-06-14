/** §8.5.22 溶接開始日の解決・キャッシュ・必要着日追随 */

import { computeOrderByDate } from "@shared/partsTracker.js";
import {
  pickWeldingStartDate,
  WELDING_PROCESS_TEMPLATE_ID_DEFAULT,
  WELDING_PROCESS_TEMPLATE_NAME_DEFAULT,
  type SyncRequiredDatesFromWeldingResult,
  type WeldingProcessTemplateMapping,
  type WeldingStartDateInfo,
} from "@shared/partsTrackerWeldingDate.js";

import { getPartsTrackerDb } from "@main/db/partsTrackerConnection.js";
import { getSeisanDb } from "@main/db/seisanConnection.js";
import * as seisanProjects from "@main/seisan/repos/projects.repo.js";

const META_KEY_TEMPLATE_ID = "welding_process_template_id";

type CacheRow = {
  cached_welding_start: string | null;
  acknowledged_welding_start: string | null;
};

function readMeta(key: string): string | null {
  const row = getPartsTrackerDb()
    .prepare(`SELECT value FROM parts_tracker_meta WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  const v = row?.value?.trim();
  return v ? v : null;
}

function writeMeta(key: string, value: string): void {
  getPartsTrackerDb()
    .prepare(
      `INSERT INTO parts_tracker_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}

function lookupTemplateNameById(templateId: string): string | null {
  const row = getSeisanDb()
    .prepare(`SELECT name FROM process_templates WHERE id = ?`)
    .get(templateId) as { name: string } | undefined;
  const name = row?.name?.trim();
  return name ? name : null;
}

function lookupTemplateIdByName(templateName: string): string | null {
  const row = getSeisanDb()
    .prepare(`SELECT id FROM process_templates WHERE name = ? COLLATE NOCASE LIMIT 1`)
    .get(templateName) as { id: string } | undefined;
  const id = row?.id?.trim();
  return id ? id : null;
}

export function getWeldingProcessTemplateMapping(): WeldingProcessTemplateMapping {
  const processTemplateId = readMeta(META_KEY_TEMPLATE_ID) ?? WELDING_PROCESS_TEMPLATE_ID_DEFAULT;
  const processTemplateName =
    lookupTemplateNameById(processTemplateId) ?? WELDING_PROCESS_TEMPLATE_NAME_DEFAULT;
  return { processTemplateId, processTemplateName };
}

export function setWeldingProcessTemplateMapping(input: {
  processTemplateId?: string;
  processTemplateName?: string;
}): WeldingProcessTemplateMapping {
  const name = (input.processTemplateName ?? "").trim();
  const idDirect = (input.processTemplateId ?? "").trim();
  let processTemplateId = idDirect;
  if (name) {
    const resolved = lookupTemplateIdByName(name);
    if (!resolved) {
      throw new Error(`工程テンプレート「${name}」が見つかりません。`);
    }
    processTemplateId = resolved;
  }
  if (!processTemplateId) {
    throw new Error("必要着日の基準工程（溶接）を入力してください。");
  }
  writeMeta(META_KEY_TEMPLATE_ID, processTemplateId);
  return getWeldingProcessTemplateMapping();
}

export function readWeldingTaskStartDate(seisanProjectId: string): string | null {
  const templateId = getWeldingProcessTemplateMapping().processTemplateId;
  const row = getSeisanDb()
    .prepare(
      `SELECT t.start_date
       FROM tasks t
       WHERE t.project_id = ? AND t.process_template_id = ?
       ORDER BY t.start_date ASC
       LIMIT 1`
    )
    .get(seisanProjectId, templateId) as { start_date: string } | undefined;
  const v = row?.start_date?.trim();
  return v ? v : null;
}

export function resolveWeldingStartDate(seisanProjectId: string): {
  date: string;
  source: ReturnType<typeof pickWeldingStartDate>["source"];
} {
  const project = seisanProjects.get(seisanProjectId);
  return pickWeldingStartDate({
    weldingTaskStartDate: readWeldingTaskStartDate(seisanProjectId),
    projectDeadline: project?.deadline ?? null,
  });
}

function getCache(seisanProjectId: string): CacheRow | null {
  const row = getPartsTrackerDb()
    .prepare(
      `SELECT cached_welding_start, acknowledged_welding_start
       FROM parts_tracker_welding_date_cache
       WHERE seisan_project_id = ?`
    )
    .get(seisanProjectId) as CacheRow | undefined;
  return row ?? null;
}

function upsertCache(
  seisanProjectId: string,
  cachedWeldingStart: string | null,
  acknowledgedWeldingStart: string | null
): void {
  getPartsTrackerDb()
    .prepare(
      `INSERT INTO parts_tracker_welding_date_cache
         (seisan_project_id, cached_welding_start, acknowledged_welding_start, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(seisan_project_id) DO UPDATE SET
         cached_welding_start = excluded.cached_welding_start,
         acknowledged_welding_start = excluded.acknowledged_welding_start,
         updated_at = datetime('now')`
    )
    .run(seisanProjectId, cachedWeldingStart, acknowledgedWeldingStart);
}

/** 案件選択・更新時に溶接日の変更を検知 */
export function getWeldingStartDateInfo(seisanProjectId: string): WeldingStartDateInfo {
  const id = (seisanProjectId ?? "").trim();
  if (!id) throw new Error("案件 ID が必要です。");

  const resolved = resolveWeldingStartDate(id);
  const currentRaw = readWeldingTaskStartDate(id);
  const cache = getCache(id);

  if (!cache) {
    upsertCache(id, currentRaw, currentRaw);
    return {
      date: resolved.date,
      source: resolved.source,
      weldingTaskStartDate: currentRaw,
      previousCachedDate: null,
      changed: false,
    };
  }

  const acknowledged = cache.acknowledged_welding_start;
  const changed = currentRaw !== null && acknowledged !== currentRaw;

  upsertCache(id, currentRaw, acknowledged);

  return {
    date: resolved.date,
    source: resolved.source,
    weldingTaskStartDate: currentRaw,
    previousCachedDate: acknowledged,
    changed,
  };
}

function bulkUpdateRequiredDate(
  seisanProjectId: string,
  requiredDate: string,
  options: { onlyIfOverride0: boolean; resetOverride0?: boolean }
): number {
  const db = getPartsTrackerDb();
  const rows = db
    .prepare(
      `SELECT id, lead_time_days, required_date_user_override
       FROM project_part_lines
       WHERE seisan_project_id = ?`
    )
    .all(seisanProjectId) as Array<{
    id: number;
    lead_time_days: number;
    required_date_user_override: number;
  }>;

  const updateStmt = db.prepare(
    `UPDATE project_part_lines SET
       required_date = ?,
       order_by_date = ?,
       required_date_user_override = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  );

  let count = 0;
  for (const row of rows) {
    if (options.onlyIfOverride0 && row.required_date_user_override) continue;
    const override = options.resetOverride0 ? 0 : row.required_date_user_override;
    const orderByDate = computeOrderByDate(requiredDate, row.lead_time_days);
    updateStmt.run(requiredDate, orderByDate, override, row.id);
    count += 1;
  }
  return count;
}

/** コピー後など：全行に溶接開始日を設定 */
export function applyWeldingRequiredDateToAllLines(seisanProjectId: string): number {
  const { date } = resolveWeldingStartDate(seisanProjectId);
  return bulkUpdateRequiredDate(seisanProjectId, date, {
    onlyIfOverride0: false,
    resetOverride0: true,
  });
}

export function syncRequiredDatesFromWelding(
  seisanProjectId: string
): SyncRequiredDatesFromWeldingResult {
  const id = (seisanProjectId ?? "").trim();
  if (!id) throw new Error("案件 ID が必要です。");
  const resolved = resolveWeldingStartDate(id);
  const updatedCount = bulkUpdateRequiredDate(id, resolved.date, { onlyIfOverride0: true });
  const currentRaw = readWeldingTaskStartDate(id);
  upsertCache(id, currentRaw, currentRaw);
  return { updatedCount, appliedDate: resolved.date };
}

export function ackWeldingDateChange(seisanProjectId: string): void {
  const id = (seisanProjectId ?? "").trim();
  if (!id) throw new Error("案件 ID が必要です。");
  const currentRaw = readWeldingTaskStartDate(id);
  const cache = getCache(id);
  upsertCache(id, currentRaw, currentRaw ?? cache?.acknowledged_welding_start ?? null);
}

/** §8.5.22 必要着日の基準＝溶接開始日 */

import { todayIsoLocal } from "./partsTracker.js";

/** seed: process_templates.id = 'pt05'（溶接） */
export const WELDING_PROCESS_TEMPLATE_ID_DEFAULT = "pt05";

export const WELDING_PROCESS_TEMPLATE_NAME_DEFAULT = "溶接";

export type WeldingStartDateSource = "welding" | "deadline" | "today";

export const WELDING_START_DATE_SOURCE_LABELS: Record<WeldingStartDateSource, string> = {
  welding: "溶接開始日",
  deadline: "案件納期",
  today: "当日",
};

export interface WeldingStartDateInfo {
  /** 新規行の初期値・一括追随に使う日付 */
  date: string;
  source: WeldingStartDateSource;
  /** 生産ボード溶接タスクの計画 start_date（未取得時 null） */
  weldingTaskStartDate: string | null;
  /** 前回確認済みの溶接 start_date */
  previousCachedDate: string | null;
  /** 溶接 start_date が前回確認値から変わったとき true */
  changed: boolean;
}

export interface SyncRequiredDatesFromWeldingResult {
  updatedCount: number;
  appliedDate: string;
}

export interface WeldingProcessTemplateMapping {
  processTemplateId: string;
  processTemplateName: string;
}

/** 溶接タスク日 → 案件納期 → 当日 */
export function pickWeldingStartDate(input: {
  weldingTaskStartDate: string | null | undefined;
  projectDeadline: string | null | undefined;
  today?: string;
}): { date: string; source: WeldingStartDateSource } {
  const welding = input.weldingTaskStartDate?.trim();
  if (welding) return { date: welding, source: "welding" };
  const deadline = input.projectDeadline?.trim();
  if (deadline) return { date: deadline, source: "deadline" };
  return { date: input.today ?? todayIsoLocal(), source: "today" };
}

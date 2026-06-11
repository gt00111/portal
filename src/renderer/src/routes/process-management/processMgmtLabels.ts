/** 工程管理 UI 表示ラベル（§8.7.11 — DB/API 名は変更しない） */

import type { PmWorkMode } from "@shared/processMgmtParallel.js";

export const PM_UI_WORK_MODE_LABELS: Record<PmWorkMode, string> = {
  sequential: "通常作業",
  parallel: "並行作業",
};

export const PM_UI_PROCESS_TYPE_LABELS: Record<string, string> = {
  solidworks: "SolidWorks工程",
  cadmac: "CADMAC工程",
  general: "一般工程",
};

export function processTypeLabel(processType: string): string {
  return PM_UI_PROCESS_TYPE_LABELS[processType] ?? processType;
}

export const PM_UI_HANDOFF_ACTION = "CADへ受渡し";
export const PM_UI_WORK_MODE_ACTION = "並行設定";
export const PM_UI_SUPPORT_ACTION = "補助担当";

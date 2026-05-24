import { isPartsTrackerOpen } from "@main/db/partsTrackerConnection.js";

export function ensurePartsTracker(): void {
  if (!isPartsTrackerOpen()) {
    throw new Error("部材管理 DB が利用できません。ポータル DB を開き直してください。");
  }
}

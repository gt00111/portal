import { isProcessMgmtOpen } from "@main/db/processMgmtConnection.js";

export function ensureProcessMgmt(): void {
  if (!isProcessMgmtOpen()) {
    throw new Error("工程管理 DB が利用できません。ポータル DB を開き直してください。");
  }
}

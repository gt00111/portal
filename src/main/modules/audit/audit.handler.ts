import type { IpcMain } from "electron";

import type {
  AuditListParams,
  AuditListResult,
} from "@shared/audit.js";
import { fail, ok } from "@shared/ipcResponse.js";

import { assertPortalAdmin } from "@main/auth-guard.js";
import {
  listAuditEntries,
  listDistinctChannels,
  listDistinctUsernames,
} from "@main/audit/audit.repo.js";

function normalize(data: unknown): AuditListParams {
  const obj = (data ?? {}) as Partial<AuditListParams>;
  return {
    fromAt: obj.fromAt ?? null,
    toAt: obj.toAt ?? null,
    username: obj.username ?? null,
    channel: obj.channel ?? null,
    result: obj.result ?? null,
    page: obj.page ?? 1,
    pageSize: obj.pageSize ?? 50,
  };
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("audit:list", async (_event, data: unknown) => {
    try {
      assertPortalAdmin();
      const params = normalize(data);
      return ok<AuditListResult>(listAuditEntries(params));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("audit:listChannels", async () => {
    try {
      assertPortalAdmin();
      return ok<string[]>(listDistinctChannels());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("audit:listUsernames", async () => {
    try {
      assertPortalAdmin();
      return ok<string[]>(listDistinctUsernames());
    } catch (err) {
      return fail(err);
    }
  });
}

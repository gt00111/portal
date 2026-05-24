import type { IpcMain } from "electron";

import { fail, ok } from "@shared/ipcResponse.js";
import type {
  PartSourceType,
  ProjectPartLine,
  ProjectPartLineUpsertInput,
  ProjectPartSummary,
} from "@shared/partsTracker.js";
import type { ResolvedLeadTime } from "@shared/procurementLeadTime.js";

import {
  assertCanViewApp,
  assertCanWriteApp,
  assertLoggedIn,
} from "@main/auth-guard.js";
import { getPartsTrackerDbPath } from "@main/db/partsTrackerConnection.js";
import { ensurePartsTracker } from "@main/parts-tracker-guard.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";
import * as seisanProjects from "@main/seisan/repos/projects.repo.js";

import * as repo from "./parts-tracker.repo.js";

export interface PartsTrackerProjectOption {
  id: string;
  projectNo: string | null;
  projectName: string | null;
  companyName: string;
  deadline: string;
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("parts-tracker:status", async () => {
    try {
      assertLoggedIn();
      const path = getPartsTrackerDbPath();
      return ok<{ connected: boolean; path: string | null }>({
        connected: path !== null,
        path,
      });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("parts-tracker:projectList", async () => {
    try {
      assertCanViewApp("parts-tracker");
      ensureSeisanSatellite();
      const result = seisanProjects.list({
        limit: 500,
        sort_by: "deadline",
        sort_order: "asc",
      });
      const items: PartsTrackerProjectOption[] = result.items.map((p) => ({
        id: p.id,
        projectNo: p.project_no,
        projectName: p.project_name,
        companyName: p.company_name,
        deadline: p.deadline,
      }));
      return ok(items);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "parts-tracker:line:list",
    async (_event, data: { seisanProjectId?: string }) => {
      try {
        assertCanViewApp("parts-tracker");
        ensurePartsTracker();
        const lines = repo.listByProject(data?.seisanProjectId ?? "");
        return ok<ProjectPartLine[]>(lines);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "parts-tracker:line:create",
    async (_event, data: ProjectPartLineUpsertInput) => {
      try {
        assertCanWriteApp("parts-tracker");
        ensurePartsTracker();
        const line = repo.create(data);
        return ok<ProjectPartLine>(line);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "parts-tracker:line:update",
    async (_event, data: { id?: number; input?: Partial<ProjectPartLineUpsertInput> }) => {
      try {
        assertCanWriteApp("parts-tracker");
        ensurePartsTracker();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        const line = repo.update(id, data?.input ?? {});
        return ok<ProjectPartLine>(line);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("parts-tracker:line:delete", async (_event, data: { id?: number }) => {
    try {
      assertCanWriteApp("parts-tracker");
      ensurePartsTracker();
      const id = Number(data?.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
      repo.remove(id);
      return ok<null>(null);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "parts-tracker:summary",
    async (_event, data: { seisanProjectId?: string }) => {
      try {
        assertCanViewApp("parts-tracker");
        ensurePartsTracker();
        const summary = repo.summarizeProject(data?.seisanProjectId ?? "");
        return ok<ProjectPartSummary>(summary);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "parts-tracker:suggestLeadTime",
    async (
      _event,
      data: {
        sourceType?: PartSourceType;
        supplierId?: number | null;
        skuId?: number | null;
        partNumber?: string | null;
      }
    ) => {
      try {
        assertCanViewApp("parts-tracker");
        if (!data?.sourceType) throw new Error("調達区分が必要です。");
        const resolved = repo.suggestLeadTime({
          sourceType: data.sourceType,
          supplierId: data.supplierId,
          skuId: data.skuId,
          partNumber: data.partNumber,
        });
        return ok<ResolvedLeadTime>(resolved);
      } catch (err) {
        return fail(err);
      }
    }
  );
}

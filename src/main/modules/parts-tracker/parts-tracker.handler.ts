import type { IpcMain } from "electron";

import type {
  BomDiffCurrentVsPrevInput,
  BomDiffProductRevInput,
  BomDiffProjectInput,
  BomDiffResult,
} from "@shared/bomDiff.js";
import { fail, ok } from "@shared/ipcResponse.js";
import type {
  PartSourceType,
  ProjectPartLine,
  ProjectPartLineUpsertInput,
  ProjectPartSummary,
  SetArrangedInput,
  SetHiddenInput,
} from "@shared/partsTracker.js";
import type {
  BomCsvImportBatchRow,
  BomCsvImportCommitInput,
  BomCsvImportCommitResult,
} from "@shared/partsTrackerCsvFormat.js";
import { buildBomCsvTemplate, previewBomCsv } from "@shared/partsTrackerCsvFormat.js";
import type {
  ProductBomExpandInput,
  ProductBomExpandPreview,
  ProductBomExpandResult,
} from "@shared/productBom.js";
import type { ResolvedLeadTime } from "@shared/procurementLeadTime.js";

import {
  assertCanViewApp,
  assertCanWriteApp,
  assertLoggedIn,
} from "@main/auth-guard.js";
import { getDb } from "@main/db/connection.js";
import { getPartsTrackerDbPath } from "@main/db/partsTrackerConnection.js";
import { ensurePartsTracker } from "@main/parts-tracker-guard.js";
import { ensureSeisanSatellite } from "@main/seisan-guard.js";
import * as seisanProjects from "@main/seisan/repos/projects.repo.js";
import { getSession } from "@main/session.js";

import * as csvImport from "./bom-csv-import.repo.js";
import * as bomDiff from "./bom-diff.repo.js";
import * as expand from "./product-bom-expand.repo.js";
import * as repo from "./parts-tracker.repo.js";

export interface PartsTrackerProjectOption {
  id: string;
  projectNo: string | null;
  projectName: string | null;
  companyName: string;
  deadline: string;
  partNumber: string | null;
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
        partNumber: p.part_number ?? null,
      }));
      return ok(items);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "parts-tracker:line:list",
    async (_event, data: { seisanProjectId?: string; includeHidden?: boolean }) => {
      try {
        assertCanViewApp("parts-tracker");
        ensurePartsTracker();
        const lines = repo.listByProject(data?.seisanProjectId ?? "", {
          includeHidden: Boolean(data?.includeHidden),
        });
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

  // 5-A-1: 手配済チェック
  ipcMain.handle("parts-tracker:line:setArranged", async (_event, data: SetArrangedInput) => {
    try {
      assertCanWriteApp("parts-tracker");
      ensurePartsTracker();
      const id = Number(data?.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
      const session = getSession();
      const line = repo.setArranged(
        id,
        Boolean(data?.arranged),
        session?.userNameId ?? null,
        session?.username ?? null
      );
      return ok<ProjectPartLine>(line);
    } catch (err) {
      return fail(err);
    }
  });

  // 5-B: 非表示
  ipcMain.handle("parts-tracker:line:setHidden", async (_event, data: SetHiddenInput) => {
    try {
      assertCanWriteApp("parts-tracker");
      ensurePartsTracker();
      const id = Number(data?.id);
      if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
      const session = getSession();
      const line = repo.setHidden(
        id,
        Boolean(data?.hidden),
        data?.reason ?? null,
        session?.username ?? null
      );
      return ok<ProjectPartLine>(line);
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

  // -------- 5-A-1 / 5-E: 製品 BOM 一括展開 --------

  ipcMain.handle(
    "parts-tracker:productBom:match",
    async (_event, data: { partNumber?: string }) => {
      try {
        assertCanViewApp("parts-tracker");
        const pn = (data?.partNumber ?? "").toString();
        return ok(expand.findMatchingProductsByPartNumber(pn));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "parts-tracker:productBom:previewExpand",
    async (_event, data: { productBomId?: number; multiplier?: number }) => {
      try {
        assertCanViewApp("parts-tracker");
        const id = Number(data?.productBomId);
        if (!Number.isFinite(id) || id <= 0) throw new Error("製品 BOM ID が必要です。");
        return ok<ProductBomExpandPreview>(expand.previewExpansion(id, Number(data?.multiplier ?? 1)));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("parts-tracker:productBom:expand", async (_event, data: ProductBomExpandInput) => {
    try {
      assertCanWriteApp("parts-tracker");
      ensurePartsTracker();
      const session = getSession();
      return ok<ProductBomExpandResult>(expand.commitExpansion(data, session?.username ?? null));
    } catch (err) {
      return fail(err);
    }
  });

  // -------- 5-B: BOM CSV 取込 --------

  ipcMain.handle(
    "parts-tracker:import:preview",
    async (_event, data: { csvText?: string }) => {
      try {
        assertCanViewApp("parts-tracker");
        const text = (data?.csvText ?? "").toString();
        if (!text.trim()) throw new Error("CSV テキストが空です。");
        const suppliers = getDb()
          .prepare(`SELECT id, name FROM m_suppliers WHERE isActive = 1`)
          .all() as Array<{ id: number; name: string }>;
        return ok(previewBomCsv({ text, knownSuppliers: suppliers }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "parts-tracker:import:commit",
    async (_event, data: BomCsvImportCommitInput) => {
      try {
        assertCanWriteApp("parts-tracker");
        ensurePartsTracker();
        const session = getSession();
        return ok<BomCsvImportCommitResult>(
          csvImport.commitCsvImport(data, session?.username ?? null)
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("parts-tracker:import:downloadTemplate", async () => {
    try {
      assertCanViewApp("parts-tracker");
      return ok<{ csv: string; fileName: string }>({
        csv: buildBomCsvTemplate(),
        fileName: "parts-tracker-bom-template.csv",
      });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "parts-tracker:import:batches",
    async (_event, data: { seisanProjectId?: string }) => {
      try {
        assertCanViewApp("parts-tracker");
        ensurePartsTracker();
        const id = (data?.seisanProjectId ?? "").toString().trim();
        if (!id) throw new Error("案件 ID が必要です。");
        return ok<BomCsvImportBatchRow[]>(csvImport.listImportBatches(id));
      } catch (err) {
        return fail(err);
      }
    }
  );

  // -------- 5-F: BOM Rev 差分 --------

  ipcMain.handle(
    "parts-tracker:bomDiff:productRev",
    async (_event, data: BomDiffProductRevInput) => {
      try {
        assertCanViewApp("parts-tracker");
        return ok<BomDiffResult>(bomDiff.diffProductRev(data));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "parts-tracker:bomDiff:project",
    async (_event, data: BomDiffProjectInput) => {
      try {
        assertCanViewApp("parts-tracker");
        ensurePartsTracker();
        return ok<BomDiffResult>(bomDiff.diffProjects(data));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "parts-tracker:bomDiff:currentVsLatest",
    async (_event, data: BomDiffCurrentVsPrevInput) => {
      try {
        assertCanViewApp("parts-tracker");
        ensurePartsTracker();
        const res = bomDiff.diffCurrentVsLatest(data);
        return ok<BomDiffResult | null>(res);
      } catch (err) {
        return fail(err);
      }
    }
  );
}

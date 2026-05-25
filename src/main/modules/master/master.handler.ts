import type { IpcMain } from "electron";

import { fail, ok } from "@shared/ipcResponse.js";
import type { MasterRow, MasterUpsertInput } from "@shared/master.js";

import { appendAuditEntry } from "@main/audit/audit.repo.js";
import { assertLoggedIn, assertPortalAdmin } from "@main/auth-guard.js";

import type {
  ProcurementLeadTimeRow,
  ProcurementLeadTimeUpsertInput,
  ResolveLeadTimeInput,
  ResolvedLeadTime,
} from "@shared/procurementLeadTime.js";
import type {
  ProductBomLineRow,
  ProductBomLineUpsertInput,
  ProductBomRow,
  ProductBomUpsertInput,
  ProductRow,
  ProductUpsertInput,
} from "@shared/productBom.js";

import { getSession } from "@main/session.js";

import { insert, listAll, remove, update } from "./master.repo.js";
import * as leadTimes from "./procurement-lead-time.repo.js";
import * as productBom from "./product-bom.repo.js";

function normalizeInput(data: unknown): MasterUpsertInput {
  const obj = (data ?? {}) as Partial<MasterUpsertInput>;
  const code = (obj.code ?? "").toString().trim();
  const name = (obj.name ?? "").toString().trim();
  if (!code) throw new Error("コードは必須です。");
  if (!name) throw new Error("名称は必須です。");
  const scopeRaw = obj.scope == null ? null : obj.scope.toString().trim();
  return {
    code,
    name,
    note: obj.note?.toString() ?? null,
    isActive: obj.isActive !== false,
    scope: scopeRaw && scopeRaw.length > 0 ? scopeRaw : null,
  };
}

function pickScope(value: unknown): string | null {
  if (value == null) return null;
  const s = value.toString().trim();
  return s.length > 0 ? s : null;
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle(
    "master:list",
    async (_event, data: { table: string; scope?: string | null }) => {
      try {
        assertLoggedIn();
        return ok<MasterRow[]>(listAll(data?.table, pickScope(data?.scope)));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:create",
    async (_event, data: { table: string; input: MasterUpsertInput }) => {
      try {
        assertPortalAdmin();
        const row = insert(data?.table, normalizeInput(data?.input));
        appendAuditEntry({
          channel: "master:create",
          action: "create",
          result: "ok",
          targetType: data?.table ?? "master",
          targetId: row.id,
          detail: { code: row.code, name: row.name, scope: row.scope ?? null },
        });
        return ok<MasterRow>(row);
      } catch (err) {
        appendAuditEntry({
          channel: "master:create",
          action: "create",
          result: "fail",
          targetType: data?.table ?? "master",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:update",
    async (
      _event,
      data: { table: string; id: number; input: MasterUpsertInput }
    ) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        const row = update(data?.table, id, normalizeInput(data?.input));
        appendAuditEntry({
          channel: "master:update",
          action: "update",
          result: "ok",
          targetType: data?.table ?? "master",
          targetId: id,
          detail: { code: row.code, name: row.name, scope: row.scope ?? null },
        });
        return ok<MasterRow>(row);
      } catch (err) {
        appendAuditEntry({
          channel: "master:update",
          action: "update",
          result: "fail",
          targetType: data?.table ?? "master",
          targetId: data?.id ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:delete",
    async (_event, data: { table: string; id: number }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        remove(data?.table, id);
        appendAuditEntry({
          channel: "master:delete",
          action: "delete",
          result: "ok",
          targetType: data?.table ?? "master",
          targetId: id,
        });
        return ok<null>(null);
      } catch (err) {
        appendAuditEntry({
          channel: "master:delete",
          action: "delete",
          result: "fail",
          targetType: data?.table ?? "master",
          targetId: data?.id ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle("master:procurementLeadTime:list", async () => {
    try {
      assertLoggedIn();
      return ok<ProcurementLeadTimeRow[]>(leadTimes.listAll());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "master:procurementLeadTime:create",
    async (_event, data: ProcurementLeadTimeUpsertInput) => {
      try {
        assertPortalAdmin();
        const row = leadTimes.insert(data);
        appendAuditEntry({
          channel: "master:procurementLeadTime:create",
          action: "create",
          result: "ok",
          targetType: "m_procurement_lead_times",
          targetId: row.id,
        });
        return ok<ProcurementLeadTimeRow>(row);
      } catch (err) {
        appendAuditEntry({
          channel: "master:procurementLeadTime:create",
          action: "create",
          result: "fail",
          targetType: "m_procurement_lead_times",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:procurementLeadTime:update",
    async (_event, data: { id?: number; input?: ProcurementLeadTimeUpsertInput }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        if (!data?.input) throw new Error("更新内容が必要です。");
        const row = leadTimes.update(id, data.input);
        appendAuditEntry({
          channel: "master:procurementLeadTime:update",
          action: "update",
          result: "ok",
          targetType: "m_procurement_lead_times",
          targetId: id,
        });
        return ok<ProcurementLeadTimeRow>(row);
      } catch (err) {
        appendAuditEntry({
          channel: "master:procurementLeadTime:update",
          action: "update",
          result: "fail",
          targetType: "m_procurement_lead_times",
          targetId: data?.id ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:procurementLeadTime:delete",
    async (_event, data: { id?: number }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        leadTimes.remove(id);
        appendAuditEntry({
          channel: "master:procurementLeadTime:delete",
          action: "delete",
          result: "ok",
          targetType: "m_procurement_lead_times",
          targetId: id,
        });
        return ok<null>(null);
      } catch (err) {
        appendAuditEntry({
          channel: "master:procurementLeadTime:delete",
          action: "delete",
          result: "fail",
          targetType: "m_procurement_lead_times",
          targetId: data?.id ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:procurementLeadTime:resolve",
    async (_event, data: ResolveLeadTimeInput) => {
      try {
        assertLoggedIn();
        return ok<ResolvedLeadTime>(leadTimes.resolveLeadTime(data));
      } catch (err) {
        return fail(err);
      }
    }
  );

  // -------- master:productBom:* （5-A-1 / 5-E 統合・親番テンプレート兼用） --------

  ipcMain.handle("master:productBom:listProducts", async () => {
    try {
      assertLoggedIn();
      return ok<ProductRow[]>(productBom.listProducts());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "master:productBom:createProduct",
    async (_event, data: ProductUpsertInput) => {
      try {
        assertPortalAdmin();
        const row = productBom.insertProduct(data);
        appendAuditEntry({
          channel: "master:productBom:createProduct",
          action: "create",
          result: "ok",
          targetType: "m_products",
          targetId: row.id,
        });
        return ok<ProductRow>(row);
      } catch (err) {
        appendAuditEntry({
          channel: "master:productBom:createProduct",
          action: "create",
          result: "fail",
          targetType: "m_products",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:productBom:updateProduct",
    async (_event, data: { id?: number; input?: ProductUpsertInput }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        if (!data?.input) throw new Error("更新内容が必要です。");
        const row = productBom.updateProduct(id, data.input);
        appendAuditEntry({
          channel: "master:productBom:updateProduct",
          action: "update",
          result: "ok",
          targetType: "m_products",
          targetId: id,
        });
        return ok<ProductRow>(row);
      } catch (err) {
        appendAuditEntry({
          channel: "master:productBom:updateProduct",
          action: "update",
          result: "fail",
          targetType: "m_products",
          targetId: data?.id ?? null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:productBom:deleteProduct",
    async (_event, data: { id?: number }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        productBom.removeProduct(id);
        appendAuditEntry({
          channel: "master:productBom:deleteProduct",
          action: "delete",
          result: "ok",
          targetType: "m_products",
          targetId: id,
        });
        return ok<null>(null);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:productBom:listBomsByProduct",
    async (_event, data: { productId?: number }) => {
      try {
        assertLoggedIn();
        const id = Number(data?.productId);
        if (!Number.isFinite(id) || id <= 0) throw new Error("製品 ID が必要です。");
        return ok<ProductBomRow[]>(productBom.listBomsByProduct(id));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:productBom:createBom",
    async (_event, data: ProductBomUpsertInput) => {
      try {
        assertPortalAdmin();
        const row = productBom.insertBom(data);
        appendAuditEntry({
          channel: "master:productBom:createBom",
          action: "create",
          result: "ok",
          targetType: "m_product_boms",
          targetId: row.id,
        });
        return ok<ProductBomRow>(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:productBom:updateBom",
    async (_event, data: { id?: number; input?: ProductBomUpsertInput }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        if (!data?.input) throw new Error("更新内容が必要です。");
        const row = productBom.updateBom(id, data.input);
        appendAuditEntry({
          channel: "master:productBom:updateBom",
          action: "update",
          result: "ok",
          targetType: "m_product_boms",
          targetId: id,
        });
        return ok<ProductBomRow>(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:productBom:releaseBom",
    async (_event, data: { id?: number }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        const session = getSession();
        const row = productBom.releaseBom(id, session?.username ?? null);
        appendAuditEntry({
          channel: "master:productBom:releaseBom",
          action: "update",
          result: "ok",
          targetType: "m_product_boms",
          targetId: id,
        });
        return ok<ProductBomRow>(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:productBom:cloneBom",
    async (_event, data: { sourceId?: number; newRevision?: string }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.sourceId);
        const rev = (data?.newRevision ?? "").toString().trim();
        if (!Number.isFinite(id) || id <= 0) throw new Error("コピー元 Rev ID が不正です。");
        if (!rev) throw new Error("新 Rev を指定してください。");
        const row = productBom.cloneBom(id, rev);
        return ok<ProductBomRow>(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:productBom:deleteBom",
    async (_event, data: { id?: number }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        productBom.removeBom(id);
        return ok<null>(null);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:productBom:listLines",
    async (_event, data: { productBomId?: number }) => {
      try {
        assertLoggedIn();
        const id = Number(data?.productBomId);
        if (!Number.isFinite(id) || id <= 0) throw new Error("製品 BOM ID が必要です。");
        return ok<ProductBomLineRow[]>(productBom.listBomLinesByBom(id));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:productBom:createLine",
    async (_event, data: ProductBomLineUpsertInput) => {
      try {
        assertPortalAdmin();
        const row = productBom.insertBomLine(data);
        return ok<ProductBomLineRow>(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:productBom:updateLine",
    async (_event, data: { id?: number; input?: ProductBomLineUpsertInput }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        if (!data?.input) throw new Error("更新内容が必要です。");
        const row = productBom.updateBomLine(id, data.input);
        return ok<ProductBomLineRow>(row);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    "master:productBom:deleteLine",
    async (_event, data: { id?: number }) => {
      try {
        assertPortalAdmin();
        const id = Number(data?.id);
        if (!Number.isFinite(id) || id <= 0) throw new Error("不正な ID です。");
        productBom.removeBomLine(id);
        return ok<null>(null);
      } catch (err) {
        return fail(err);
      }
    }
  );
}

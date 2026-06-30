import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import { app, BrowserWindow, dialog, type IpcMain } from "electron";

import {
  DB_FILE_NAME,
  DEFAULT_COMPANY_NAME,
  DEFAULT_MOTTOS,
  SETTINGS_KEYS,
} from "@shared/constants.js";
import { fail, ok } from "@shared/ipcResponse.js";
import type { BootstrapStage, CompanyInfo, SettingsSnapshot } from "@shared/types.js";

import { appendAuditEntry } from "@main/audit/audit.repo.js";
import { assertPortalAdmin } from "@main/auth-guard.js";
import { closeDatabase, getDbPath, isOpen, openDatabase } from "@main/db/connection.js";
import { resolveStoredPath } from "@main/db/dataRoot.js";
import { importHeroBackground } from "@main/db/portalAssets.js";
import { getPortalWindow } from "@main/window.js";

import { countOperators, getSetting, putSetting } from "./settings.repo.js";

const DB_PATH_STORE_FILE = "portal-config.json";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("settings:get", async () => {
    try {
      const dbPath = getDbPath();
      const snapshot = buildSnapshot(dbPath);
      return ok<SettingsSnapshot>(snapshot);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("settings:pickExistingDatabase", async () => {
    try {
      const parent = BrowserWindow.getFocusedWindow() ?? getPortalWindow() ?? undefined;
      const result = parent
        ? await dialog.showOpenDialog(parent, {
            title: "既存のポータル DB を選択",
            properties: ["openFile"],
            filters: [{ name: "SQLite", extensions: ["db", "sqlite"] }],
          })
        : await dialog.showOpenDialog({
            title: "既存のポータル DB を選択",
            properties: ["openFile"],
            filters: [{ name: "SQLite", extensions: ["db", "sqlite"] }],
          });
      if (result.canceled || result.filePaths.length === 0) {
        return ok<SettingsSnapshot>(buildSnapshot(getDbPath()));
      }
      const path = result.filePaths[0];
      await openDatabase(path, { createIfMissing: false });
      persistDbPath(path);
      return ok<SettingsSnapshot>(buildSnapshot(path));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("settings:createNewDatabase", async (_event, data: { dir?: string | null } = {}) => {
    try {
      let targetDir = data?.dir ?? null;
      if (!targetDir) {
        const parent = BrowserWindow.getFocusedWindow() ?? getPortalWindow() ?? undefined;
        const result = parent
          ? await dialog.showOpenDialog(parent, {
              title: "新規ポータル DB を作成するフォルダを選択",
              properties: ["openDirectory", "createDirectory"],
            })
          : await dialog.showOpenDialog({
              title: "新規ポータル DB を作成するフォルダを選択",
              properties: ["openDirectory", "createDirectory"],
            });
        if (result.canceled || result.filePaths.length === 0) {
          return ok<SettingsSnapshot>(buildSnapshot(getDbPath()));
        }
        targetDir = result.filePaths[0];
      }
      const path = join(targetDir, DB_FILE_NAME);
      await openDatabase(path, { createIfMissing: true });
      persistDbPath(path);
      return ok<SettingsSnapshot>(buildSnapshot(path));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("settings:closeDatabase", async () => {
    try {
      closeDatabase();
      return ok<SettingsSnapshot>(buildSnapshot(null));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("settings:pickHomeLpImage", async () => {
    try {
      assertPortalAdmin();
      const parent = BrowserWindow.getFocusedWindow() ?? getPortalWindow() ?? undefined;
      const filters = [
        { name: "画像", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] },
        { name: "すべて", extensions: ["*"] },
      ];
      const result = parent
        ? await dialog.showOpenDialog(parent, {
            title: "ホーム背景画像を選択",
            properties: ["openFile"],
            filters,
          })
        : await dialog.showOpenDialog({
            title: "ホーム背景画像を選択",
            properties: ["openFile"],
            filters,
          });
      if (result.canceled || result.filePaths.length === 0) {
        return ok<{ path: string | null }>({ path: null });
      }
      return ok<{ path: string | null }>({ path: result.filePaths[0] });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "settings:updateCompanyInfo",
    async (_event, data: Partial<CompanyInfo>) => {
      try {
        assertPortalAdmin();
        if (typeof data?.companyName === "string") {
          putSetting(SETTINGS_KEYS.companyName, data.companyName.trim() || DEFAULT_COMPANY_NAME);
        }
        if (Array.isArray(data?.mottos)) {
          const cleaned = data.mottos.map((m) => String(m ?? "").trim()).filter((m) => m.length > 0);
          putSetting(
            SETTINGS_KEYS.mottos,
            JSON.stringify(cleaned.length > 0 ? cleaned : DEFAULT_MOTTOS)
          );
        }
        if (data.homeHeroBackgroundPath !== undefined) {
          const raw = data.homeHeroBackgroundPath?.trim() ?? "";
          if (!raw) {
            putSetting(SETTINGS_KEYS.homeHeroBackgroundPath, "");
          } else if (isAbsolute(raw)) {
            const relative = await importHeroBackground(raw);
            putSetting(SETTINGS_KEYS.homeHeroBackgroundPath, relative);
          } else {
            putSetting(SETTINGS_KEYS.homeHeroBackgroundPath, raw.replace(/\\/g, "/"));
          }
        }
        appendAuditEntry({
          channel: "settings:updateCompanyInfo",
          action: "update",
          result: "ok",
          targetType: "settings",
          detail: {
            companyName: data?.companyName ?? null,
            mottosCount: Array.isArray(data?.mottos) ? data.mottos.length : null,
            homeHeroBackgroundPath: data?.homeHeroBackgroundPath ?? null,
          },
        });
        return ok<SettingsSnapshot>(buildSnapshot(getDbPath()));
      } catch (err) {
        appendAuditEntry({
          channel: "settings:updateCompanyInfo",
          action: "update",
          result: "fail",
          targetType: "settings",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  void tryRestoreDbPath();
}

function buildSnapshot(dbPath: string | null): SettingsSnapshot {
  if (!isOpen() || !dbPath) {
    return {
      dbPath,
      bootstrapped: false,
      stage: "db_unset",
      company: {
        companyName: DEFAULT_COMPANY_NAME,
        mottos: [...DEFAULT_MOTTOS],
        homeHeroBackgroundPath: null,
        homeHeroBackgroundFileUrl: null,
      },
    };
  }
  const bootstrapped = getSetting(SETTINGS_KEYS.bootstrapped) === "1";
  const operatorCount = countOperators();
  const stage: BootstrapStage = !bootstrapped
    ? "db_ready"
    : operatorCount === 0
      ? "no_operators"
      : "ready";
  return {
    dbPath,
    bootstrapped,
    stage,
    company: buildCompanySnapshot(),
  };
}

function buildCompanySnapshot(): CompanyInfo {
  const heroPath = readStoredImagePath(SETTINGS_KEYS.homeHeroBackgroundPath);
  return {
    companyName: getSetting(SETTINGS_KEYS.companyName) ?? DEFAULT_COMPANY_NAME,
    mottos: readMottos(),
    homeHeroBackgroundPath: heroPath,
    homeHeroBackgroundFileUrl: resolveLocalImageFileUrl(heroPath),
  };
}

function readStoredImagePath(key: string): string | null {
  const raw = getSetting(key);
  const t = raw?.trim();
  return t && t.length > 0 ? t : null;
}

function resolveLocalImageFileUrl(storedPath: string | null): string | null {
  if (!storedPath) return null;
  try {
    const abs = resolveStoredPath(storedPath);
    if (!existsSync(abs)) return null;
    return pathToFileURL(abs).href;
  } catch {
    return null;
  }
}

function readMottos(): string[] {
  const raw = getSetting(SETTINGS_KEYS.mottos);
  if (!raw) return [...DEFAULT_MOTTOS];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed;
    }
  } catch {
    // noop
  }
  return [...DEFAULT_MOTTOS];
}

function configFilePath(): string {
  return join(app.getPath("userData"), DB_PATH_STORE_FILE);
}

async function tryRestoreDbPath(): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(configFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as { dbPath?: string };
    if (parsed.dbPath) {
      await openDatabase(parsed.dbPath, { createIfMissing: false });
    }
  } catch {
    // 初回起動や破損時は無視する（Bootstrap 画面が DB 作成を案内する）
  }
}

async function persistDbPath(dbPath: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(
    configFilePath(),
    JSON.stringify({ dbPath }, null, 2),
    "utf-8"
  );
}

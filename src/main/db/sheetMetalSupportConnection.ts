import { dirname, join } from "node:path";

import Database from "better-sqlite3";

import { SHEET_METAL_SUPPORT_DB_FILE_NAME } from "@shared/constants.js";

import { initSheetMetalSupportSchema } from "./sheetMetalSupportSchema.js";

let smsDb: Database.Database | null = null;
let smsPath: string | null = null;

export function getSheetMetalSupportDb(): Database.Database {
  if (!smsDb) {
    throw new Error("板金製造支援 DB が開かれていません。");
  }
  return smsDb;
}

export function getSheetMetalSupportDbPath(): string | null {
  return smsPath;
}

export function isSheetMetalSupportOpen(): boolean {
  return smsDb !== null;
}

export function openSheetMetalSupportDatabaseFile(dbPath: string): void {
  if (smsDb && smsPath === dbPath) {
    return;
  }
  if (smsDb) {
    smsDb.close();
    smsDb = null;
    smsPath = null;
  }
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  smsDb = instance;
  smsPath = dbPath;
  initSheetMetalSupportSchema(instance);
}

export function openSheetMetalSupportAdjacentToCentral(centralDbPath: string): void {
  openSheetMetalSupportDatabaseFile(
    join(dirname(centralDbPath), SHEET_METAL_SUPPORT_DB_FILE_NAME)
  );
}

export function closeSheetMetalSupport(): void {
  if (smsDb) {
    smsDb.close();
    smsDb = null;
    smsPath = null;
  }
}

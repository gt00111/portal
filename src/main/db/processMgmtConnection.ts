import { dirname, join } from "node:path";

import Database from "better-sqlite3";

import { initProcessMgmtSchema } from "./processMgmtSchema.js";

let pm: Database.Database | null = null;
let pmPath: string | null = null;

export function getProcessMgmtDb(): Database.Database {
  if (!pm) {
    throw new Error("工程管理 DB が開かれていません。");
  }
  return pm;
}

export function getProcessMgmtDbPath(): string | null {
  return pmPath;
}

export function isProcessMgmtOpen(): boolean {
  return pm !== null;
}

export function openProcessMgmtDatabaseFile(dbPath: string): void {
  if (pm && pmPath === dbPath) {
    return;
  }
  if (pm) {
    pm.close();
    pm = null;
    pmPath = null;
  }
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  pm = instance;
  pmPath = dbPath;
  initProcessMgmtSchema(instance);
}

export function openProcessMgmtAdjacentToCentral(centralDbPath: string): void {
  openProcessMgmtDatabaseFile(join(dirname(centralDbPath), "process-management.db"));
}

export function closeProcessMgmt(): void {
  if (pm) {
    pm.close();
    pm = null;
    pmPath = null;
  }
}

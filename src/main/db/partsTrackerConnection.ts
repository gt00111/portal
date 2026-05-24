import { dirname, join } from "node:path";

import Database from "better-sqlite3";

import { initPartsTrackerSchema } from "./partsTrackerSchema.js";

let pt: Database.Database | null = null;
let ptPath: string | null = null;

export function getPartsTrackerDb(): Database.Database {
  if (!pt) {
    throw new Error("部材管理 DB が開かれていません。");
  }
  return pt;
}

export function getPartsTrackerDbPath(): string | null {
  return ptPath;
}

export function isPartsTrackerOpen(): boolean {
  return pt !== null;
}

export function openPartsTrackerDatabaseFile(dbPath: string): void {
  if (pt && ptPath === dbPath) {
    return;
  }
  if (pt) {
    pt.close();
    pt = null;
    ptPath = null;
  }
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  pt = instance;
  ptPath = dbPath;
  initPartsTrackerSchema(instance);
}

export function openPartsTrackerAdjacentToCentral(centralDbPath: string): void {
  openPartsTrackerDatabaseFile(join(dirname(centralDbPath), "parts-tracker.db"));
}

export function closePartsTracker(): void {
  if (pt) {
    pt.close();
    pt = null;
    ptPath = null;
  }
}

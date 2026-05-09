import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { closeDrawingLibrary, openDrawingLibraryAdjacentToCentral } from "./drawingLibraryConnection.js";
import { closeProcessMgmt, openProcessMgmtAdjacentToCentral } from "./processMgmtConnection.js";
import { closeSeisanSatellite, openSeisanForCurrentCentral } from "./seisanConnection.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";

let db: Database.Database | null = null;
let currentPath: string | null = null;

export function isOpen(): boolean {
  return db !== null;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("データベースが開かれていません。");
  }
  return db;
}

export function getDbPath(): string | null {
  return currentPath;
}

export async function openDatabase(filePath: string, options: { createIfMissing: boolean }): Promise<void> {
  if (db) {
    db.close();
    db = null;
    currentPath = null;
  }
  const existed = existsSync(filePath);
  if (!existed && !options.createIfMissing) {
    throw new Error(`指定された DB が見つかりません: ${filePath}`);
  }
  if (!existed) {
    mkdirSync(dirname(filePath), { recursive: true });
  }
  const instance = new Database(filePath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  db = instance;
  currentPath = filePath;
  migrate(instance);
  await seed(instance);
  openSeisanForCurrentCentral(filePath);
  openDrawingLibraryAdjacentToCentral(filePath);
  openProcessMgmtAdjacentToCentral(filePath);
}

export function closeDatabase(): void {
  closeDrawingLibrary();
  closeProcessMgmt();
  closeSeisanSatellite();
  if (db) {
    db.close();
    db = null;
    currentPath = null;
  }
}

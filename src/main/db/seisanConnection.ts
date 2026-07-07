import { join, dirname } from "node:path";

import Database from "better-sqlite3";

import { initSeisanSchema } from "./seisanSchema.js";
import { getDefaultSeisanBoardDbPath } from "./seisanBoardPath.js";
import { ensureFormatXlsxSeeded } from "./formatXlsxPath.js";

let sat: Database.Database | null = null;
let satPath: string | null = null;

export function getSeisanDb(): Database.Database {
  if (!sat) {
    throw new Error("生産ボード DB が開かれていません。");
  }
  return sat;
}

export function getSeisanDbPath(): string | null {
  return satPath;
}

export function isSeisanSatelliteOpen(): boolean {
  return sat !== null;
}

export function openSeisanDatabaseFile(dbPath: string): void {
  if (sat && satPath === dbPath) {
    return;
  }
  if (sat) {
    sat.close();
    sat = null;
    satPath = null;
  }
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  sat = instance;
  satPath = dbPath;
  initSeisanSchema(instance);
}

export function openSeisanSatelliteAdjacentToCentral(centralDbPath: string): void {
  openSeisanDatabaseFile(join(dirname(centralDbPath), "seisan-board.db"));
}

/** 中央 DB 起動直後: データ根配下の seisan-board.db を開く（共有運用） */
export function openSeisanForCurrentCentral(_centralDbPath: string): void {
  openSeisanDatabaseFile(getDefaultSeisanBoardDbPath());
  ensureFormatXlsxSeeded();
}

export function closeSeisanSatellite(): void {
  if (sat) {
    sat.close();
    sat = null;
    satPath = null;
  }
}

import { dirname, join } from "node:path";

import Database from "better-sqlite3";

import { initDrawingLibrarySchema } from "./drawingLibrarySchema.js";

let lib: Database.Database | null = null;
let libPath: string | null = null;

export function getDrawingLibraryDb(): Database.Database {
  if (!lib) {
    throw new Error("図面ライブラリ DB が開かれていません。");
  }
  return lib;
}

export function getDrawingLibraryDbPath(): string | null {
  return libPath;
}

/** 図面ファイル（PDF/DXF 等）のルート: DB ファイルと同じディレクトリ */
export function getDrawingLibraryDataDir(): string {
  if (!libPath) {
    throw new Error("図面ライブラリ DB パスが無効です。");
  }
  return dirname(libPath);
}

export function isDrawingLibraryOpen(): boolean {
  return lib !== null;
}

export function openDrawingLibraryDatabaseFile(dbPath: string): void {
  if (lib && libPath === dbPath) {
    return;
  }
  if (lib) {
    lib.close();
    lib = null;
    libPath = null;
  }
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  lib = instance;
  libPath = dbPath;
  initDrawingLibrarySchema(instance);
}

export function openDrawingLibraryAdjacentToCentral(centralDbPath: string): void {
  openDrawingLibraryDatabaseFile(join(dirname(centralDbPath), "drawing-library.db"));
}

export function closeDrawingLibrary(): void {
  if (lib) {
    lib.close();
    lib = null;
    libPath = null;
  }
}

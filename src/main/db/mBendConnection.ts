import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { M_BEND_DB_FILE_NAME } from "@shared/constants.js";
import { initMBendSchema } from "./mBendSchema.js";

let db: Database.Database | null = null;
let dbPath: string | null = null;

export function getMBendDb(): Database.Database {
  if (!db) throw new Error("M-BEND DBが開かれていません。");
  return db;
}
export function getMBendDbPath(): string | null { return dbPath; }
export function openMBendAdjacentToCentral(centralDbPath: string): void {
  const nextPath = join(dirname(centralDbPath), M_BEND_DB_FILE_NAME);
  if (db && dbPath === nextPath) return;
  const candidate = new Database(nextPath);
  try {
    candidate.pragma("journal_mode = WAL");
    candidate.pragma("foreign_keys = ON");
    initMBendSchema(candidate);
  } catch (err) {
    candidate.close();
    throw err;
  }
  closeMBend();
  db = candidate;
  dbPath = nextPath;
}
export function closeMBend(): void {
  db?.close(); db = null; dbPath = null;
}

import type Database from "better-sqlite3";

import { DEFAULT_COMPANY_NAME, DEFAULT_MOTTOS, SETTINGS_KEYS } from "@shared/constants.js";

import {
  ensureMasterUserForUsername,
  seedDefaultGrantsForUser,
} from "@main/db/userAccessQueries.js";
import { hashPassword } from "../password.js";

export async function seed(db: Database.Database): Promise<void> {
  ensureDefaultSetting(db, SETTINGS_KEYS.companyName, DEFAULT_COMPANY_NAME);
  ensureDefaultSetting(db, SETTINGS_KEYS.mottos, JSON.stringify(DEFAULT_MOTTOS));

  const bootstrapped = readSetting(db, SETTINGS_KEYS.bootstrapped);
  const operatorCount = (db.prepare("SELECT COUNT(*) AS c FROM app_operators").get() as {
    c: number;
  }).c;

  if (bootstrapped === null && operatorCount === 0) {
    const passwordHash = await hashPassword("admin");
    const userNameId = ensureMasterUserForUsername("admin");
    db.prepare(
      `INSERT INTO app_operators
         (username, passwordHash, role, processView, userNameId, isActive, mustChangePassword)
       VALUES (?, ?, 'admin', 'both', ?, 1, 1)`
    ).run("admin", passwordHash, userNameId);
    seedDefaultGrantsForUser(userNameId, "admin", "both");
    db.prepare(
      `INSERT OR REPLACE INTO app_settings (key, value, updatedAt)
       VALUES (?, '1', datetime('now'))`
    ).run(SETTINGS_KEYS.bootstrapped);
  }
}

function ensureDefaultSetting(db: Database.Database, key: string, value: string): void {
  const existing = readSetting(db, key);
  if (existing !== null) return;
  db.prepare(
    `INSERT INTO app_settings (key, value, updatedAt) VALUES (?, ?, datetime('now'))`
  ).run(key, value);
}

function readSetting(db: Database.Database, key: string): string | null {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

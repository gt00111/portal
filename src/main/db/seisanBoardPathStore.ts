import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { app } from "electron";

type StoreShape = { overridePath: string | null };

function filePath(): string {
  return join(app.getPath("userData"), "seisan-board-override.json");
}

function readStore(): StoreShape {
  const p = filePath();
  if (!existsSync(p)) {
    return { overridePath: null };
  }
  try {
    const raw = readFileSync(p, "utf-8");
    const j = JSON.parse(raw) as Partial<StoreShape>;
    if (typeof j.overridePath === "string" && j.overridePath.trim()) {
      return { overridePath: j.overridePath.trim() };
    }
    return { overridePath: null };
  } catch {
    return { overridePath: null };
  }
}

export function getSeisanBoardOverridePath(): string | null {
  const v = readStore().overridePath;
  return v?.trim() ? v.trim() : null;
}

export function setSeisanBoardOverridePath(path: string | null): void {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  const value = path?.trim() ? path.trim() : null;
  writeFileSync(filePath(), JSON.stringify({ overridePath: value }, null, 2), "utf-8");
}

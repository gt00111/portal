import { APP_CATALOG } from "@shared/constants.js";
import type { AppDescriptor } from "@shared/types.js";

export function listAppCatalog(): AppDescriptor[] {
  return APP_CATALOG.map((entry) => ({ ...entry }));
}

export function findApp(appId: string): AppDescriptor | null {
  const found = APP_CATALOG.find((a) => a.id === appId);
  return found ? { ...found } : null;
}

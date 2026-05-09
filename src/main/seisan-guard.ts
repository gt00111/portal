import { getDbPath } from "@main/db/connection.js";
import { getSeisanDb, openSeisanForCurrentCentral } from "@main/db/seisanConnection.js";

export function ensureSeisanSatellite(): void {
  const central = getDbPath();
  if (!central) {
    throw new Error("中央データベースが開かれていません。");
  }
  openSeisanForCurrentCentral(central);
}

export function assertSeisanSatellite(): ReturnType<typeof getSeisanDb> {
  ensureSeisanSatellite();
  return getSeisanDb();
}

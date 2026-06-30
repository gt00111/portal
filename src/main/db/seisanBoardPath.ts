import { join } from "node:path";

import { SEISAN_BOARD_DB_FILE_NAME } from "@shared/constants.js";

import { getDataRoot } from "./dataRoot.js";

/** 共有データフォルダ上の生産ボード DB パス（中央 DB と同じフォルダ） */
export function getDefaultSeisanBoardDbPath(): string {
  return join(getDataRoot(), SEISAN_BOARD_DB_FILE_NAME);
}

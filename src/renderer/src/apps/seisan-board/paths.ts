/** ポータル内での生産ボードのルートプレフィックス（HashRouter の pathname） */
export const SEISAN_BOARD_BASE = "/apps/seisan-board";

export function seisanPath(relative: string): string {
  if (!relative || relative === "/") {
    return SEISAN_BOARD_BASE;
  }
  const trimmed = relative.startsWith("/") ? relative.slice(1) : relative;
  return `${SEISAN_BOARD_BASE}/${trimmed}`;
}

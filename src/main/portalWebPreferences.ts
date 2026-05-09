import type { WebPreferences } from "electron";

import { getPreloadScriptPath } from "@main/appPaths.js";

/**
 * Portal のレンダラー用。preload + contextIsolation は維持しつつ、
 * sandbox: true だと Windows 等で contextBridge が届かず window.api が空になる事例があるためオフにする。
 */
export function createPortalRendererWebPreferences(): WebPreferences {
  return {
    preload: getPreloadScriptPath(),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  };
}

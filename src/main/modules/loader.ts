import type { IpcMain } from "electron";

type HandlerModule = { register?: (ipcMain: IpcMain) => void };

const handlers = import.meta.glob<HandlerModule>("./*/*.handler.ts", { eager: true });

export function loadModules(ipcMain: IpcMain): void {
  for (const [path, mod] of Object.entries(handlers)) {
    if (typeof mod.register === "function") {
      mod.register(ipcMain);
    } else {
      console.warn(`[loader] ${path} does not export register()`);
    }
  }
}

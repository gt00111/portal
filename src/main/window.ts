import { BrowserWindow, shell } from "electron";

import { getPreloadScriptPath, getRendererIndexHtmlPath } from "@main/appPaths.js";
import { createPortalRendererWebPreferences } from "@main/portalWebPreferences.js";

let portalWindow: BrowserWindow | null = null;

function logWhetherRendererSeesApiBridge(win: BrowserWindow): void {
  win.webContents.once("did-finish-load", () => {
    void win.webContents
      .executeJavaScript(
        "window != null && window.api != null && typeof window.api.invoke === \"function\""
      )
      .then((ok: unknown) => {
        // eslint-disable-next-line no-console
        console.info(`[main] renderer sees window.api.invoke: ${String(ok === true)}`);
        if (ok !== true) {
          // eslint-disable-next-line no-console
          console.error(
            "[main] preload bridge missing from renderer. Check terminal for [preload] or [main] preload-error (preload logs are not shown in the F12 console)."
          );
        }
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[main] window.api probe executeJavaScript failed", err);
      });
  });
}

export function createPortalWindow(): BrowserWindow {
  const preloadPath = getPreloadScriptPath();
  // eslint-disable-next-line no-console
  console.info(`[main] preload path = ${preloadPath}`);

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0b0d12",
    autoHideMenuBar: true,
    show: false,
    webPreferences: createPortalRendererWebPreferences(),
  });

  logWhetherRendererSeesApiBridge(win);

  win.webContents.on("preload-error", (_event, path, error) => {
    // eslint-disable-next-line no-console
    console.error(`[main] preload-error path=${path}`, error);
  });

  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(getRendererIndexHtmlPath());
  }

  win.on("closed", () => {
    if (portalWindow === win) portalWindow = null;
  });

  portalWindow = win;
  return win;
}

export function getPortalWindow(): BrowserWindow | null {
  return portalWindow;
}

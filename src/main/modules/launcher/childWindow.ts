import { pathToFileURL } from "node:url";

import { BrowserWindow, shell } from "electron";

import type { AppDescriptor } from "@shared/types.js";
import { getRendererIndexHtmlPath } from "@main/appPaths.js";
import { createPortalRendererWebPreferences } from "@main/portalWebPreferences.js";

const childWindows = new Map<string, BrowserWindow>();

export function openInternalAppWindow(descriptor: AppDescriptor): BrowserWindow {
  const existing = childWindows.get(descriptor.id);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return existing;
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    title: descriptor.displayName,
    backgroundColor: "#0b0d12",
    autoHideMenuBar: true,
    show: false,
    webPreferences: createPortalRendererWebPreferences(),
  });

  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const targetUrl = buildAppUrl(descriptor.id);
  void win.loadURL(targetUrl);

  if (!process.env["ELECTRON_RENDERER_URL"]) {
    win.webContents.once("did-finish-load", () => {
      // eslint-disable-next-line no-console
      console.info(`[launcher] opened ${descriptor.id} at ${targetUrl}`);
    });
  }

  win.on("closed", () => {
    childWindows.delete(descriptor.id);
  });

  childWindows.set(descriptor.id, win);
  return win;
}

function buildAppUrl(appId: string): string {
  const hash = `#/apps/${appId}`;
  if (process.env["ELECTRON_RENDERER_URL"]) {
    return `${process.env["ELECTRON_RENDERER_URL"]}${hash}`;
  }
  return `${pathToFileURL(getRendererIndexHtmlPath()).toString()}${hash}`;
}

export function closeAllChildWindows(): void {
  for (const win of childWindows.values()) {
    if (!win.isDestroyed()) win.close();
  }
  childWindows.clear();
}

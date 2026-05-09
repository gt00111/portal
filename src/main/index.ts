import { app, BrowserWindow, ipcMain } from "electron";

import { closeDatabase } from "./db/connection.js";
import { loadModules } from "./modules/loader.js";
import { ensurePixoTempOnStartup } from "./modules/pixo-converter/pixo-converter.service.js";
import { closeAllChildWindows } from "./modules/launcher/childWindow.js";
import { createPortalWindow, getPortalWindow } from "./window.js";

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on("second-instance", () => {
  const wins = BrowserWindow.getAllWindows();
  if (wins.length > 0) {
    const first = wins[0];
    if (first.isMinimized()) first.restore();
    first.focus();
  }
});

app.whenReady().then(async () => {
  loadModules(ipcMain);
  ensurePixoTempOnStartup();
  const portal = createPortalWindow();
  portal.on("close", () => {
    closeAllChildWindows();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPortalWindow();
    } else {
      getPortalWindow()?.focus();
    }
  });
});

app.on("window-all-closed", () => {
  closeDatabase();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

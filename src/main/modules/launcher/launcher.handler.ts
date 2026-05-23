import type { IpcMain } from "electron";

import { isGrantableAppId } from "@shared/appIds.js";
import { fail, ok } from "@shared/ipcResponse.js";
import type { AppDescriptor } from "@shared/types.js";

import { assertCanViewApp, assertLoggedIn } from "@main/auth-guard.js";

import { openInternalAppWindow } from "./childWindow.js";
import { findApp, listAppCatalog } from "./launcher.repo.js";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("launcher:list", async () => {
    try {
      assertLoggedIn();
      return ok<AppDescriptor[]>(listAppCatalog());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("launcher:openApp", async (_event, data: { appId: string }) => {
    try {
      assertLoggedIn();
      const descriptor = findApp(data?.appId);
      if (!descriptor) {
        throw new Error(`アプリが見つかりません: ${data?.appId}`);
      }
      if (!descriptor.ready) {
        throw new Error(`「${descriptor.displayName}」は準備中です。後続フェーズで提供します。`);
      }
      if (isGrantableAppId(descriptor.id)) {
        try {
          assertCanViewApp(descriptor.id);
        } catch {
          throw new Error(
            `「${descriptor.displayName}」を利用する権限がありません。ポータル管理者に依頼してください。`
          );
        }
      }
      if (descriptor.kind === "internal") {
        openInternalAppWindow(descriptor);
        return ok<AppDescriptor>(descriptor);
      }
      throw new Error(`外部アプリの起動は未対応です: ${descriptor.id}`);
    } catch (err) {
      return fail(err);
    }
  });
}

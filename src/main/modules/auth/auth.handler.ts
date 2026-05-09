import type { IpcMain } from "electron";

import { fail, ok } from "@shared/ipcResponse.js";
import type { SessionUser } from "@shared/types.js";
import { parseProcessView } from "@shared/processView.js";

import { assertLoggedIn } from "@main/auth-guard.js";
import { isOpen } from "@main/db/connection.js";
import { hashPassword, verifyPassword } from "@main/password.js";
import { clearSession, getSession, setSession, updateSession } from "@main/session.js";

import {
  findActiveOperatorByUsername,
  findOperatorById,
  updatePassword,
} from "./auth.repo.js";

export function register(ipcMain: IpcMain): void {
  ipcMain.handle("auth:session", async () => {
    try {
      return ok<SessionUser | null>(getSession());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("auth:syncSession", async () => {
    try {
      const session = assertLoggedIn();
      const record = findOperatorById(session.id);
      if (!record || record.isActive !== 1) {
        throw new Error("アカウント情報を取得できませんでした。");
      }
      const next: SessionUser = {
        id: record.id,
        username: record.username,
        role: record.role,
        processView: parseProcessView(record.processView),
        mustChangePassword: record.mustChangePassword === 1,
      };
      setSession(next);
      return ok<SessionUser>(next);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "auth:login",
    async (_event, data: { username: string; password: string }) => {
      try {
        if (!isOpen()) {
          throw new Error("データベースが開かれていません。Bootstrap 画面で DB を作成してください。");
        }
        const { username, password } = data ?? { username: "", password: "" };
        if (!username || !password) {
          throw new Error("ユーザー名とパスワードを入力してください。");
        }
        const record = findActiveOperatorByUsername(username.trim());
        if (!record) {
          throw new Error("ユーザー名またはパスワードが正しくありません。");
        }
        const okPw = await verifyPassword(password, record.passwordHash);
        if (!okPw) {
          throw new Error("ユーザー名またはパスワードが正しくありません。");
        }
        const session: SessionUser = {
          id: record.id,
          username: record.username,
          role: record.role,
          processView: parseProcessView(record.processView),
          mustChangePassword: record.mustChangePassword === 1,
        };
        setSession(session);
        return ok<SessionUser>(session);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle("auth:logout", async () => {
    try {
      clearSession();
      return ok<null>(null);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "auth:changePassword",
    async (_event, data: { currentPassword: string; newPassword: string }) => {
      try {
        const session = assertLoggedIn();
        const current = (data?.currentPassword ?? "").toString();
        const next = (data?.newPassword ?? "").toString();
        if (next.length < 6) {
          throw new Error("新しいパスワードは 6 文字以上にしてください。");
        }
        if (current === next) {
          throw new Error("新しいパスワードは現在のパスワードと別のものにしてください。");
        }
        const record = findOperatorById(session.id);
        if (!record) {
          throw new Error("アカウント情報を取得できませんでした。");
        }
        const okCurrent = await verifyPassword(current, record.passwordHash);
        if (!okCurrent) {
          throw new Error("現在のパスワードが正しくありません。");
        }
        const hashed = await hashPassword(next);
        updatePassword(record.id, hashed);
        updateSession({ mustChangePassword: false });
        return ok<SessionUser>({ ...session, mustChangePassword: false });
      } catch (err) {
        return fail(err);
      }
    }
  );
}

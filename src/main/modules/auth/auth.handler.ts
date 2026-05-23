import type { IpcMain } from "electron";

import { fail, ok } from "@shared/ipcResponse.js";
import type { SessionUser } from "@shared/types.js";

import { appendAuditEntry } from "@main/audit/audit.repo.js";
import { buildSessionFromOperator } from "@main/build-session.js";
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
      const next = buildSessionFromOperator(record);
      setSession(next);
      return ok<SessionUser>(next);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    "auth:login",
    async (_event, data: { username: string; password: string }) => {
      const inputUsername = (data?.username ?? "").toString().trim();
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
        const session = buildSessionFromOperator(record);
        setSession(session);
        appendAuditEntry({
          channel: "auth:login",
          action: "login",
          result: "ok",
          targetType: "operator",
          targetId: record.id,
          username: session.username,
          userNameId: session.userNameId,
        });
        return ok<SessionUser>(session);
      } catch (err) {
        appendAuditEntry({
          channel: "auth:login",
          action: "login",
          result: "fail",
          username: inputUsername || null,
          userNameId: null,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );

  ipcMain.handle("auth:logout", async () => {
    try {
      const before = getSession();
      clearSession();
      if (before) {
        appendAuditEntry({
          channel: "auth:logout",
          action: "logout",
          result: "ok",
          username: before.username,
          userNameId: before.userNameId,
          targetType: "operator",
          targetId: before.id,
        });
      }
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
        appendAuditEntry({
          channel: "auth:changePassword",
          action: "update",
          result: "ok",
          targetType: "operator",
          targetId: record.id,
        });
        return ok<SessionUser>({ ...session, mustChangePassword: false });
      } catch (err) {
        appendAuditEntry({
          channel: "auth:changePassword",
          action: "update",
          result: "fail",
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        return fail(err);
      }
    }
  );
}

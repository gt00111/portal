import { useCallback, useEffect, useState } from "react";

import type { SessionUser } from "@shared/types.js";

import { invoke } from "@renderer/lib/api.js";

interface UseAuth {
  session: SessionUser | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<SessionUser>;
  /** DB の操作者情報（工程表示など）を再読込してセッションを更新 */
  syncSession: () => Promise<SessionUser>;
  refresh: () => Promise<void>;
}

export function useAuth(): UseAuth {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await invoke<SessionUser | null>("auth:session");
      setSession(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const user = await invoke<SessionUser>("auth:login", { username, password });
    setSession(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    await invoke<null>("auth:logout");
    setSession(null);
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const updated = await invoke<SessionUser>("auth:changePassword", {
        currentPassword,
        newPassword,
      });
      setSession(updated);
      return updated;
    },
    []
  );

  const syncSession = useCallback(async () => {
    const updated = await invoke<SessionUser>("auth:syncSession");
    setSession(updated);
    return updated;
  }, []);

  return { session, loading, error, login, logout, changePassword, syncSession, refresh };
}

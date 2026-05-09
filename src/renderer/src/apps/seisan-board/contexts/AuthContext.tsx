import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

import type { AppRole } from "@shared/auth.js";
import type { SessionUser } from "@shared/types.js";

type UserRole = "viewer" | "editor" | "approver";

interface AuthState {
  userName: string | null
  role: UserRole
  isLoggedIn: boolean
}

interface AuthContextValue extends AuthState {
  login: (userName: string) => Promise<void>;
  logout: () => void;
  canEdit: boolean;
  canApprove: boolean;
  /** ポータルに埋め込みのとき true（ログアウトでポータルホームへ） */
  embeddedInPortal: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'seisan:auth-user'

function mapPortalRole(role: AppRole): UserRole {
  if (role === "admin") {
    return "approver";
  }
  if (role === "editor") {
    return "editor";
  }
  return "viewer";
}

function portalAuthState(session: SessionUser): AuthState {
  return {
    userName: session.username,
    role: mapPortalRole(session.role),
    isLoggedIn: true,
  };
}

export function AuthProvider({
  children,
  portalSession,
}: {
  children: ReactNode;
  /** ポータルから埋め込むとき指定。ログイン画面をスキップする。 */
  portalSession?: SessionUser | null;
}) {
  const embeddedInPortal = portalSession != null;

  const [state, setState] = useState<AuthState>(() => {
    if (portalSession) {
      return portalAuthState(portalSession);
    }
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved) as AuthState;
      } catch {
        /* ignore */
      }
    }
    return { userName: null, role: "viewer", isLoggedIn: false };
  });

  const login = useCallback(
    async (userName: string) => {
      let role: UserRole = "viewer";
      try {
        const permsRes = await window.api?.userPermissions?.list();
        const isEmpty = permsRes?.success && (!permsRes.data || permsRes.data.length === 0);

        if (isEmpty) {
          await window.api?.userPermissions?.setRole(userName, "approver");
          role = "approver";
        } else {
          const res = await window.api?.userPermissions?.getRole(userName);
          if (res?.success && res.data) {
            role = res.data;
          }
        }
      } catch {
        /* default to viewer */
      }
      const newState: AuthState = { userName, role, isLoggedIn: true };
      setState(newState);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    },
    []
  );

  const logout = useCallback(() => {
    if (embeddedInPortal) {
      window.location.hash = "#/home";
      return;
    }
    setState({ userName: null, role: "viewer", isLoggedIn: false });
    sessionStorage.removeItem(STORAGE_KEY);
  }, [embeddedInPortal]);

  const canEdit = state.role === "editor" || state.role === "approver";
  const canApprove = state.role === "approver";

  return (
    <AuthContext.Provider
      value={{ ...state, login, logout, canEdit, canApprove, embeddedInPortal }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

import { useEffect, useMemo } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { isPortalAdmin } from "@shared/auth.js";
import { MASTER_TABLES } from "@shared/master.js";

import { AdminLayout } from "@renderer/components/AdminLayout.js";
import { ForcePasswordChangeModal } from "@renderer/components/ForcePasswordChangeModal.js";
import { Button } from "@renderer/components/ui/Button.js";
import { ToastProvider } from "@renderer/components/ui/Toast.js";
import { useAuth } from "@renderer/hooks/useAuth.js";
import { useSettings } from "@renderer/hooks/useSettings.js";
import { AdminOperators } from "@renderer/routes/AdminOperators.js";
import { AdminSettings } from "@renderer/routes/AdminSettings.js";
import { AppShell } from "@renderer/routes/AppShell.js";
import { Bootstrap } from "@renderer/routes/Bootstrap.js";
import { DrawingLibraryApp } from "@renderer/routes/DrawingLibraryApp.js";
import { Home } from "@renderer/routes/Home.js";
import { Login } from "@renderer/routes/Login.js";
import { MasterTableRoute } from "@renderer/routes/MasterDatabase.js";
import { NotFound } from "@renderer/routes/NotFound.js";
import { PixoConverterApp } from "@renderer/routes/PixoConverterApp.js";
import { PartsTrackerRoutes } from "@renderer/routes/PartsTrackerRoutes.js";
import { ProcessManagementApp } from "@renderer/routes/ProcessManagementApp.js";
import { SeisanBoardApp } from "@renderer/routes/SeisanBoardApp.js";
import { SkuRoute } from "@renderer/routes/SkuRoute.js";
import { AuditLogPage } from "@renderer/routes/master/AuditLogPage.js";
import { ProcurementLeadTimePage } from "@renderer/routes/master/ProcurementLeadTimePage.js";
import { UserAccessPage } from "@renderer/routes/master/UserAccessPage.js";

export function App(): JSX.Element {
  return (
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  );
}

function AppRoutes(): JSX.Element {
  const { settings, loading: settingsLoading, error: settingsError, refresh: refreshSettings } = useSettings();
  const {
    session,
    loading: authLoading,
    error: authError,
    login,
    logout,
    changePassword,
    refresh: refreshAuth,
  } = useAuth();
  const navigate = useNavigate();

  const status = useMemo(() => {
    if (settingsLoading || authLoading) return "loading" as const;
    if (!settings) return "settings_unavailable" as const;
    if (settings.stage === "db_unset") return "bootstrap" as const;
    if (!session) return "anonymous" as const;
    return "authed" as const;
  }, [settingsLoading, authLoading, settings, session]);

  useEffect(() => {
    if (status === "bootstrap") {
      navigate("/", { replace: true });
    }
  }, [status, navigate]);

  if (status === "settings_unavailable") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-base px-6 text-center text-fg-primary">
        <p className="text-fg-muted">設定・セッション情報を読み込めませんでした。</p>
        {(settingsError ?? authError) && (
          <p className="max-w-lg text-sm text-state-danger">{settingsError ?? authError}</p>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void refreshSettings();
            void refreshAuth();
          }}
        >
          再試行
        </Button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base text-fg-muted">
        読み込み中...
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base text-fg-muted">
        読み込み中...
      </div>
    );
  }

  const forcePasswordChange = session?.mustChangePassword === true;

  async function handleLogout(): Promise<void> {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            status === "bootstrap" ? (
              <Bootstrap settings={settings} onUpdated={refreshSettings} />
            ) : session ? (
              <Navigate to="/home" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/login"
          element={
            status === "bootstrap" ? (
              <Navigate to="/" replace />
            ) : session ? (
              <Navigate to="/home" replace />
            ) : (
              <Login
                dbPath={settings.dbPath}
                onLogin={login}
                onReconfigureDb={() => navigate("/", { replace: true })}
              />
            )
          }
        />
        <Route
          path="/home"
          element={
            !session ? (
              <Navigate to="/login" replace />
            ) : (
              <Home session={session} settings={settings} onLogout={handleLogout} />
            )
          }
        />

        {session && (
          <>
            <Route
              path="/admin"
              element={
                !isPortalAdmin(session.role) ? (
                  <Navigate to="/home" replace />
                ) : (
                  <AdminLayout session={session} onLogout={handleLogout} />
                )
              }
            >
              <Route index element={<Navigate to="settings" replace />} />
              <Route
                path="settings"
                element={<AdminSettings settings={settings} onUpdated={refreshSettings} />}
              />
              <Route
                path="operators"
                element={<AdminOperators session={session} />}
              />
            </Route>

            <Route
              path="/apps/seisan-board/*"
              element={<SeisanBoardApp session={session} />}
            />
            <Route
              path="/apps/drawing-library"
              element={
                <div className="portal-app-calm-shell flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-bg-base">
                  <DrawingLibraryApp session={session} />
                </div>
              }
            />
            <Route
              path="/apps/parts-tracker/*"
              element={
                <div className="portal-app-calm-shell portal-typography-14px flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-bg-base text-fg-primary">
                  <PartsTrackerRoutes session={session} />
                </div>
              }
            />
            <Route
              path="/apps/process-management"
              element={
                <div className="portal-app-calm-shell flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-bg-base text-fg-primary">
                  <ProcessManagementApp session={session} />
                </div>
              }
            />
            <Route path="/apps/pixo-converter/*" element={<PixoConverterApp />} />
            <Route path="/apps/:appId" element={<AppShell session={session} />}>
              <Route index element={<Navigate to="m_customers" replace />} />
              {MASTER_TABLES.map((t) => (
                <Route key={t} path={t} element={<MasterTableRoute table={t} />} />
              ))}
              <Route path="m_skus" element={<SkuRoute />} />
              <Route path="procurement-lead-times" element={<ProcurementLeadTimePage />} />
              <Route path="user-access" element={<UserAccessPage />} />
              <Route path="audit-log" element={<AuditLogPage />} />
            </Route>
          </>
        )}

        {!session && (
          <>
            <Route path="/admin/*" element={<Navigate to="/login" replace />} />
            <Route path="/apps/*" element={<Navigate to="/login" replace />} />
          </>
        )}

        <Route path="*" element={<NotFound />} />
      </Routes>

      {forcePasswordChange && session && (
        <ForcePasswordChangeModal
          onSubmit={async (current, next) => {
            await changePassword(current, next);
            await refreshAuth();
            navigate("/home", { replace: true });
          }}
        />
      )}
    </>
  );
}

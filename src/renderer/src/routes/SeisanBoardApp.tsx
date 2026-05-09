import { Route, Routes } from "react-router-dom";

import type { SessionUser } from "@shared/types.js";

import { InitialRedirect } from "@renderer/apps/seisan-board/components/InitialRedirect.js";
import { AuthProvider } from "@renderer/apps/seisan-board/contexts/AuthContext.js";
import { AppLayout } from "@renderer/apps/seisan-board/layouts/AppLayout.js";
import { SettingsLayout } from "@renderer/apps/seisan-board/layouts/SettingsLayout.js";
import { DashboardPage } from "@renderer/apps/seisan-board/pages/DashboardPage.js";
import { ErrorPage } from "@renderer/apps/seisan-board/pages/ErrorPage.js";
import { GanttOverviewPage } from "@renderer/apps/seisan-board/pages/GanttOverviewPage.js";
import { LoginPage } from "@renderer/apps/seisan-board/pages/LoginPage.js";
import { ProjectDetailPage } from "@renderer/apps/seisan-board/pages/ProjectDetailPage.js";
import { ProjectsPage } from "@renderer/apps/seisan-board/pages/ProjectsPage.js";
import { ProcessTemplatesPage } from "@renderer/apps/seisan-board/pages/settings/ProcessTemplatesPage.js";
import { SettingsGeneralPage } from "@renderer/apps/seisan-board/pages/settings/SettingsGeneralPage.js";
import { UserPermissionsPage } from "@renderer/apps/seisan-board/pages/settings/UserPermissionsPage.js";

interface Props {
  session: SessionUser;
}

/** ポータル `/apps/seisan-board/*` 用のルートツリー（親のスプラット配下では相対 path のみ使う） */
export function SeisanBoardApp({ session }: Props): JSX.Element {
  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-background text-foreground dark">
      <AuthProvider portalSession={session}>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route element={<AppLayout />} errorElement={<ErrorPage />}>
            <Route index element={<InitialRedirect />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="gantt" element={<GanttOverviewPage />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<SettingsGeneralPage />} />
              <Route path="process-templates" element={<ProcessTemplatesPage />} />
              <Route path="permissions" element={<UserPermissionsPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </div>
  );
}

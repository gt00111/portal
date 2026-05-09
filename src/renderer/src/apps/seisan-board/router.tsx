import { createHashRouter } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { SettingsLayout } from './layouts/SettingsLayout'
import { InitialRedirect } from './components/InitialRedirect'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { GanttOverviewPage } from './pages/GanttOverviewPage'
import { LoginPage } from './pages/LoginPage'
import { SettingsGeneralPage } from './pages/settings/SettingsGeneralPage'
import { ProcessTemplatesPage } from './pages/settings/ProcessTemplatesPage'
import { UserPermissionsPage } from './pages/settings/UserPermissionsPage'
import { ErrorPage } from './pages/ErrorPage'
import { NotFoundPage } from './pages/NotFoundPage'

export const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <InitialRedirect /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      { path: 'gantt', element: <GanttOverviewPage /> },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <SettingsGeneralPage /> },
          { path: 'process-templates', element: <ProcessTemplatesPage /> },
          { path: 'permissions', element: <UserPermissionsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

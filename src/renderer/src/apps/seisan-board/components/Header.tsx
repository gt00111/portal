import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, GanttChart, Settings, RefreshCw, LogOut, User } from 'lucide-react'
import { Button } from './ui/button'
import { PortalAppHeaderLogo } from '@renderer/components/PortalAppHeaderLogo.js'
import { SyncIndicator } from './SyncIndicator'
import { useAuth } from '../contexts/AuthContext'
import { seisanPath } from '../paths'

const ROLE_LABELS: Record<string, string> = {
  viewer: '閲覧者',
  editor: '編集者',
  approver: '承認者',
}

export function Header() {
  const { userName, role, logout, embeddedInPortal } = useAuth()
  const navigate = useNavigate()

  const handleRefresh = async () => {
    if (window.api?.db?.status) {
      const status = await window.api.db.status()
      if (status.connected) {
        window.dispatchEvent(new CustomEvent('seisan:refresh'))
      }
    }
  }

  const handleLogout = () => {
    logout()
    if (!embeddedInPortal) {
      navigate(seisanPath('login'), { replace: true })
    }
  }

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex shrink-0 items-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-3 sm:text-sm ${
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    }`

  return (
    <header className="sticky top-0 z-40 flex min-h-14 w-full shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b bg-background px-2 py-2 sm:gap-3 sm:px-4 md:flex-nowrap md:py-0">
      <div className="flex min-w-0 w-full flex-wrap items-center gap-x-2 gap-y-1 md:w-auto md:flex-1 md:flex-nowrap md:gap-4 lg:gap-6">
        <NavLink to={seisanPath('projects')} className="flex shrink-0 items-center">
          <PortalAppHeaderLogo
            appId="seisan-board"
            className="h-8 w-auto max-w-[min(200px,55vw)] object-contain sm:h-9 sm:max-w-[min(220px,40vw)]"
          />
        </NavLink>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-2 [&::-webkit-scrollbar]:hidden">
          <NavLink to={seisanPath('projects')} className={navItemClass}>
            <FolderKanban className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">案件</span>
          </NavLink>
          <NavLink to={seisanPath('gantt')} className={navItemClass} title="ガントスケジュール">
            <GanttChart className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap lg:hidden">ガント</span>
            <span className="hidden whitespace-nowrap lg:inline">ガントスケジュール</span>
          </NavLink>
          <NavLink to={seisanPath('dashboard')} className={navItemClass} title="ダッシュボード">
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap lg:hidden">ダッシュ</span>
            <span className="hidden whitespace-nowrap lg:inline">ダッシュボード</span>
          </NavLink>
          <NavLink to={seisanPath('settings')} className={navItemClass}>
            <Settings className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">設定</span>
          </NavLink>
        </nav>
      </div>
      <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 sm:w-auto sm:flex-nowrap sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <User className="hidden h-4 w-4 shrink-0 sm:block" />
          <span className="min-w-0 max-w-[40vw] truncate sm:max-w-[7rem] md:max-w-[9rem]">{userName}</span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] sm:text-xs">
            {ROLE_LABELS[role] ?? role}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="ログアウト" className="shrink-0">
          <LogOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleRefresh} title="再読込" className="shrink-0">
          <RefreshCw className="h-4 w-4" />
        </Button>

        <SyncIndicator />
      </div>
    </header>
  )
}

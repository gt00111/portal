import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, GanttChart, Settings, RefreshCw, LogOut, User } from 'lucide-react'
import { Button } from './ui/button'
import { SyncIndicator } from './SyncIndicator'
import { useAuth } from '../contexts/AuthContext'
import logoImg from '../assets/seisan-board.png'
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

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-6">
        <NavLink to={seisanPath('projects')} className="flex items-center">
          <img src={logoImg} alt="Seisan-Board" className="h-9 w-auto" />
        </NavLink>
        <nav className="flex gap-2">
          <NavLink
            to={seisanPath('projects')}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`
            }
          >
            <FolderKanban className="h-4 w-4" />
            案件
          </NavLink>
          <NavLink
            to={seisanPath('gantt')}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`
            }
          >
            <GanttChart className="h-4 w-4" />
            ガントスケジュール
          </NavLink>
          <NavLink
            to={seisanPath('dashboard')}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`
            }
          >
            <LayoutDashboard className="h-4 w-4" />
            ダッシュボード
          </NavLink>
          <NavLink
            to={seisanPath('settings')}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`
            }
          >
            <Settings className="h-4 w-4" />
            設定
          </NavLink>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>{userName}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{ROLE_LABELS[role] ?? role}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="ログアウト">
          <LogOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleRefresh} title="再読込">
          <RefreshCw className="h-4 w-4" />
        </Button>
        
        <SyncIndicator />
      </div>
    </header>
  )
}

import { NavLink, Outlet } from 'react-router-dom'
import { Database, Layers, ShieldCheck } from 'lucide-react'
import { seisanPath } from '../paths'

const settingsNav = [
  { to: seisanPath('settings'), label: 'DB設定', icon: Database },
  { to: seisanPath('settings/process-templates'), label: '工程テンプレート', icon: Layers },
  { to: seisanPath('settings/permissions'), label: 'ユーザー権限', icon: ShieldCheck },
]

export function SettingsLayout() {
  return (
    <div className="flex gap-6">
      <nav className="w-48 shrink-0 space-y-1">
        {settingsNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === seisanPath('settings')}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}

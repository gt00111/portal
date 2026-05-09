import { useEffect, useState } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { seisanPath } from '../paths'

/** DB未接続時は設定画面へリダイレクト */
export function DbGuard() {
  const location = useLocation()
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)

  const isSettingsPath = location.pathname.startsWith(seisanPath("settings"))

  useEffect(() => {
    if (!window.api?.db) {
      setChecked(true)
      return
    }

    window.api.db.status().then((status) => {
      setChecked(true)
      if (!status.connected && !isSettingsPath) {
        navigate(seisanPath('settings'), { replace: true })
      }
    })
  }, [isSettingsPath, navigate])

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  return <Outlet />
}

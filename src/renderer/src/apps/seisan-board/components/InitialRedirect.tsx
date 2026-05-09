import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { seisanPath } from '../paths'

/** DB接続状態に応じてホーム or 設定画面へリダイレクト */
export function InitialRedirect() {
  const navigate = useNavigate()
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!window.api?.db) {
      navigate(seisanPath('settings'), { replace: true })
      setDone(true)
      return
    }

    window.api.db.status().then((status) => {
      navigate(status.connected ? seisanPath('projects') : seisanPath('settings'), { replace: true })
      setDone(true)
    })
  }, [navigate])

  if (!done) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  return null
}

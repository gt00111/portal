import { useEffect, useState } from 'react'

export function SyncIndicator() {
  const [status, setStatus] = useState<{ connected: boolean; path: string | null } | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      if (window.api?.db?.status) {
        const s = await window.api.db.status()
        setStatus(s)
      }
    }
    fetchStatus()
    const onRefresh = () => fetchStatus()
    window.addEventListener('seisan:refresh', onRefresh)
    return () => window.removeEventListener('seisan:refresh', onRefresh)
  }, [])

  if (!status) return null

  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`h-2 w-2 rounded-full ${
          status.connected ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <span className="text-muted-foreground">
        {status.connected ? '接続中' : '未接続'}
      </span>
    </div>
  )
}

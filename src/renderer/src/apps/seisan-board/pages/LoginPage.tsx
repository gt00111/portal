import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { Database, CheckCircle2 } from 'lucide-react'
import logoImg from '../assets/seisan-board.png'
import { seisanPath } from '../paths'

interface MasterItem { id: number; name: string }

export function LoginPage() {
  const navigate = useNavigate()
  const { login, isLoggedIn } = useAuth()
  const [users, setUsers] = useState<MasterItem[]>([])
  const [selected, setSelected] = useState('')
  const [logging, setLogging] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [welcomeName, setWelcomeName] = useState('')
  const [masterConnected, setMasterConnected] = useState<boolean | null>(null)
  const [connecting, setConnecting] = useState(false)

  const fetchUsers = useCallback(async () => {
    const res = await window.api?.masterData?.userNames()
    if (res?.success && res.data) {
      setUsers(res.data)
      setMasterConnected(res.data.length > 0)
    } else {
      setUsers([])
      setMasterConnected(false)
    }
  }, [])

  useEffect(() => {
    if (isLoggedIn && !showWelcome) {
      navigate(seisanPath('projects'), { replace: true })
      return
    }
    fetchUsers()
  }, [isLoggedIn, navigate, showWelcome, fetchUsers])

  const handleConnectMasterDb = async () => {
    setConnecting(true)
    try {
      const res = await window.api?.masterData?.selectFile()
      if (res?.success) {
        await fetchUsers()
      }
    } finally {
      setConnecting(false)
    }
  }

  const handleLogin = async () => {
    if (!selected) return
    setLogging(true)
    const userName = users.find((u) => u.id.toString() === selected)?.name ?? selected
    setWelcomeName(userName)
    await login(userName)
    setShowWelcome(true)

    setTimeout(() => {
      setShowWelcome(false)
      navigate(seisanPath('projects'), { replace: true })
    }, 2800)
  }

  if (showWelcome) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-blue-400/30"
              style={{
                width: `${Math.random() * 6 + 2}px`,
                height: `${Math.random() * 6 + 2}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
        <div className="relative text-center animate-in fade-in zoom-in-95 duration-700">
          <p className="text-lg text-blue-200/80 tracking-widest mb-3">
            ようこそ
          </p>
          <p className="text-3xl font-bold text-white mb-6 tracking-wide">
            {welcomeName} さん
          </p>
          <div className="relative">
            <p className="text-xl text-blue-100/90 font-medium tracking-wider">
              いつもお仕事お疲れ様です。
            </p>
            <div className="mt-6 h-px w-48 mx-auto bg-gradient-to-r from-transparent via-blue-400/60 to-transparent" />
          </div>
        </div>
        <style>{`
          @keyframes float {
            0%, 100% { transform: translateY(0px) scale(1); opacity: 0.3; }
            50% { transform: translateY(-20px) scale(1.5); opacity: 0.8; }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-background to-muted/30">
      <div className="w-full max-w-sm space-y-8 px-6 py-8">
        <div className="flex flex-col items-center gap-4">
          <img src={logoImg} alt="Seisan-Board" className="h-16 w-auto" />
          <p className="text-sm text-muted-foreground">ログインしてください</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>お名前</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder="名前を選択してください" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id.toString()}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            onClick={handleLogin}
            disabled={!selected || logging}
          >
            {logging ? 'ログイン中...' : 'ログイン'}
          </Button>
        </div>
        {masterConnected === false && (
          <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
              <Database className="h-4 w-4" />
              マスターDBが未接続です
            </div>
            <p className="text-xs text-muted-foreground">
              ログインするにはマスターデータベースの接続が必要です。
              マスターDBファイル（.db）を選択してください。
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleConnectMasterDb}
              disabled={connecting}
            >
              <Database className="mr-2 h-4 w-4" />
              {connecting ? '接続中...' : 'マスターDBファイルを選択'}
            </Button>
          </div>
        )}
        {masterConnected === true && users.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            マスターDB接続済み
          </div>
        )}
      </div>
    </div>
  )
}

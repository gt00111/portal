import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from '../components/Header'
import { DbGuard } from '../components/DbGuard'
import { Toaster } from '../components/Toaster'
import { useAuth } from "../contexts/AuthContext";
import { seisanPath } from "../paths";

export function AppLayout() {
  const { isLoggedIn } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoggedIn) {
      navigate(seisanPath('login'), { replace: true })
    }
  }, [isLoggedIn, navigate])

  if (!isLoggedIn) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Header />
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4">
        <DbGuard />
      </main>
      <Toaster />
    </div>
  )
}

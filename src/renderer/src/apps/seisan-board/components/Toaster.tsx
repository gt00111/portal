import { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, X } from 'lucide-react'

interface ToastItem {
  id: number
  message: string
}

let nextId = 0

export function showToast(message: string, _variant?: "error" | "success") {
  window.dispatchEvent(new CustomEvent("seisan:toast", { detail: message }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string) => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      addToast((e as CustomEvent<string>).detail)
    }
    window.addEventListener('seisan:toast', handler)
    return () => window.removeEventListener('seisan:toast', handler)
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 rounded-lg border bg-background px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2 fade-in"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
          <span className="text-sm">{t.message}</span>
          <button
            type="button"
            className="ml-2 shrink-0 rounded-sm opacity-50 hover:opacity-100"
            onClick={() => removeToast(t.id)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

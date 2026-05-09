import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="text-muted-foreground">ページが見つかりません</p>
      <Button asChild>
        <Link to="/home">ポータルに戻る</Link>
      </Button>
    </div>
  )
}

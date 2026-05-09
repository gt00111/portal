import { useRouteError } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { useNavigate } from 'react-router-dom'
import { seisanPath } from '../paths'

export function ErrorPage() {
  const error = useRouteError()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold text-destructive">エラーが発生しました</h1>
      <p className="text-muted-foreground">
        {error instanceof Error ? error.message : '不明なエラー'}
      </p>
      <Button onClick={() => navigate(seisanPath('projects'))}>案件一覧に戻る</Button>
    </div>
  )
}

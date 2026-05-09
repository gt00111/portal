import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Database, Unplug } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import { seisanPath } from '../../paths'

export function SettingsGeneralPage() {
  const navigate = useNavigate()
  const [dbPath, setDbPath] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [dlMsg, setDlMsg] = useState<string | null>(null)

  const [masterPath, setMasterPath] = useState<string | null>(null)
  const [masterConnected, setMasterConnected] = useState(false)
  const [masterMsg, setMasterMsg] = useState<string | null>(null)

  const fetchStatus = async () => {
    if (!window.api?.db) return
    const status = await window.api.db.status()
    setDbPath(status.path)
    setConnected(status.connected)
  }

  const fetchMasterStatus = async () => {
    if (!window.api?.masterData) return
    const status = await window.api.masterData.status()
    setMasterPath(status.path)
    setMasterConnected(status.connected)
  }

  useEffect(() => {
    fetchStatus()
    fetchMasterStatus()
  }, [])

  const handleSelectFile = async () => {
    if (!window.api?.db) return
    const path = await window.api.db.selectFile()
    if (path) {
      const res = await window.api.db.connect(path)
      if (res.success) {
        setMessage('接続しました')
        fetchStatus()
        window.dispatchEvent(new CustomEvent('seisan:refresh'))
        navigate(seisanPath('projects'))
      } else {
        setMessage(res.error ?? '接続に失敗しました')
      }
    }
  }

  const handleCreateNew = async () => {
    if (!window.api?.db) return
    const path = await window.api.db.createNew()
    if (path) {
      const res = await window.api.db.connect(path)
      if (res.success) {
        setMessage('新規DBを作成して接続しました')
        fetchStatus()
        window.dispatchEvent(new CustomEvent('seisan:refresh'))
        navigate(seisanPath('projects'))
      } else {
        setMessage(res.error ?? '接続に失敗しました')
      }
    }
  }

  const handleDownloadFormat = async () => {
    if (!window.api?.import) return
    setDlMsg(null)
    const res = await window.api.import.downloadFormat()
    if (res.success) {
      setDlMsg('Excelテンプレート（format.xlsx）を保存しました')
    } else if (res.error !== 'キャンセルされました') {
      setDlMsg(res.error ?? '保存に失敗しました')
    }
  }

  const handleSelectMasterFile = async () => {
    if (!window.api?.masterData) return
    setMasterMsg(null)
    const res = await window.api.masterData.selectFile()
    if (res.success) {
      setMasterMsg('マスターDBに接続しました')
      fetchMasterStatus()
    } else if (res.error !== 'キャンセルされました') {
      setMasterMsg(res.error ?? '接続に失敗しました')
    }
  }

  const handleDisconnectMaster = async () => {
    if (!window.api?.masterData) return
    await window.api.masterData.disconnect()
    setMasterMsg('マスターDB接続を解除しました')
    fetchMasterStatus()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">DB設定</h1>
      {!connected && (
        <p className="text-sm text-muted-foreground rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          データベースが接続されていません。既存のDBを選択するか、新規作成してください。
        </p>
      )}
      <div className="rounded-lg border p-6 space-y-4">
        <div className="space-y-2">
          <Label>現在のDBパス</Label>
          <p className="text-sm text-muted-foreground font-mono break-all">
            {dbPath ?? '未接続'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSelectFile}>DBを選択</Button>
          <Button variant="outline" onClick={handleCreateNew}>
            新規DB作成
          </Button>
        </div>
        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
      </div>

      <h2 className="text-xl font-bold pt-4">マスターデータDB</h2>
      <div className="rounded-lg border p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          新規案件登録時のプルダウン（客先・機種・図面番号(品番)・名称・グループ・入力者）の
          選択肢を外部マスターDBから参照します。
        </p>
        <div className="space-y-2">
          <Label>マスターDBパス</Label>
          <p className="text-sm text-muted-foreground font-mono break-all">
            {masterPath ?? '未設定'}
          </p>
          {masterConnected && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <Database className="h-3 w-3" /> 接続中
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSelectMasterFile}>マスターDBを選択</Button>
          {masterConnected && (
            <Button variant="outline" onClick={handleDisconnectMaster}>
              <Unplug className="mr-2 h-4 w-4" />
              接続解除
            </Button>
          )}
        </div>
        {masterMsg && (
          <p className="text-sm text-muted-foreground">{masterMsg}</p>
        )}
      </div>

      <h2 className="text-xl font-bold pt-4">CSVインポート用フォーマット（Excel）</h2>
      <div className="rounded-lg border p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          案件一括登録用の Excel テンプレート（<code className="rounded bg-muted px-1">resources/format.xlsx</code>
          同梱）をダウンロードできます。記入後、<strong>CSV UTF-8（コンマ区切り）</strong>で保存し、案件一覧の「CSVインポート」から取り込んでください。
        </p>

        <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
          <p className="font-semibold text-foreground">記入上の注意</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>1行目はヘッダー行です。<strong>変更・削除・列の移動はしないでください</strong>。</li>
            <li>
              列の順番: 客先 / 機種 / 図面番号(品番)（ヘッダーが<strong>品番</strong>のみでもインポート可） / 名称 / 号機 /{' '}
              <strong className="text-foreground">リビジョン</strong> / 納期 / 内容 / グループ / 入力者
            </li>
            <li>
              <strong className="text-foreground">リビジョン</strong>以外の列は<strong>すべて必須</strong>です（空欄はエラーになります）。
              リビジョンは図面・設変の版（例: A, 01）で、<strong>空欄でも問題ありません</strong>。
            </li>
            <li>
              Excel でリビジョン列をまだ含まない旧テンプレートで保存した CSV でも、インポート画面は従来どおり読み込めます（リビジョンなし扱い）。
            </li>
            <li>
              <strong>客先・機種・図面番号(品番)・名称・グループ・入力者</strong>は、マスターDBに登録済みの名称と<strong>完全一致</strong>させてください。
            </li>
            <li>
              納期は <code className="rounded bg-muted px-1">yyyy-mm-dd</code>（例: 2026-06-30）形式を推奨。
              <code className="rounded bg-muted px-1">yyyy/mm/dd</code> 形式もインポート時に解釈されます。
            </li>
            <li>インポートされた案件はすべて<strong>「下書き」ステータス</strong>で登録されます。</li>
          </ul>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleDownloadFormat}>
            <Download className="mr-2 h-4 w-4" />
            CSVインポート用フォーマットをダウンロード
          </Button>
          {dlMsg && <span className="text-sm text-muted-foreground">{dlMsg}</span>}
        </div>
      </div>
    </div>
  )
}

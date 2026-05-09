import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import type { ProcessTemplate } from 'shared'

interface TaskFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  parentTaskId: string  // 親工程ID（案件行）
  onCreated: () => void
}

export function TaskFormDialog({
  open,
  onOpenChange,
  projectId,
  parentTaskId,
  onCreated,
}: TaskFormDialogProps) {
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [text, setText] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && window.api) {
      window.api.processTemplates.list(true).then((res) => {
        if (res.success && res.data) setTemplates(res.data)
      })
    }
  }, [open])

  useEffect(() => {
    if (selectedTemplateId) {
      const t = templates.find((x) => x.id === selectedTemplateId)
      if (t) {
        setText(t.name)
        const start = new Date(startDate + 'T00:00:00')
        const end = new Date(start)
        end.setDate(end.getDate() + Math.max(1, Math.ceil(t.default_days)))
        setEndDate(end.toISOString().slice(0, 10))
      }
    }
  }, [selectedTemplateId, templates, startDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.api || !parentTaskId || !text?.trim()) return
    if (endDate < startDate) {
      setError('終了日は開始日以降にしてください')
      return
    }
    setSaving(true)
    setError(null)
    const res = await window.api.tasks.create({
      project_id: projectId,
      parent_task_id: parentTaskId,
      text,
      start_date: startDate,
      end_date: endDate,
      process_template_id: selectedTemplateId || null,
    })
    setSaving(false)
    if (res.success) {
      setText('')
      setSelectedTemplateId('')
      setStartDate(new Date().toISOString().slice(0, 10))
      setEndDate(new Date().toISOString().slice(0, 10))
      onCreated()
      onOpenChange(false)
    } else {
      setError(res.error ?? '保存に失敗しました')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>工程追加</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label>テンプレートから選択</Label>
              <Select value={selectedTemplateId || '__none__'} onValueChange={(v) => setSelectedTemplateId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="選択して工程名・日数を自動入力" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">手動入力</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: t.color || '#94a3b8' }} />
                        {t.name}（{t.default_days}日）
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>工程名</Label>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="工程名を入力"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>開始日</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>終了日</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={saving || !parentTaskId}>
              {saving ? '保存中...' : '追加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

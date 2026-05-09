import { useEffect, useState } from 'react'
import { showToast } from '../../components/Toaster'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import type { ProcessTemplate } from 'shared'

const DEFAULT_COLORS = [
  '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
]

export function ProcessTemplatesPage() {
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProcessTemplate | null>(null)
  const [name, setName] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [defaultDays, setDefaultDays] = useState(1)
  const [color, setColor] = useState('#3b82f6')
  const [isActive, setIsActive] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchData = async () => {
    if (!window.api) return
    const res = await window.api.processTemplates.list()
    if (res.success && res.data) setTemplates(res.data)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const resetForm = () => {
    setEditing(null)
    setName('')
    setSortOrder(templates.length)
    setDefaultDays(1)
    setColor('#3b82f6')
    setIsActive(true)
  }

  const handleOpenAdd = () => {
    resetForm()
    setSortOrder(templates.length)
    setOpen(true)
  }

  const handleOpenEdit = (t: ProcessTemplate) => {
    setEditing(t)
    setName(t.name)
    setSortOrder(t.sort_order)
    setDefaultDays(t.default_days)
    setColor(t.color || '#3b82f6')
    setIsActive(t.is_active === 1)
    setOpen(true)
  }

  const handleSave = async () => {
    if (!window.api || !name.trim()) return
    if (editing) {
      const res = await window.api.processTemplates.update({
        id: editing.id,
        name: name.trim(),
        sort_order: sortOrder,
        default_days: defaultDays,
        color: color || null,
        is_active: isActive ? 1 : 0,
      })
      if (res.success) {
        setOpen(false)
        resetForm()
        fetchData()
      } else {
        showToast(res.error ?? '更新に失敗しました')
      }
    } else {
      const res = await window.api.processTemplates.create({
        name: name.trim(),
        sort_order: sortOrder,
        default_days: defaultDays,
        color: color || null,
        is_active: isActive ? 1 : 0,
      })
      if (res.success) {
        setOpen(false)
        resetForm()
        fetchData()
      } else {
        showToast(res.error ?? '作成に失敗しました')
      }
    }
  }

  const executeDelete = async () => {
    if (!window.api || !deleteId) return
    setDeleteId(null)
    const res = await window.api.processTemplates.delete(deleteId)
    if (res.success) {
      showToast('削除しました')
      fetchData()
    } else {
      showToast(res.error ?? '削除に失敗しました')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1 className="text-2xl font-bold">工程テンプレートマスタ</h1>
        <Button onClick={handleOpenAdd}>追加</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        ガントチャートで工程を追加する際に選択できるテンプレートを登録します。色を設定すると工程の識別がしやすくなります。
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">色</TableHead>
              <TableHead>工程名</TableHead>
              <TableHead className="w-24">並び順</TableHead>
              <TableHead className="w-24">標準日数</TableHead>
              <TableHead className="w-20">有効</TableHead>
              <TableHead className="w-32">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div
                    className="h-6 w-6 rounded border"
                    style={{ backgroundColor: t.color || '#94a3b8' }}
                    title={t.color || '未設定'}
                  />
                </TableCell>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.sort_order}</TableCell>
                <TableCell>{t.default_days}日</TableCell>
                <TableCell>{t.is_active ? '○' : '－'}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(t)}>
                    編集
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(t.id)}>
                    削除
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '編集' : '追加'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>工程名</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 設計" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>並び順</Label>
                <Input
                  type="number"
                  min={0}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>標準日数</Label>
                <Input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={defaultDays}
                  onChange={(e) => setDefaultDays(Number(e.target.value) || 1)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>色</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border p-0"
                />
                <div className="flex gap-1">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="h-6 w-6 rounded border hover:ring-2 hover:ring-offset-1"
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <Label htmlFor="isActive">有効（工程追加時に選択可能）</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteId !== null}
        title="工程テンプレートの削除"
        description="この工程テンプレートを削除しますか？"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={executeDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}

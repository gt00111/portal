import { useState, useEffect } from 'react'
import { showToast } from './Toaster'
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
import { Textarea } from './ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

interface MasterItem {
  id: number
  name: string
}

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  onSave,
}: ProjectFormDialogProps) {
  const [customers, setCustomers] = useState<MasterItem[]>([])
  const [models, setModels] = useState<MasterItem[]>([])
  const [partNumbers, setPartNumbers] = useState<MasterItem[]>([])
  const [componentNames, setComponentNames] = useState<MasterItem[]>([])
  const [groupNames, setGroupNames] = useState<MasterItem[]>([])
  const [userNames, setUserNames] = useState<MasterItem[]>([])

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const [selectedPartNumberId, setSelectedPartNumberId] = useState<number | null>(null)

  const [companyName, setCompanyName] = useState('')
  const [modelType, setModelType] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [projectName, setProjectName] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [revision, setRevision] = useState('')
  const [isMultiLot, setIsMultiLot] = useState(true)
  const [unitFrom, setUnitFrom] = useState('')
  const [unitTo, setUnitTo] = useState('')
  const [deadline, setDeadline] = useState('')
  const [requestContent, setRequestContent] = useState('')
  const [groupName, setGroupName] = useState('')
  const [inputByUserName, setInputByUserName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelectedCustomerId(null)
    setSelectedModelId(null)
    setSelectedPartNumberId(null)
    setCompanyName('')
    setModelType('')
    setPartNumber('')
    setProjectName('')
    setUnitNumber('')
    setRevision('')
    setIsMultiLot(true)
    setUnitFrom('')
    setUnitTo('')
    setDeadline('')
    setRequestContent('')
    setGroupName('')
    setInputByUserName('')
    setError(null)
    setModels([])
    setPartNumbers([])
    setComponentNames([])

    const api = window.api?.masterData
    if (!api) return
    api.customers().then((r) => r.success && r.data && setCustomers(r.data))
    api.groupNames().then((r) => r.success && r.data && setGroupNames(r.data))
    api.userNames().then((r) => r.success && r.data && setUserNames(r.data))
  }, [open])

  const handleCustomerChange = async (val: string) => {
    const id = Number(val)
    const item = customers.find((c) => c.id === id)
    setSelectedCustomerId(id)
    setCompanyName(item?.name ?? '')
    setSelectedModelId(null)
    setModelType('')
    setSelectedPartNumberId(null)
    setPartNumber('')
    setProjectName('')
    setModels([])
    setPartNumbers([])
    setComponentNames([])
    const res = await window.api?.masterData?.models(id)
    if (res?.success && res.data) setModels(res.data)
  }

  const handleModelChange = async (val: string) => {
    const id = Number(val)
    const item = models.find((m) => m.id === id)
    setSelectedModelId(id)
    setModelType(item?.name ?? '')
    setSelectedPartNumberId(null)
    setPartNumber('')
    setProjectName('')
    setPartNumbers([])
    setComponentNames([])
    const res = await window.api?.masterData?.partNumbers(id)
    if (res?.success && res.data) setPartNumbers(res.data)
  }

  const handlePartNumberChange = async (val: string) => {
    const id = Number(val)
    const item = partNumbers.find((p) => p.id === id)
    setSelectedPartNumberId(id)
    setPartNumber(item?.name ?? '')
    setProjectName('')
    setComponentNames([])
    const res = await window.api?.masterData?.componentNames(id)
    if (res?.success && res.data) setComponentNames(res.data)
  }

  const handleComponentNameChange = (val: string) => {
    const id = Number(val)
    const item = componentNames.find((c) => c.id === id)
    setProjectName(item?.name ?? '')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.api) return
    const finalUnitNumber = isMultiLot
      ? (unitFrom.trim() && unitTo.trim() ? `${unitFrom.trim()}〜${unitTo.trim()}` : '')
      : unitNumber.trim()

    const missing: string[] = []
    if (!companyName) missing.push('客先')
    if (!modelType) missing.push('機種')
    if (!partNumber) missing.push('図面番号(品番)')
    if (!projectName) missing.push('名称')
    if (!finalUnitNumber) missing.push('号機')
    if (!deadline) missing.push('納期（案）')
    if (!requestContent.trim()) missing.push('内容')
    if (!groupName) missing.push('グループ')
    if (!inputByUserName) missing.push('入力者')
    if (missing.length > 0) {
      setError(`必須項目を入力してください: ${missing.join(' / ')}`)
      return
    }

    setSaving(true)
    setError(null)
    const res = await window.api.projects.create({
      company_id: companyName,
      deadline,
      project_name: projectName,
      model_type: modelType,
      part_number: partNumber,
      unit_number: finalUnitNumber,
      revision: revision.trim() || undefined,
      request_content: requestContent.trim(),
      input_by_user_id: inputByUserName,
      group_id: groupName,
    })
    setSaving(false)
    if (res.success) {
      showToast('案件を登録しました')
      onSave()
      onOpenChange(false)
    } else {
      setError(res.error ?? '保存に失敗しました')
    }
  }

  const noMaster = customers.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新規案件登録</DialogTitle>
        </DialogHeader>
        {noMaster && (
          <p className="text-sm text-amber-600 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
            マスターDBが未接続です。設定画面からマスターDBを選択してください。
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="space-y-2">
            <Label>客先</Label>
            <Select
              value={selectedCustomerId?.toString() ?? ''}
              onValueChange={handleCustomerChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="客先を選択" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>機種</Label>
              <Select
                value={selectedModelId?.toString() ?? ''}
                onValueChange={handleModelChange}
                disabled={!selectedCustomerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedCustomerId ? '機種を選択' : '客先を先に選択'} />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>図面番号(品番)</Label>
              <Select
                value={selectedPartNumberId?.toString() ?? ''}
                onValueChange={handlePartNumberChange}
                disabled={!selectedModelId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedModelId ? '図面番号(品番)を選択' : '機種を先に選択'} />
                </SelectTrigger>
                <SelectContent>
                  {partNumbers.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>名称</Label>
              <Select
                value={componentNames.find((c) => c.name === projectName)?.id.toString() ?? ''}
                onValueChange={handleComponentNameChange}
                disabled={!selectedPartNumberId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedPartNumberId ? '名称を選択' : '図面番号(品番)を先に選択'} />
                </SelectTrigger>
                <SelectContent>
                  {componentNames.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>号機</Label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={!isMultiLot}
                    onChange={(e) => setIsMultiLot(!e.target.checked)}
                  />
                  少数ロット
                </label>
              </div>
              {isMultiLot ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={unitFrom}
                    onChange={(e) => setUnitFrom(e.target.value)}
                    placeholder="開始"
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground">〜</span>
                  <Input
                    value={unitTo}
                    onChange={(e) => setUnitTo(e.target.value)}
                    placeholder="終了"
                    className="flex-1"
                  />
                </div>
              ) : (
                <Input
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  placeholder="号機を入力"
                />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>リビジョン（任意）</Label>
            <Input
              value={revision}
              onChange={(e) => setRevision(e.target.value)}
              placeholder="例: A / 01"
            />
          </div>

          <div className="space-y-2">
            <Label>納期（案）</Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>内容</Label>
            <Textarea
              value={requestContent}
              onChange={(e) => setRequestContent(e.target.value)}
              rows={4}
              placeholder="内容を入力"
            />
          </div>

          <div className="space-y-2">
            <Label>グループ</Label>
            <Select value={groupName} onValueChange={setGroupName}>
              <SelectTrigger>
                <SelectValue placeholder="グループを選択" />
              </SelectTrigger>
              <SelectContent>
                {groupNames.map((g) => (
                  <SelectItem key={g.id} value={g.name}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>入力者</Label>
            <Select value={inputByUserName} onValueChange={setInputByUserName}>
              <SelectTrigger>
                <SelectValue placeholder="入力者を選択" />
              </SelectTrigger>
              <SelectContent>
                {userNames.map((u) => (
                  <SelectItem key={u.id} value={u.name}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

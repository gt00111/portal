import { useState, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react'
import { showToast } from './Toaster'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { useAuth } from '../contexts/AuthContext'
import type { ProjectWithRelations, ProjectFile } from 'shared'

interface ProjectOverviewProps {
  project: ProjectWithRelations
  onUpdate: () => void
}

export interface ProjectOverviewRef {
  save: () => Promise<boolean>
}

export const ProjectOverview = forwardRef<ProjectOverviewRef, ProjectOverviewProps>(
  function ProjectOverview({ project, onUpdate }, ref) {
  const { canEdit } = useAuth()
  const [companyName, setCompanyName] = useState(project.company_id)
  const [deadline, setDeadline] = useState(project.deadline === '9999-12-31' ? '' : project.deadline)
  const [projectName, setProjectName] = useState(project.project_name ?? '')
  const [modelType, setModelType] = useState(project.model_type ?? '')
  const [partNumber, setPartNumber] = useState(project.part_number ?? '')
  const [revision, setRevision] = useState(project.revision ?? '')
  const [unitNumber, setUnitNumber] = useState(project.unit_number ?? '')
  const [requestContent, setRequestContent] = useState(project.request_content ?? '')
  const [groupName, setGroupName] = useState(project.group_id ?? '')
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [notes, setNotes] = useState(project.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const fetchProjectFiles = useCallback(async () => {
    if (!window.api?.projectFiles?.listByProject) return
    const res = await window.api.projectFiles.listByProject(project.id)
    if (res.success && res.data) {
      setProjectFiles(res.data)
    }
  }, [project.id])

  useEffect(() => {
    setCompanyName(project.company_id)
    setDeadline(project.deadline === '9999-12-31' ? '' : project.deadline)
    setProjectName(project.project_name ?? '')
    setModelType(project.model_type ?? '')
    setPartNumber(project.part_number ?? '')
    setRevision(project.revision ?? '')
    setUnitNumber(project.unit_number ?? '')
    setRequestContent(project.request_content ?? '')
    setGroupName(project.group_id ?? '')
    setNotes(project.notes ?? '')
    setFileError(null)
  }, [project])

  useEffect(() => {
    fetchProjectFiles()
  }, [fetchProjectFiles])

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!window.api) return false
    setSaveError(null)

    const missing: string[] = []
    if (!companyName.trim()) missing.push('客先')
    if (!modelType.trim()) missing.push('機種')
    if (!partNumber.trim()) missing.push('図面番号(品番)')
    if (!projectName.trim()) missing.push('名称')
    if (!unitNumber.trim()) missing.push('号機')
    if (!deadline) missing.push('納期')
    if (!requestContent.trim()) missing.push('内容')
    if (!groupName.trim()) missing.push('グループ')
    if (missing.length > 0) {
      setSaveError(`必須項目を入力してください: ${missing.join(' / ')}`)
      return false
    }

    setSaving(true)
    const res = await window.api.projects.update({
      id: project.id,
      company_id: companyName.trim(),
      deadline: deadline || '9999-12-31',
      project_name: projectName.trim() || undefined,
      model_type: modelType.trim() || undefined,
      part_number: partNumber.trim() || undefined,
      revision: revision.trim() || undefined,
      unit_number: unitNumber.trim() || undefined,
      request_content: requestContent.trim() || undefined,
      group_id: groupName.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    setSaving(false)
    if (res.success) {
      showToast('案件を更新しました')
      onUpdate()
      return true
    }
    setSaveError(res.error ?? '保存に失敗しました')
    return false
  }, [
    project.id,
    companyName,
    deadline,
    projectName,
    modelType,
    partNumber,
    revision,
    unitNumber,
    requestContent,
    groupName,
    notes,
    onUpdate,
  ])

  const handleAddProjectFile = async () => {
    if (!window.api?.db?.selectProjectFile || !window.api?.projectFiles?.add) return
    setFileError(null)
    const filePath = await window.api.db.selectProjectFile()
    if (!filePath) return
    const res = await window.api.projectFiles.add(project.id, filePath)
    if (!res.success) {
      setFileError(res.error ?? 'ファイルの追加に失敗しました')
      return
    }
    await fetchProjectFiles()
  }

  const handleRemoveProjectFile = async (id: string) => {
    if (!window.api?.projectFiles?.remove) return
    const res = await window.api.projectFiles.remove(id)
    if (!res.success) {
      setFileError(res.error ?? 'ファイルの削除に失敗しました')
      return
    }
    await fetchProjectFiles()
  }

  const handleOpenProjectFile = async (id: string) => {
    if (!window.api?.projectFiles?.open) return
    const res = await window.api.projectFiles.open(id)
    if (!res.success) {
      setFileError(res.error ?? 'ファイルを開けませんでした')
    }
  }

  const handleDownloadAll = async () => {
    if (!window.api?.projectFiles?.downloadAll) return
    const res = await window.api.projectFiles.downloadAll(project.id)
    if (!res.success) {
      setFileError(res.error ?? '一括ダウンロードに失敗しました')
      return
    }
    setFileError(null)
  }

  useImperativeHandle(ref, () => ({
    save: handleSave,
  }))

  const isBeforeApproval = ['draft', 'submitted'].includes(project.status)

  return (
    <div className="max-w-3xl space-y-5">
      <section className="overflow-hidden rounded-lg border">
        <div className="bg-primary px-5 py-2.5">
          <h2 className="text-sm font-semibold text-primary-foreground">基本情報</h2>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">客先名</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="客先名"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">グループ</Label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="グループ"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{isBeforeApproval ? '納期（案・会議で検討）' : '納期'}</Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border">
        <div className="bg-primary px-5 py-2.5">
          <h2 className="text-sm font-semibold text-primary-foreground">製品情報</h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">名称</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="名称"
              disabled={!canEdit}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">機種</Label>
              <Input
                value={modelType}
                onChange={(e) => setModelType(e.target.value)}
                placeholder="機種"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">図面番号(品番)</Label>
              <Input
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder="図面番号(品番)"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">号機</Label>
              <Input
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder="号機"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">リビジョン</Label>
              <Input
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                placeholder="例: A / 01（任意）"
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border">
        <div className="bg-primary px-5 py-2.5">
          <h2 className="text-sm font-semibold text-primary-foreground">依頼内容・備考</h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">内容</Label>
            <Textarea
              value={requestContent}
              onChange={(e) => setRequestContent(e.target.value)}
              rows={4}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">備考</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              disabled={!canEdit}
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between bg-primary px-5 py-2.5">
          <h2 className="text-sm font-semibold text-primary-foreground">提供ファイル</h2>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={handleDownloadAll}
            >
              一括ダウンロード
            </Button>
            {canEdit && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onClick={handleAddProjectFile}
              >
                ファイル追加
              </Button>
            )}
          </div>
        </div>
        <div className="p-5">
          {fileError ? <p className="mb-2 text-xs text-destructive">{fileError}</p> : null}
          <div className="rounded-md border">
            {projectFiles.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">ファイルがありません</p>
            ) : (
              <ul className="divide-y">
                {projectFiles.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{f.file_name}</p>
                      <p className="truncate text-muted-foreground">{f.file_path}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleOpenProjectFile(f.id)}
                      >
                        開く
                      </Button>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-500 hover:text-red-700"
                          onClick={() => handleRemoveProjectFile(f.id)}
                        >
                          削除
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {saveError && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="px-8">
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      )}
    </div>
  )
})

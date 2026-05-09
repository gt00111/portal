import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy } from 'lucide-react'
import { showToast } from '../components/Toaster'
import { Button } from '../components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { StatusBadge } from '../components/StatusBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ProjectOverview, type ProjectOverviewRef } from '../components/ProjectOverview'
import { ProjectGantt } from '../components/ProjectGantt'
import { useAuth } from '../contexts/AuthContext'
import type { ProjectWithRelations } from 'shared'
import { seisanPath } from '../paths'

type ConfirmAction = 'start' | 'done' | 'undoDone' | 'duplicate' | null

const CONFIRM_CONFIG: Record<Exclude<ConfirmAction, null>, { title: string; desc: string; label: string }> = {
  start:     { title: '案件を着手', desc: '案件ステータスを「進行中」に変更します。よろしいですか？', label: '着手する' },
  done:      { title: '案件を完了', desc: '案件ステータスを「完了」に変更します。よろしいですか？', label: '完了にする' },
  undoDone:  { title: '完了解除', desc: '案件ステータスを「進行中」に差し戻します。よろしいですか？', label: '差し戻す' },
  duplicate: { title: '案件を複製', desc: 'この案件をコピーして新規案件（下書き）を作成します。よろしいですか？', label: '複製する' },
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { canEdit, canApprove } = useAuth()
  const [project, setProject] = useState<ProjectWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const overviewRef = useRef<ProjectOverviewRef>(null)

  const fetchData = useCallback(async () => {
    if (!window.api || !id) return
    const projectRes = await window.api.projects.get(id)
    if (projectRes.success && projectRes.data) {
      setProject(projectRes.data)
      setNotFound(false)
    } else {
      setNotFound(true)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    setLoading(true)
    setProject(null)
    setNotFound(false)
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const onRefresh = () => fetchData()
    window.addEventListener('seisan:refresh', onRefresh)
    return () => window.removeEventListener('seisan:refresh', onRefresh)
  }, [fetchData])

  const handleSubmit = async () => {
    if (!window.api || !id) return
    const saved = await overviewRef.current?.save()
    if (saved === false) return
    const res = await window.api.projects.submit(id)
    if (res.success) {
      showToast('案件を提出しました')
      fetchData()
    } else {
      setErrorMsg(res.error ?? '提出に失敗しました')
    }
  }

  const handleApprove = async () => {
    if (!window.api || !id) return
    const res = await window.api.projects.approve(id)
    if (res.success) {
      showToast('案件を承認しました')
      fetchData()
    } else {
      setErrorMsg(res.error ?? '承認に失敗しました')
    }
  }

  const executeConfirmAction = async () => {
    if (!window.api || !id || !project) return
    const action = confirmAction
    setConfirmAction(null)
    setErrorMsg(null)

    switch (action) {
      case 'start': {
        const res = await window.api.projects.updateStatus(id, 'in_progress')
        if (res.success) {
          showToast('案件を着手しました')
          fetchData()
        } else {
          setErrorMsg(res.error ?? '着手に失敗しました')
        }
        break
      }
      case 'done': {
        const res = await window.api.projects.updateStatus(id, 'done')
        if (res.success) {
          showToast('案件を完了しました')
          fetchData()
        } else {
          setErrorMsg(res.error ?? '完了に失敗しました')
        }
        break
      }
      case 'undoDone': {
        const res = await window.api.projects.updateStatus(id, 'in_progress')
        if (res.success) {
          showToast('完了を解除しました')
          fetchData()
        } else {
          setErrorMsg(res.error ?? '差し戻しに失敗しました')
        }
        break
      }
      case 'duplicate': {
        const res = await window.api.projects.create({
          company_id: project.company_id,
          model_type: project.model_type ?? undefined,
          part_number: project.part_number ?? undefined,
          revision: project.revision ?? undefined,
          project_name: project.project_name ?? undefined,
          unit_number: undefined,
          deadline: undefined,
          request_content: project.request_content ?? undefined,
          group_id: project.group_id ?? undefined,
          input_by_user_id: project.input_by_user_id,
          notes: project.notes ?? undefined,
        })
        if (res.success && res.data) {
          showToast('案件を複製しました')
          navigate(seisanPath(`projects/${(res.data as { id: string }).id}`))
        } else {
          setErrorMsg(res.error ?? '複製に失敗しました')
        }
        break
      }
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center p-8">読み込み中...</div>
  }

  if (notFound || !project) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">案件が見つかりませんでした</p>
        <Button variant="outline" onClick={() => navigate(seisanPath('projects'))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          案件一覧に戻る
        </Button>
      </div>
    )
  }

  const cfg = confirmAction ? CONFIRM_CONFIG[confirmAction] : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(seisanPath('projects'))}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {project.project_no ?? '案件'} - {project.company_name}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={project.status} type="project" />
            {canEdit && project.status === 'draft' && (
              <Button size="sm" onClick={handleSubmit}>
                提出
              </Button>
            )}
            {canApprove && project.status === 'submitted' && (
              <Button size="sm" onClick={handleApprove}>
                承認
              </Button>
            )}
            {canEdit && project.status === 'approved' && (
              <Button size="sm" variant="outline" onClick={() => setConfirmAction('start')}>
                案件を着手
              </Button>
            )}
            {canEdit && project.status === 'in_progress' && (
              <Button size="sm" variant="outline" onClick={() => setConfirmAction('done')}>
                案件を完了
              </Button>
            )}
            {canEdit && project.status === 'done' && (
              <Button size="sm" variant="outline" onClick={() => setConfirmAction('undoDone')}>
                完了解除（差し戻し）
              </Button>
            )}
            {canEdit && !['draft', 'submitted'].includes(project.status) && (
              <>
                <span className="mx-1 h-4 w-px bg-border" />
                <Button size="sm" variant="ghost" onClick={() => setConfirmAction('duplicate')}>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  複製
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">概要</TabsTrigger>
          <TabsTrigger value="gantt">工程</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <ProjectOverview
            key={id}
            ref={overviewRef}
            project={project}
            onUpdate={fetchData}
          />
        </TabsContent>
        <TabsContent value="gantt">
          <ProjectGantt
            key={`gantt-${id}`}
            projectId={project.id}
            projectStatus={project.status}
            projectNo={project.project_no ?? undefined}
            parentRowName={`${project.project_no ?? '案件'} - ${project.company_name}`}
            parentBarLabel={project.part_number ?? project.project_no ?? '案件'}
            parentGroupName={project.group_name}
          />
        </TabsContent>
      </Tabs>

      {cfg && (
        <ConfirmDialog
          open={confirmAction !== null}
          title={cfg.title}
          description={cfg.desc}
          confirmLabel={cfg.label}
          onConfirm={executeConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}

import { Badge } from './ui/badge'
import type { ProjectStatus, TaskStatus } from 'shared'
import { PROJECT_STATUS_LABELS, TASK_STATUS_LABELS } from 'shared'

interface StatusBadgeProps {
  status: ProjectStatus | TaskStatus
  type?: 'project' | 'task'
}

const PROJECT_VARIANTS = {
  draft: 'draft',
  submitted: 'submitted',
  approved: 'approved',
  in_planning: 'in_planning',
  in_progress: 'in_progress',
  done: 'done',
  canceled: 'canceled',
} as const

const TASK_VARIANTS = {
  planned: 'planned',
  in_progress: 'in_progress',
  done: 'done',
} as const

export function StatusBadge({ status, type = 'project' }: StatusBadgeProps) {
  const label =
    type === 'project'
      ? PROJECT_STATUS_LABELS[status as ProjectStatus]
      : TASK_STATUS_LABELS[status as TaskStatus]
  const variant =
    type === 'project'
      ? (PROJECT_VARIANTS[status as ProjectStatus] ?? 'default')
      : (TASK_VARIANTS[status as keyof typeof TASK_VARIANTS] ?? "default");

  return <Badge variant={variant as 'draft' | 'submitted' | 'approved' | 'done' | 'planned'}>{label}</Badge>
}

import type { IpcResponse } from "@shared/ipcResponse.js";
import type { ProcessTemplate } from "@shared/seisan/processTemplate.js";
import type { Project, ProjectWithRelations } from "@shared/seisan/project.js";
import type { ProjectFile } from "@shared/seisan/projectFile.js";
import type { Task as DbTask, TaskWithProject } from "@shared/seisan/task.js";

export {};

interface MasterItem {
  id: number
  name: string
}

type UserRole = 'viewer' | 'editor' | 'approver'

interface UserPermission {
  user_name: string
  role: UserRole
  created_at: string
  updated_at: string
}

type IpcRes<T> = Promise<{ success: boolean; data?: T; error?: string }>

declare global {
  interface Window {
    api?: {
      invoke: <T = unknown>(channel: string, data?: unknown) => Promise<IpcResponse<T>>
      on?: (channel: string, listener: (...args: unknown[]) => void) => () => void
      db: {
        getPath: () => Promise<string | null>
        selectFile: () => Promise<string | null>
        selectProjectFile: () => Promise<string | null>
        createNew: () => Promise<string | null>
        connect: (path: string) => Promise<{ success: boolean; error?: string }>
        status: () => Promise<{ connected: boolean; path: string | null }>
      }
      processTemplates: {
        list: (activeOnly?: boolean) => IpcRes<ProcessTemplate[]>
        create: (input: {
          name: string
          sort_order?: number
          default_days?: number
          color?: string | null
          is_active?: number
        }) => IpcRes<ProcessTemplate>
        update: (input: {
          id: string
          name?: string
          sort_order?: number
          default_days?: number
          color?: string | null
          is_active?: number
        }) => IpcRes<ProcessTemplate>
        delete: (id: string) => IpcRes<void>
      }
      projectFiles: {
        listByProject: (projectId: string) => IpcRes<ProjectFile[]>
        add: (projectId: string, filePath: string) => IpcRes<ProjectFile>
        open: (id: string) => IpcRes<void>
        downloadAll: (projectId: string) => IpcRes<string>
        remove: (id: string) => IpcRes<void>
      }
      import: {
        downloadFormat: () => IpcRes<string>
        downloadCsvTemplate: () => IpcRes<string>
        selectCsv: () => IpcRes<string>
        exportCsv: (csvContent: string) => IpcRes<string>
      }
      projects: {
        list: (filter?: {
          status?: string[]
          company_id?: string
          group_id?: string
          deadline_from?: string
          deadline_to?: string
          created_from?: string
          created_to?: string
          search?: string
          sort_by?: 'deadline' | 'created_at' | 'priority'
          sort_order?: 'asc' | 'desc'
          limit?: number
          offset?: number
        }) => IpcRes<{ items: ProjectWithRelations[]; total: number }>
        get: (id: string) => IpcRes<ProjectWithRelations>
        create: (input: {
          company_id: string
          deadline?: string
          project_name?: string
          request_content?: string
          input_by_user_id: string
          group_id?: string
          priority?: number
          model_type?: string
          part_number?: string
          unit_number?: string
          revision?: string
          notes?: string
        }) => IpcRes<Project>
        update: (input: {
          id: string
          company_id?: string
          deadline?: string
          project_name?: string
          request_content?: string
          group_id?: string
          priority?: number
          model_type?: string
          part_number?: string
          unit_number?: string
          revision?: string
          notes?: string
        }) => IpcRes<Project>
        submit: (id: string) => IpcRes<Project>
        approve: (id: string) => IpcRes<Project>
        updateStatus: (id: string, status: string) => IpcRes<Project>
      }
      tasks: {
        listByProject: (projectId: string, includeDone?: boolean) => IpcRes<DbTask[]>
        listAll: (filter?: {
          status?: string[]
          resource_id?: string
          group_id?: string
          date_from?: string
          date_to?: string
          include_done?: boolean
          search?: string
        }) => IpcRes<TaskWithProject[]>
        create: (input: {
          project_id: string
          parent_task_id: string
          text: string
          start_date: string
          end_date: string
          task_type?: 'task' | 'milestone'
          sort_order?: number
          depends_on_task_id?: string
          process_template_id?: string | null
        }) => IpcRes<DbTask>
        update: (input: {
          id: string
          text?: string
          start_date?: string
          end_date?: string
          progress?: number
          status?: string
          sort_order?: number
          depends_on_task_id?: string | null
          actual_start_date?: string | null
          actual_end_date?: string | null
        }) => IpcRes<DbTask>
        updateDates: (id: string, start: string, end: string) => IpcRes<DbTask>
        updateSort: (tasks: { id: string; sort_order: number }[]) => IpcRes<void>
        updateStatus: (id: string, status: string) => IpcRes<DbTask>
        delete: (id: string) => IpcRes<void>
        initProjectTask: (projectId: string) => IpcRes<DbTask>
        createFromDeadline: (projectId: string, meetingDate?: string) => IpcRes<DbTask[]>
      }
      userPermissions: {
        list: () => IpcRes<UserPermission[]>
        getRole: (userName: string) => IpcRes<UserRole>
        setRole: (userName: string, role: UserRole) => IpcRes<UserPermission>
        remove: (userName: string) => IpcRes<void>
      }
      masterData: {
        status: () => Promise<{ path: string | null; connected: boolean }>
        selectFile: () => IpcRes<string>
        disconnect: () => IpcRes<void>
        customers: () => IpcRes<MasterItem[]>
        models: (customerId: number) => IpcRes<MasterItem[]>
        partNumbers: (modelId: number) => IpcRes<MasterItem[]>
        componentNames: (partNumberId: number) => IpcRes<MasterItem[]>
        allModels: () => IpcRes<MasterItem[]>
        allPartNumbers: () => IpcRes<MasterItem[]>
        allComponentNames: () => IpcRes<MasterItem[]>
        groupNames: () => IpcRes<MasterItem[]>
        userNames: () => IpcRes<MasterItem[]>
        distinctCompanies: () => IpcRes<string[]>
        distinctGroups: () => IpcRes<string[]>
      }
    }
  }
}

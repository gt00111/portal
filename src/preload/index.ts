import { contextBridge, ipcRenderer } from "electron";

import { SEISAN_CHANNELS } from "@shared/seisan/channels.js";
import type { IpcResponse } from "@shared/ipcResponse.js";

// eslint-disable-next-line no-console
console.info("[preload] script start");

async function invokeSeisan<T>(channel: string, data?: unknown): Promise<IpcResponse<T>> {
  return (await ipcRenderer.invoke(channel, data)) as IpcResponse<T>;
}

const api = {
  invoke: (channel: string, data?: unknown) => ipcRenderer.invoke(channel, data),

  db: {
    getPath: async (): Promise<string | null> => {
      const r = await invokeSeisan<string | null>(SEISAN_CHANNELS.db.getPath, undefined);
      return r.success && r.data !== undefined ? r.data : null;
    },
    selectFile: async (): Promise<string | null> => {
      const r = await invokeSeisan<string | null>(SEISAN_CHANNELS.db.selectFile, undefined);
      return r.success && r.data !== undefined ? r.data : null;
    },
    selectProjectFile: async (): Promise<string | null> => {
      const r = await invokeSeisan<string | null>(SEISAN_CHANNELS.db.selectProjectFile, undefined);
      return r.success && r.data !== undefined ? r.data : null;
    },
    createNew: async (): Promise<string | null> => {
      const r = await invokeSeisan<string | null>(SEISAN_CHANNELS.db.createNew, undefined);
      return r.success && r.data !== undefined ? r.data : null;
    },
    connect: (path: string) => invokeSeisan<void>(SEISAN_CHANNELS.db.connect, path),
    status: async (): Promise<{ connected: boolean; path: string | null }> => {
      const r = await invokeSeisan<{ connected: boolean; path: string | null }>(
        SEISAN_CHANNELS.db.status,
        undefined
      );
      if (r.success && r.data) {
        return r.data;
      }
      return { connected: false, path: null };
    },
  },

  processTemplates: {
    list: (activeOnly?: boolean) =>
      invokeSeisan(SEISAN_CHANNELS.template.list, activeOnly),
    create: (input: unknown) => invokeSeisan(SEISAN_CHANNELS.template.create, input),
    update: (input: unknown) => invokeSeisan(SEISAN_CHANNELS.template.update, input),
    delete: (id: string) => invokeSeisan(SEISAN_CHANNELS.template.delete, { id }),
  },

  projectFiles: {
    listByProject: (projectId: string) =>
      invokeSeisan(SEISAN_CHANNELS.file.listByProject, { project_id: projectId }),
    add: (projectId: string, filePath: string) =>
      invokeSeisan(SEISAN_CHANNELS.file.add, { project_id: projectId, file_path: filePath }),
    open: (id: string) => invokeSeisan(SEISAN_CHANNELS.file.open, { id }),
    downloadAll: (projectId: string) =>
      invokeSeisan(SEISAN_CHANNELS.file.downloadAll, { project_id: projectId }),
    remove: (id: string) => invokeSeisan(SEISAN_CHANNELS.file.remove, { id }),
  },

  import: {
    downloadFormat: () => invokeSeisan(SEISAN_CHANNELS.import.downloadFormat, undefined),
    downloadCsvTemplate: () =>
      invokeSeisan(SEISAN_CHANNELS.import.downloadCsvTemplate, undefined),
    selectCsv: () => invokeSeisan(SEISAN_CHANNELS.import.selectCsv, undefined),
    exportCsv: (csvContent: string) =>
      invokeSeisan(SEISAN_CHANNELS.import.exportCsv, csvContent),
  },

  projects: {
    list: (filter?: unknown) => invokeSeisan(SEISAN_CHANNELS.project.list, filter),
    get: (id: string) => invokeSeisan(SEISAN_CHANNELS.project.get, { id }),
    create: (input: unknown) => invokeSeisan(SEISAN_CHANNELS.project.create, input),
    update: (input: unknown) => invokeSeisan(SEISAN_CHANNELS.project.update, input),
    submit: (id: string) => invokeSeisan(SEISAN_CHANNELS.project.submit, { id }),
    approve: (id: string) => invokeSeisan(SEISAN_CHANNELS.project.approve, { id }),
    updateStatus: (id: string, status: string) =>
      invokeSeisan(SEISAN_CHANNELS.project.updateStatus, { id, status }),
  },

  tasks: {
    listByProject: (projectId: string, includeDone?: boolean) =>
      invokeSeisan(SEISAN_CHANNELS.task.listByProject, {
        project_id: projectId,
        include_done: includeDone,
      }),
    listAll: (filter?: unknown) => invokeSeisan(SEISAN_CHANNELS.task.listAll, filter),
    create: (input: unknown) => invokeSeisan(SEISAN_CHANNELS.task.create, input),
    update: (input: unknown) => invokeSeisan(SEISAN_CHANNELS.task.update, input),
    updateDates: (id: string, startDate: string, endDate: string) =>
      invokeSeisan(SEISAN_CHANNELS.task.updateDates, {
        id,
        start_date: startDate,
        end_date: endDate,
      }),
    updateSort: (tasks: { id: string; sort_order: number }[]) =>
      invokeSeisan(SEISAN_CHANNELS.task.updateSort, { tasks }),
    updateStatus: (id: string, status: string) =>
      invokeSeisan(SEISAN_CHANNELS.task.updateStatus, { id, status }),
    delete: (id: string) => invokeSeisan(SEISAN_CHANNELS.task.delete, { id }),
    initProjectTask: (projectId: string) =>
      invokeSeisan(SEISAN_CHANNELS.task.initProjectTask, { project_id: projectId }),
    createFromDeadline: (projectId: string, meetingDate?: string) =>
      invokeSeisan(SEISAN_CHANNELS.task.createFromDeadline, {
        project_id: projectId,
        meeting_date: meetingDate,
      }),
  },

  userPermissions: {
    list: () => invokeSeisan(SEISAN_CHANNELS.permission.list, undefined),
    getRole: (userName: string) => invokeSeisan(SEISAN_CHANNELS.permission.getRole, userName),
    setRole: (userName: string, role: string) =>
      invokeSeisan(SEISAN_CHANNELS.permission.setRole, { user_name: userName, role }),
    remove: (userName: string) => invokeSeisan(SEISAN_CHANNELS.permission.remove, userName),
  },

  masterData: {
    status: async (): Promise<{ path: string | null; connected: boolean }> => {
      const r = await invokeSeisan<{ path: string | null; connected: boolean }>(
        SEISAN_CHANNELS.master.status,
        undefined
      );
      if (r.success && r.data) {
        return r.data;
      }
      return { path: null, connected: false };
    },
    selectFile: () => invokeSeisan<string>(SEISAN_CHANNELS.master.selectFile, undefined),
    disconnect: () => invokeSeisan(SEISAN_CHANNELS.master.disconnect, undefined),
    customers: () => invokeSeisan(SEISAN_CHANNELS.master.customers, undefined),
    models: (customerId: number) => invokeSeisan(SEISAN_CHANNELS.master.models, customerId),
    partNumbers: (modelId: number) => invokeSeisan(SEISAN_CHANNELS.master.partNumbers, modelId),
    componentNames: (partNumberId: number) =>
      invokeSeisan(SEISAN_CHANNELS.master.componentNames, partNumberId),
    allModels: () => invokeSeisan(SEISAN_CHANNELS.master.allModels, undefined),
    allPartNumbers: () => invokeSeisan(SEISAN_CHANNELS.master.allPartNumbers, undefined),
    allComponentNames: () => invokeSeisan(SEISAN_CHANNELS.master.allComponentNames, undefined),
    groupNames: () => invokeSeisan(SEISAN_CHANNELS.master.groupNames, undefined),
    userNames: () => invokeSeisan(SEISAN_CHANNELS.master.userNames, undefined),
    distinctCompanies: () =>
      invokeSeisan(SEISAN_CHANNELS.master.distinctCompanies, undefined),
    distinctGroups: () => invokeSeisan(SEISAN_CHANNELS.master.distinctGroups, undefined),
  },
};

try {
  // 常に contextBridge を使う（contextIsolation: true が前提）。
  // `process.contextIsolated` は環境によって undefined になりうるが、そのとき `!undefined` が true となり
  // 誤って globalThis だけに載せてメイン World に api が届かないバグになる。
  contextBridge.exposeInMainWorld("api", api);
  // eslint-disable-next-line no-console
  console.info("[preload] api exposed via contextBridge");
} catch (error) {
  // eslint-disable-next-line no-console
  console.error("[preload] failed to expose api", error);
}

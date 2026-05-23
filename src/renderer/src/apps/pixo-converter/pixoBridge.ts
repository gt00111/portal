import type { IpcResponse } from "@shared/ipcResponse.js";
import { PIXO_CHANNELS, type PixoProgressEvent } from "@shared/pixo/channels.js";

declare global {
  interface Window {
    /** PixoConverter 移植版: 内蔵ルート内で `PixoConverterApp` が設定 */
    electronAPI?: PixoElectronApi;
  }
}

export type PixoElectronApi = {
  selectPDF: () => Promise<string[]>;
  convertPDF: (filePath: string, format?: string) => Promise<string[] | { error: string }>;
  saveOutputImages: () => Promise<{ success: boolean; error?: string }>;
  resetTempDirs: () => Promise<{ success: boolean; error?: string }>;
  selectTIFF: () => Promise<string[]>;
  convertTIFFtoPDF: (filePath: string) => Promise<{ success?: boolean; path?: string; error?: string }>;
  selectImages: () => Promise<string[]>;
  convertImageToPDF: (filePath: string) => Promise<{ success?: boolean; path?: string; error?: string }>;
  selectMargePDF: () => Promise<string[]>;
  mergePDFs: (filePaths: string[]) => Promise<{ success: boolean; path?: string; error?: string }>;
  mergeAndSavePDF: (filePaths: string[], savePath: string) => Promise<{ success: boolean; error?: string }>;
  saveMergedPDF: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
  copyPDFFile: (src: string, dest: string) => Promise<{ success: boolean; error?: string }>;
  deleteTempFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  readFileAsDataURL: (filePath: string) => Promise<{ success: boolean; dataURL?: string; error?: string }>;
  selectPDFFiles: () => Promise<string[]>;
  getPdfPages: (filePath: string) => Promise<{
    success: boolean;
    pages?: { index: number; number: number; thumbnail: unknown }[];
    error?: string;
  }>;
  getPdfPageCount: (filePath: string) => Promise<
    { success: true; pageCount: number } | { success: false; error: string }
  >;
  manipulatePdfPage: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    outputPath?: string;
    error?: string;
  }>;
  savePDF: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
  saveTempFile: (params: { fileName: string; data: Uint8Array | number[] }) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;
  /** 重い処理の進捗イベントを購読。返却された関数で解除 */
  onProgress: (listener: (event: PixoProgressEvent) => void) => () => void;
};

async function inv<T>(channel: string, data?: unknown): Promise<T> {
  const api = window.api;
  if (!api?.invoke) {
    throw new Error("window.api.invoke が利用できません");
  }
  const res = (await api.invoke(channel, data)) as IpcResponse<T>;
  if (!res.success) {
    throw new Error(res.error ?? "IPC error");
  }
  return res.data as T;
}

/** preload と同じメソッド形のブリッジ（`pixo-converter:*`） */
export const pixoElectronApi: PixoElectronApi = {
  selectPDF: () => inv<string[]>(PIXO_CHANNELS.openPdf),
  convertPDF: (filePath, format) =>
    inv<string[] | { error: string }>(PIXO_CHANNELS.convertPdf, { filePath, format }),
  saveOutputImages: () => inv(PIXO_CHANNELS.saveOutputImages),
  resetTempDirs: () => inv(PIXO_CHANNELS.resetTempDirs),
  selectTIFF: () => inv<string[]>(PIXO_CHANNELS.openTiff),
  convertTIFFtoPDF: (filePath) => inv(PIXO_CHANNELS.convertTiff, filePath),
  selectImages: () => inv<string[]>(PIXO_CHANNELS.openImages),
  convertImageToPDF: (filePath) => inv(PIXO_CHANNELS.convertImage, filePath),
  selectMargePDF: () => inv<string[]>(PIXO_CHANNELS.openPdf),
  mergePDFs: (filePaths) => inv(PIXO_CHANNELS.mergePdfs, filePaths),
  mergeAndSavePDF: (filePaths, savePath) =>
    inv(PIXO_CHANNELS.mergeAndSave, { filePaths, savePath }),
  saveMergedPDF: () => inv(PIXO_CHANNELS.mergeSaveDialog),
  copyPDFFile: (src, dest) =>
    inv(PIXO_CHANNELS.copyPdf, { sourcePath: src, targetPath: dest }),
  deleteTempFile: (filePath) => inv(PIXO_CHANNELS.deleteTempFile, filePath),
  readFileAsDataURL: (filePath) => inv(PIXO_CHANNELS.readAsDataUrl, filePath),
  selectPDFFiles: () => inv<string[]>(PIXO_CHANNELS.openPdf),
  getPdfPages: (filePath) => inv(PIXO_CHANNELS.getPdfPages, filePath),
  getPdfPageCount: (filePath) =>
    inv<{ success: true; pageCount: number } | { success: false; error: string }>(
      PIXO_CHANNELS.getPdfPageCount,
      filePath,
    ),
  manipulatePdfPage: (params) => inv(PIXO_CHANNELS.manipulatePage, params),
  savePDF: () => inv(PIXO_CHANNELS.savePdfDialog),
  saveTempFile: (params) => inv(PIXO_CHANNELS.saveTempFile, params),
  onProgress: (listener) => {
    const sub = window.api?.on?.bind(window.api);
    if (typeof sub !== "function") {
      return () => {
        /* no-op when running outside Electron */
      };
    }
    return sub(PIXO_CHANNELS.progress, (...args: unknown[]) => {
      const event = args[0] as PixoProgressEvent | undefined;
      if (event && typeof event === "object") {
        listener(event);
      }
    });
  },
};

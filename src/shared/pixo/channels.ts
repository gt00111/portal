/** PixoConverter 内蔵版 IPC（`module:action`） */
export const PIXO_CHANNELS = {
  openPdf: "pixo-converter:openPdf",
  convertPdf: "pixo-converter:convertPdf",
  saveOutputImages: "pixo-converter:saveOutputImages",
  resetTempDirs: "pixo-converter:resetTempDirs",
  openTiff: "pixo-converter:openTiff",
  convertTiff: "pixo-converter:convertTiff",
  openImages: "pixo-converter:openImages",
  convertImage: "pixo-converter:convertImage",
  mergePdfs: "pixo-converter:mergePdfs",
  mergeAndSave: "pixo-converter:mergeAndSave",
  mergeSaveDialog: "pixo-converter:mergeSaveDialog",
  copyPdf: "pixo-converter:copyPdf",
  deleteTempFile: "pixo-converter:deleteTempFile",
  readAsDataUrl: "pixo-converter:readAsDataUrl",
  getPdfPages: "pixo-converter:getPdfPages",
  getPdfPageCount: "pixo-converter:getPdfPageCount",
  manipulatePage: "pixo-converter:manipulatePage",
  savePdfDialog: "pixo-converter:savePdfDialog",
  saveTempFile: "pixo-converter:saveTempFile",
  /** 進捗イベント送信先（webContents.send） */
  progress: "pixo-converter:progress",
} as const;

/** 重い処理の進捗イベント */
export interface PixoProgressEvent {
  /** 処理 ID（同時並行実行を区別） */
  jobId: string;
  /** 何の処理か */
  stage:
    | "merge:prepare"
    | "merge:chunk"
    | "merge:final"
    | "image:resize"
    | "image:embed";
  /** 0〜1 の進捗（合計件数が分からない場合は 0） */
  ratio: number;
  /** 現在の件数（任意） */
  current?: number;
  /** 合計件数（任意） */
  total?: number;
  /** 補足メッセージ */
  message?: string;
}


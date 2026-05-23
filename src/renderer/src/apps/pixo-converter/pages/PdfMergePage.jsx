// renderer/pages/PdfMergePage.jsx — Acrobat 風ワークスペース
import { useEffect, useState } from "react";
import PdfMergeWorkspace from "../components/PdfMergeWorkspace.jsx";
import SinglePdfPreview from "../components/SinglePdfPreview";
import LoadingModal from "../components/LoadingModal";
import { useToastContext } from "../contexts/ToastContext";
import { resetPageState } from "../utils/pageHelpers";

export default function PdfMergePage() {
  const [pdfFiles, setPdfFiles] = useState([]);
  const [convertedImages, setConvertedImages] = useState([]);
  const [isConverted, setIsConverted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState({ ratio: 0, message: "結合準備中…" });
  const { addToast } = useToastContext();

  useEffect(() => {
    const sub = window.api?.on;
    if (typeof sub !== "function") return undefined;
    const off = sub("pixo-converter:progress", (...args) => {
      const event = args[0];
      if (!event || typeof event !== "object") return;
      const ratio = typeof event.ratio === "number" ? Math.min(Math.max(event.ratio, 0), 1) : 0;
      let message = "結合中…";
      if (typeof event.current === "number" && typeof event.total === "number" && event.total > 0) {
        message = `${event.current} / ${event.total} 件処理中…`;
      }
      if (event.stage === "merge:final") message = "最終結合中…";
      if (event.message) message = event.message;
      setProgress({ ratio, message });
    });
    return () => {
      try {
        off?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const handleConvert = async () => {
    if (!pdfFiles.length) {
      addToast("PDFファイルが選択されていません", "warning");
      return;
    }

    setIsLoading(true);
    setProgress({ ratio: 0, message: `${pdfFiles.length} 件の結合準備中…` });
    try {
      const filePaths = pdfFiles.map((file) => file.path);
      const result = await window.electronAPI.mergePDFs(filePaths);

      if (result.success && result.path) {
        setConvertedImages([result.path]);
        setIsConverted(true);
        addToast("PDFの結合が完了しました", "success");
      } else {
        addToast("PDFの結合に失敗しました: " + (result.error || "不明なエラー"), "error");
      }
    } finally {
      setIsLoading(false);
      setProgress({ ratio: 0, message: "結合準備中…" });
    }
  };

  const handleSave = async () => {
    if (!convertedImages.length) {
      addToast("保存対象がありません", "warning");
      return;
    }

    const result = await window.electronAPI.saveMergedPDF();
    if (!result.success) {
      addToast("保存がキャンセルされました", "warning");
      return;
    }

    const sourcePath = convertedImages[0];
    const targetPath = result.filePath;

    const saveResult = await window.electronAPI.copyPDFFile(sourcePath, targetPath);
    if (saveResult.success) {
      addToast("PDFを保存しました！", "success");
      resetPageState({
        setFiles: setPdfFiles,
        setConvertedFiles: setConvertedImages,
        setIsConverted,
      });
    } else {
      addToast("保存に失敗しました: " + saveResult.error, "error");
    }
  };

  const handleCancel = async () => {
    const result = await window.electronAPI.resetTempDirs();
    if (!result.success) {
      addToast("一時ファイルの初期化に失敗しました: " + result.error, "error");
      return;
    }
    resetPageState({
      setFiles: setPdfFiles,
      setConvertedFiles: setConvertedImages,
      setIsConverted,
    });
  };

  return (
    <div>
      <div className="page-title">PDF ファイル連結</div>
      <div className="main-text" style={{ marginBottom: "0.75rem" }}>
        複数の PDF を 1 つにまとめます。ドキュメントの並びがそのままページ順になります。
      </div>

      <PdfMergeWorkspace
        pdfFiles={pdfFiles}
        onFileSelect={setPdfFiles}
        onConvert={handleConvert}
        onSave={handleSave}
        onCancel={handleCancel}
        isConverted={isConverted}
        isLoading={isLoading}
      />

      {isConverted && convertedImages.length > 0 && (
        <SinglePdfPreview filePath={convertedImages[0]} heading="＜連結PDFプレビュー＞" />
      )}

      {isLoading && (
        <LoadingModal
          message={progress.message}
          progress={Math.round(progress.ratio * 100)}
        />
      )}
    </div>
  );
}

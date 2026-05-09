// renderer/pages/PdfMergePage.jsx
import { useState } from "react";
import MergeDropArea from "../components/MergeDropArea";
import SinglePdfPreview from "../components/SinglePdfPreview";
import LoadingModal from "../components/LoadingModal";
import { useToastContext } from "../contexts/ToastContext";
import { resetPageState } from "../utils/pageHelpers";

export default function PdfMergePage() {
  const [pdfFiles, setPdfFiles] = useState([]);
  const [convertedImages, setConvertedImages] = useState([]);
  const [isConverted, setIsConverted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToastContext();

  const handleConvert = async () => {
    if (!pdfFiles.length) {
      addToast("PDFファイルが選択されていません", "warning");
      return;
    }

    setIsLoading(true); // 🔵 ローディング表示開始

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
      setIsLoading(false); // 🔴 ローディング非表示
    }
  };

  

  const handleSave = async () => {
  if (!convertedImages.length) {
    addToast("保存対象がありません", "warning");
    return;
  }

  const result = await window.electronAPI.saveMergedPDF(); // 保存先パス取得
  if (!result.success) {
    addToast("保存がキャンセルされました", "warning");
    return;
  }

  const sourcePath = convertedImages[0]; // 一時フォルダのPDFパス
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
      <div className="page-title">
        PDFファイル連結
      </div>

      <div className="main-text">
        PDFファイルを連結して1PDFファイルに変換します。
      </div>

      <MergeDropArea
        selectedFile={pdfFiles}
        onFileSelect={setPdfFiles}
        onConvert={handleConvert}
        onSave={handleSave}
        onCancel={handleCancel}
        isConverted={isConverted}
      />

      {isConverted && convertedImages.length > 0 && (
        <SinglePdfPreview filePath={convertedImages[0]} />
      )}

      {isLoading && <LoadingModal />}
    </div>
  );
}

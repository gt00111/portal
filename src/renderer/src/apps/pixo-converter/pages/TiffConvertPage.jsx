// renderer/pages/TiffConvertPage.jsx
import { useState } from "react";
import TiffDropArea from "./../components/TiffDropArea";
import PdfPreview from "../components/PdfPreview";
import LoadingModal from "../components/LoadingModal";
import { useToastContext } from "../contexts/ToastContext";
import { resetPageState } from "../utils/pageHelpers";

export default function TiffConvertPage() {
  const [tiffFiles, setTiffFiles] = useState([]);
  const [convertedImages, setConvertedImages] = useState([]);
  const [isConverted, setIsConverted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToastContext();

  const handleConvert = async () => {
    if (!tiffFiles.length) {
      addToast("TIFFファイルが選択されていません", "warning");
      return;
    }

    setIsLoading(true); // 🔵 ローディング表示開始
    const allPDFs = [];

    for (const file of tiffFiles) {
      const result = await window.electronAPI.convertTIFFtoPDF(file.path);
      console.log("🔍 TIFF変換結果:", result);

      if (result.success && result.path) {
        allPDFs.push(result.path);
      } else {
        console.warn("⚠️ TIFF変換結果が配列でない:", result);
        addToast(`変換エラー（${file.name}）: ${result?.error || "不明なエラー"}`, "error");
      }
    }

    setIsLoading(false); // 🔴 ローディング非表示

    if (allPDFs.length > 0) {
      setConvertedImages(allPDFs); // ここではPDFのパス
      setIsConverted(true);
      addToast(`${allPDFs.length}個のPDFに変換しました`, "success");
    }
  };

  const handleSave = async () => {
    const result = await window.electronAPI.saveOutputImages();
    if (result.success) {
      addToast("保存が完了しました！", "success");
      resetPageState({
        setFiles: setTiffFiles,
        setConvertedFiles: setConvertedImages,
        setIsConverted,
      });
    } else {
      addToast("保存に失敗しました: " + result.error, "error");
    }
  };

  const handleCancel = async () => {
    const result = await window.electronAPI.resetTempDirs();
    if (!result.success) {
      addToast("一時ファイルの初期化に失敗しました: " + result.error, "error");
      return;
    }
    resetPageState({
      setFiles: setTiffFiles,
      setConvertedFiles: setConvertedImages,
      setIsConverted,
    });
  };

  return (
    <div>
      <div className="page-title">
        TIFF/TIF → PDF 変換
      </div>

      <div className="main-text">
        TIFF/TIFファイルをPDFのフォーマットに変換します。
      </div>

      <TiffDropArea
        selectedFile={tiffFiles}
        onFileSelect={setTiffFiles}
        onConvert={handleConvert}
        onSave={handleSave}
        onCancel={handleCancel}
        isConverted={isConverted}
      />

      <PdfPreview pdfFiles={convertedImages} />

      {isLoading && <LoadingModal />}
    </div>
  );
}

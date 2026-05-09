// renderer/pages/ImageConvertPage.jsx
import { useState } from "react";
import ImageDropArea from "../components/ImageDropArea";
import PdfPreview from "../components/PdfPreview";
import "./../components/style/maintext.css";
import LoadingModal from "../components/LoadingModal";
import { useToastContext } from "../contexts/ToastContext";
import { resetPageState } from "../utils/pageHelpers";

export default function ImageConvertPage() {
  const [imageFiles, setImageFiles] = useState([]);
  const [convertedImages, setConvertedImages] = useState([]);
  const [isConverted, setIsConverted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToastContext();

  const handleConvert = async () => {
    if (!imageFiles.length) {
      addToast("PNG/JPGファイルが選択されていません", "warning");
      return;
    }

    setIsLoading(true); // 🔵 ローディング表示開始

    const allPDFs = [];

    for (const file of imageFiles) {
      const result = await window.electronAPI.convertImageToPDF(file.path);

      if (result?.success && result.path) {
        allPDFs.push(result.path);
      } else {
        addToast(`変換エラー（${file.name}）: ${result?.error || "不明なエラー"}`, "error");
      }
    }

    setIsLoading(false); // 🔴 ローディング非表示

    if (allPDFs.length > 0) {
      setConvertedImages(allPDFs);
      setIsConverted(true);
      addToast(`${allPDFs.length}個のPDFに変換しました`, "success");
    }
  };

  const handleSave = async () => {
    const result = await window.electronAPI.saveOutputImages();
    if (result.success) {
      addToast("保存が完了しました！", "success");
      resetPageState({
        setFiles: setImageFiles,
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
      setFiles: setImageFiles,
      setConvertedFiles: setConvertedImages,
      setIsConverted,
    });
  };

  return (
    <div>
      <div className="page-title">
        PNG/JPG → PDF 変換
      </div>

      <div className="main-text">
        PNG/JPGファイルをPDFのフォーマットに変換します。
      </div>

      <ImageDropArea
        selectedFile={imageFiles}
        onFileSelect={setImageFiles}
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

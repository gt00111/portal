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
  const [progress, setProgress] = useState({ ratio: 0, message: "変換中…" });
  const { addToast } = useToastContext();

  const handleConvert = async () => {
    if (!imageFiles.length) {
      addToast("PNG/JPGファイルが選択されていません", "warning");
      return;
    }

    setIsLoading(true);

    const allPDFs = [];
    const total = imageFiles.length;

    for (let i = 0; i < imageFiles.length; i += 1) {
      const file = imageFiles[i];
      setProgress({
        ratio: i / total,
        message: `${i + 1} / ${total} 件目を変換中… (${file.name})`,
      });
      const result = await window.electronAPI.convertImageToPDF(file.path);

      if (result?.success && result.path) {
        allPDFs.push(result.path);
      } else {
        addToast(`変換エラー（${file.name}）: ${result?.error || "不明なエラー"}`, "error");
      }
    }

    setProgress({ ratio: 1, message: "完了" });
    setIsLoading(false);

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

      {isLoading && (
        <LoadingModal
          message={progress.message}
          progress={Math.round(progress.ratio * 100)}
        />
      )}
    </div>
  );
}

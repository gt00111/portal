// renderer/pages/PdfConvertPage.jsx
import { useState } from "react";
import ConvertDropArea from "./../components/ConvertDropArea";
import ConvertResult from "../components/ConvertResult";
import LoadingModal from "../components/LoadingModal";
import { useToastContext } from "../contexts/ToastContext";
import { resetPageState } from "../utils/pageHelpers";

export default function PdfConvertPage() {
  const [pdfFiles, setPdfFiles] = useState([]); // ✅ 配列に変更
  const [format, setFormat] = useState("png");
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
    const allImages = [];

    for (const file of pdfFiles) {
      const filePath = file.path;

      if (!filePath || typeof filePath !== "string") {
        addToast("ファイルパスが取得できませんでした", "error");
        continue;
      }

      let result;
      try {
        result = await window.electronAPI.convertPDF(filePath, format);
      } catch (e) {
        addToast(
          `変換エラー（${file.name}）: ${e instanceof Error ? e.message : String(e)}`,
          "error",
        );
        continue;
      }

      if (Array.isArray(result)) {
        allImages.push(...result);
      } else {
        addToast(`変換エラー（${file.name}）: ${result?.error || "原因不明"}`, "error");
      }
    }

    setIsLoading(false); // 🔴 ローディング非表示

    if (allImages.length > 0) {
      setConvertedImages(allImages);
      setIsConverted(true);
      addToast(`${allImages.length}個の画像に変換しました`, "success");
    } else {
      addToast("1つも変換できませんでした", "error");
    }
  };

  // 保存ボタンを押したときだけ保存ダイアログが出る
  const handleSave = async () => {
    const result = await window.electronAPI.saveOutputImages();

    if (result.success) {
      addToast("保存が完了しました！", "success");

      // ✅ 保存成功時に状態リセット
      resetPageState({
        setFiles: setPdfFiles,
        setConvertedFiles: setConvertedImages,
        setIsConverted,
        setFormat,
      });
    } else {
      addToast("保存に失敗しました: " + result.error, "error");
    }
  };

  const handleCancel = async () => {
    // メインプロセス側の一時フォルダを初期化
    const result = await window.electronAPI.resetTempDirs();
    if (!result.success) {
      addToast("一時ファイルの初期化に失敗しました: " + result.error, "error");
      return;
    }

    // React 側の状態もリセット
    resetPageState({
      setFiles: setPdfFiles,
      setConvertedFiles: setConvertedImages,
      setIsConverted,
      setFormat,
    });
  };

  return (
    <div>
      <div className="page-title">
        PDF → JPG/PNG 変換ページ
      </div>

      <div className="main-text">
        PDFファイルをJPEG、PNGのフォーマットに変換します。
        <br />
        PDFの複数ページは分解して1ページずつに変換されます。
      </div>

      <ConvertDropArea
        selectedFile={pdfFiles}
        onFileSelect={setPdfFiles}
        selectedFormat={format}
        onFormatChange={setFormat}
        onConvert={handleConvert}
        onSave={handleSave}
        onCancel={handleCancel}
        isConverted={isConverted}
      />

      <ConvertResult images={convertedImages} />

      {isLoading && <LoadingModal />}
    </div>
  );
}

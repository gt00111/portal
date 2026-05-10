// renderer/pages/PdfReplacePage.jsx — Acrobat 風ワークスペース
import { useState } from "react";
import LoadingModal from "../components/LoadingModal";
import PdfReplaceWorkspace from "../components/PdfReplaceWorkspace.jsx";
import { useToastContext } from "../contexts/ToastContext";
import SinglePdfPreview from "../components/SinglePdfPreview";

export default function PdfReplacePage() {
  const [sourceFile, setSourceFile] = useState(null);
  const [targetFile, setTargetFile] = useState(null);
  const [targetPages, setTargetPages] = useState([]);
  const [selectedPageIndex, setSelectedPageIndex] = useState(null);
  const [selectedPageIndices, setSelectedPageIndices] = useState(() => new Set());
  const [operationType, setOperationType] = useState("replace");
  const [resultFile, setResultFile] = useState(null);
  const [targetPdfDataUrl, setTargetPdfDataUrl] = useState(null);
  /** 対象PDFの版履歴（先頭＝最初に開いたファイル、末尾＝現在の作業版） */
  const [editHistoryPaths, setEditHistoryPaths] = useState([]);
  const [isConverted, setIsConverted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToastContext();

  const handleOperationTypeChange = (newType) => {
    setOperationType(newType);
    setSelectedPageIndex(null);
    setSelectedPageIndices(new Set());
  };

  const handlePageToggle = (index) => {
    const next = new Set(selectedPageIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedPageIndices(next);
  };

  const handlePageThumbClick = (index) => {
    if (operationType === "delete") handlePageToggle(index);
    else setSelectedPageIndex(index);
  };

  const handleSourceFileSelect = async () => {
    const files = await window.electronAPI.selectPDFFiles();
    if (files && files.length > 0) {
      const filePath = files[0];
      const fileName = filePath.split(/[\\/]/).pop();
      setSourceFile({ path: filePath, name: fileName });
      addToast("PDFを選択しました", "success");
    }
  };

  const handleTargetFileSelect = async () => {
    const files = await window.electronAPI.selectPDFFiles();
    if (files && files.length > 0) {
      const filePath = files[0];
      if (!filePath || typeof filePath !== "string") {
        addToast("ファイルパスを取得できませんでした", "error");
        return;
      }
      const fileName = filePath.split(/[\\/]/).pop();
      setTargetPdfDataUrl(null);
      setTargetFile({ path: filePath, name: fileName });
      setResultFile(null);
      setIsConverted(false);
      setEditHistoryPaths([]);

      setIsLoading(true);
      try {
        const [pagesResult, dataRes] = await Promise.all([
          window.electronAPI.getPdfPages(filePath),
          window.electronAPI.readFileAsDataURL(filePath),
        ]);
        if (pagesResult.success && pagesResult.pages) {
          setTargetPages(pagesResult.pages);
          setSelectedPageIndex(null);
          setSelectedPageIndices(new Set());
          setEditHistoryPaths([filePath]);
          addToast(`${pagesResult.pages.length}ページのPDFを読み込みました`, "success");
        } else {
          addToast("PDFの読み込みに失敗しました: " + (pagesResult.error || ""), "error");
          setEditHistoryPaths([]);
        }
        if (dataRes.success && dataRes.dataURL) {
          setTargetPdfDataUrl(dataRes.dataURL);
        } else {
          setTargetPdfDataUrl(null);
        }
      } catch (error) {
        addToast("エラーが発生しました: " + error.message, "error");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleClearSource = () => setSourceFile(null);

  const handleClearTarget = () => {
    setTargetFile(null);
    setTargetPages([]);
    setSelectedPageIndex(null);
    setSelectedPageIndices(new Set());
    setResultFile(null);
    setTargetPdfDataUrl(null);
    setEditHistoryPaths([]);
    setIsConverted(false);
  };

  const handleExecute = async () => {
    if (operationType !== "delete" && !sourceFile) {
      addToast("操作用PDFを選択してください", "warning");
      return;
    }

    if (!targetFile) {
      addToast("対象PDFを選択してください", "warning");
      return;
    }

    if (operationType === "delete") {
      if (selectedPageIndices.size === 0) {
        addToast("削除するページを選択してください", "warning");
        return;
      }
    } else if (selectedPageIndex === null) {
      addToast("操作するページを選択してください", "warning");
      return;
    }

    setIsLoading(true);

    try {
      let result;
      if (operationType === "delete") {
        const pageIndices = Array.from(selectedPageIndices).sort((a, b) => a - b);
        result = await window.electronAPI.manipulatePdfPage({
          sourcePdfPath: null,
          targetPdfPath: targetFile.path,
          pageIndices,
          operation: operationType,
        });
      } else {
        result = await window.electronAPI.manipulatePdfPage({
          sourcePdfPath: sourceFile.path,
          targetPdfPath: targetFile.path,
          pageIndex: selectedPageIndex,
          operation: operationType,
        });
      }

      if (result.success) {
        const out = result.outputPath;
        const name = out.split(/[\\/]/).pop() ?? "document.pdf";
        const deletedPageCount = operationType === "delete" ? selectedPageIndices.size : 0;
        setEditHistoryPaths((prev) => [...prev, out]);
        setTargetFile({ path: out, name });
        setResultFile(out);
        setSourceFile(null);
        setSelectedPageIndex(null);
        setSelectedPageIndices(new Set());

        const [pagesResult, dataRes] = await Promise.all([
          window.electronAPI.getPdfPages(out),
          window.electronAPI.readFileAsDataURL(out),
        ]);
        if (pagesResult.success && pagesResult.pages) {
          setTargetPages(pagesResult.pages);
        } else {
          addToast("結果PDFの再読込に失敗しました: " + (pagesResult.error || ""), "warning");
        }
        if (dataRes.success && dataRes.dataURL) {
          setTargetPdfDataUrl(dataRes.dataURL);
        } else {
          setTargetPdfDataUrl(null);
        }

        if (operationType === "replace") {
          setIsConverted(false);
          addToast("差し替えが完了しました。このまま別のページを選んで続けられます。", "success");
        } else {
          setIsConverted(true);
          const messages = {
            insertBefore: "ページの挿入（前）が完了しました",
            insertAfter: "ページの挿入（後）が完了しました",
            delete: `${deletedPageCount}ページの削除が完了しました`,
          };
          addToast(messages[operationType], "success");
        }
      } else {
        addToast("操作に失敗しました: " + result.error, "error");
      }
    } catch (error) {
      addToast("エラーが発生しました: " + error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!resultFile) {
      addToast("保存対象がありません", "warning");
      return;
    }

    const result = await window.electronAPI.savePDF();
    if (!result.success) {
      addToast("保存がキャンセルされました", "warning");
      return;
    }

    const saveResult = await window.electronAPI.copyPDFFile(resultFile, result.filePath);
    if (saveResult.success) {
      addToast("PDFを保存しました！", "success");
      await handleCancel();
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
    setSourceFile(null);
    setTargetFile(null);
    setTargetPages([]);
    setSelectedPageIndex(null);
    setSelectedPageIndices(new Set());
    setResultFile(null);
    setTargetPdfDataUrl(null);
    setEditHistoryPaths([]);
    setIsConverted(false);
  };

  const handleUndo = async () => {
    if (editHistoryPaths.length <= 1) {
      addToast("これ以上元に戻せません", "warning");
      return;
    }

    setIsLoading(true);
    try {
      const next = editHistoryPaths.slice(0, -1);
      const path = next[next.length - 1];
      if (!path || typeof path !== "string") {
        addToast("履歴の復元に失敗しました", "error");
        return;
      }

      setEditHistoryPaths(next);
      const name = path.split(/[\\/]/).pop() ?? "document.pdf";
      setTargetFile({ path, name });
      setResultFile(path);
      setSourceFile(null);
      setSelectedPageIndex(null);
      setSelectedPageIndices(new Set());
      setIsConverted(false);

      const [pagesResult, dataRes] = await Promise.all([
        window.electronAPI.getPdfPages(path),
        window.electronAPI.readFileAsDataURL(path),
      ]);
      if (pagesResult.success && pagesResult.pages) {
        setTargetPages(pagesResult.pages);
      } else {
        addToast("PDFの再読込に失敗しました: " + (pagesResult.error || ""), "error");
      }
      if (dataRes.success && dataRes.dataURL) {
        setTargetPdfDataUrl(dataRes.dataURL);
      } else {
        setTargetPdfDataUrl(null);
      }
      addToast("直前の操作を元に戻しました", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const executeDisabled =
    (operationType !== "delete" && !sourceFile) ||
    !targetFile ||
    targetPages.length === 0 ||
    (operationType === "delete" ? selectedPageIndices.size === 0 : selectedPageIndex === null);

  const executeLabels = {
    replace: "差し替えを実行",
    insertBefore: "前に挿入",
    insertAfter: "後に挿入",
    delete: `選択ページを削除（${selectedPageIndices.size}）`,
  };

  return (
    <div>
      <div className="page-title">PDFページ編集</div>
      <div className="main-text" style={{ marginBottom: "0.75rem" }}>
        対象 PDF のページを差し替え・前後への挿入・削除ができます。「元に戻す」で直前の版に戻せます。「やり直す」は作業をすべて破棄して一時ファイルも初期化します。
      </div>

      <PdfReplaceWorkspace
        operationType={operationType}
        onOperationTypeChange={handleOperationTypeChange}
        sourceFile={sourceFile}
        targetFile={targetFile}
        targetPages={targetPages}
        selectedPageIndex={selectedPageIndex}
        selectedPageIndices={selectedPageIndices}
        onSourceFileSelect={handleSourceFileSelect}
        onTargetFileSelect={handleTargetFileSelect}
        onClearSource={handleClearSource}
        onClearTarget={handleClearTarget}
        onPageThumbClick={handlePageThumbClick}
        isConverted={isConverted}
        isLoading={isLoading}
        executeDisabled={executeDisabled}
        executeLabel={executeLabels[operationType] ?? "実行"}
        onExecute={handleExecute}
        onSave={handleSave}
        onCancel={handleCancel}
        onUndo={handleUndo}
        canUndo={editHistoryPaths.length > 1}
        resultFile={resultFile}
        targetPdfDataUrl={targetPdfDataUrl}
      />

      {resultFile && <SinglePdfPreview filePath={resultFile} heading="＜編集結果プレビュー＞" />}

      {isLoading && <LoadingModal />}
    </div>
  );
}

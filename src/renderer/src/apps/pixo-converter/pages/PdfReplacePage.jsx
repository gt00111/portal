// renderer/pages/PdfReplacePage.jsx
import { useState } from "react";
import LoadingModal from "../components/LoadingModal";
import { useToastContext } from "../contexts/ToastContext";
import { resetPageState } from "../utils/pageHelpers";
import SinglePdfPreview from "../components/SinglePdfPreview";
import "../components/style/pdfreplace.css";
import "../components/style/droparea.css";
import "../components/style/filelist.css";

export default function PdfReplacePage() {
  const [sourceFile, setSourceFile] = useState(null); // 操作用PDFファイル
  const [targetFile, setTargetFile] = useState(null); // 対象PDFファイル
  const [targetPages, setTargetPages] = useState([]); // 対象PDFのページ一覧
  const [selectedPageIndex, setSelectedPageIndex] = useState(null); // 選択されたページ（単一選択用）
  const [selectedPageIndices, setSelectedPageIndices] = useState(new Set()); // 選択されたページ（複数選択用）
  const [operationType, setOperationType] = useState("replace"); // replace, insertBefore, insertAfter, delete
  const [resultFile, setResultFile] = useState(null); // 処理後のファイル
  const [isConverted, setIsConverted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToastContext();

  // 操作タイプ変更時に選択をリセット
  const handleOperationTypeChange = (newType) => {
    setOperationType(newType);
    setSelectedPageIndex(null);
    setSelectedPageIndices(new Set());
  };

  // 削除モードでのページ選択（複数選択）
  const handlePageToggle = (index) => {
    const newIndices = new Set(selectedPageIndices);
    if (newIndices.has(index)) {
      newIndices.delete(index);
    } else {
      newIndices.add(index);
    }
    setSelectedPageIndices(newIndices);
  };

  // 操作用ファイル選択
  const handleSourceFileSelect = async () => {
    const files = await window.electronAPI.selectPDFFiles();
    if (files && files.length > 0) {
      const filePath = files[0];
      const fileName = filePath.split(/[\\/]/).pop();
      setSourceFile({ path: filePath, name: fileName });
      addToast("PDFを選択しました", "success");
    }
  };


  // 対象PDFファイル選択
  const handleTargetFileSelect = async () => {
    const files = await window.electronAPI.selectPDFFiles();
    if (files && files.length > 0) {
      const filePath = files[0];
      if (!filePath || typeof filePath !== "string") {
        addToast("ファイルパスを取得できませんでした", "error");
        return;
      }
      const fileName = filePath.split(/[\\/]/).pop();
      setTargetFile({ path: filePath, name: fileName });
      
      // PDFページ情報取得
      setIsLoading(true);
      try {
        const pagesResult = await window.electronAPI.getPdfPages(filePath);
        if (pagesResult.success) {
          setTargetPages(pagesResult.pages);
          addToast(`${pagesResult.pages.length}ページのPDFを読み込みました`, "success");
        } else {
          addToast("PDFの読み込みに失敗しました: " + (pagesResult.error || ""), "error");
        }
      } catch (error) {
        addToast("エラーが発生しました: " + error.message, "error");
      } finally {
        setIsLoading(false);
      }
    }
  };


  // ページ操作実行
  const handleExecute = async () => {
    if (operationType !== "delete" && !sourceFile) {
      addToast("操作用PDFを選択してください", "warning");
      return;
    }

    if (!targetFile) {
      addToast("対象PDFを選択してください", "warning");
      return;
    }

    // 削除モードの場合は複数選択をチェック、それ以外は単一選択をチェック
    if (operationType === "delete") {
      if (selectedPageIndices.size === 0) {
        addToast("削除するページを選択してください", "warning");
        return;
      }
    } else {
      if (selectedPageIndex === null) {
        addToast("操作するページを選択してください", "warning");
        return;
      }
    }

    setIsLoading(true);

    try {
      let result;
      if (operationType === "delete") {
        // 複数ページ削除
        const pageIndices = Array.from(selectedPageIndices).sort((a, b) => a - b);
        result = await window.electronAPI.manipulatePdfPage({
          sourcePdfPath: null,
          targetPdfPath: targetFile.path,
          pageIndices: pageIndices,
          operation: operationType,
        });
      } else {
        // 単一ページ操作
        result = await window.electronAPI.manipulatePdfPage({
          sourcePdfPath: sourceFile.path,
          targetPdfPath: targetFile.path,
          pageIndex: selectedPageIndex,
          operation: operationType,
        });
      }

      if (result.success) {
        setResultFile(result.outputPath);
        setIsConverted(true);
        const messages = {
          replace: "ページの差し替えが完了しました",
          insertBefore: "ページの挿入（前）が完了しました",
          insertAfter: "ページの挿入（後）が完了しました",
          delete: `${selectedPageIndices.size}ページの削除が完了しました`,
        };
        addToast(messages[operationType], "success");
      } else {
        addToast("操作に失敗しました: " + result.error, "error");
      }
    } catch (error) {
      addToast("エラーが発生しました: " + error.message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // 保存
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
      handleCancel();
    } else {
      addToast("保存に失敗しました: " + saveResult.error, "error");
    }
  };

  // キャンセル
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
    setIsConverted(false);
  };

  return (
    <div>
      <div className="page-title">PDFページ編集</div>

      <div className="main-text">
        PDFのページを差し替えたり、新しいページを挿入できます
      </div>

      {/* 操作タイプ選択 */}
      <div className="selector-wrapper">
        <p>操作を選択</p>
        <div className="selector-options">
          <button
            className={`selector-button ${operationType === "replace" ? "selected" : ""}`}
            onClick={() => handleOperationTypeChange("replace")}
          >
            ページを差し替え
          </button>
          <button
            className={`selector-button ${operationType === "insertBefore" ? "selected" : ""}`}
            onClick={() => handleOperationTypeChange("insertBefore")}
          >
            ページの前に挿入
          </button>
          <button
            className={`selector-button ${operationType === "insertAfter" ? "selected" : ""}`}
            onClick={() => handleOperationTypeChange("insertAfter")}
          >
            ページの後に挿入
          </button>
          <button
            className={`selector-button ${operationType === "delete" ? "selected" : ""}`}
            onClick={() => handleOperationTypeChange("delete")}
          >
            ページを削除
          </button>
        </div>
      </div>

      <div className="replace-container-new">
        {/* 操作用PDFエリア */}
        <div className="drop-area">
          <p>
            {operationType === "replace"
              ? "差し替え用"
              : operationType === "delete"
                ? "削除操作では不要です（無視されます）"
                : "挿入用"}PDFファイルを選択してください
          </p>
          <button
            onClick={handleSourceFileSelect}
            className="button-base btn-select"
            disabled={operationType === "delete"}
            style={operationType === "delete" ? { opacity: 0.5, cursor: "not-allowed" } : {}}
          >
            ファイルを選択
          </button>

          {sourceFile && operationType !== "delete" && (
            <div style={{ marginTop: "20px", textAlign: "center" }}>
              <p><strong>＜選択されたファイル＞</strong></p>
              <ul className="file-list">
                <li className="file-item">
                  <span className="file-item-name">{sourceFile.name}</span>
                  <button
                    onClick={() => setSourceFile(null)}
                    className="file-remove-button"
                    title="削除"
                  >
                    ×
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* 対象PDFエリア */}
        <div className="drop-area">
          <p>対象PDFファイル（複数ページ）を選択してください</p>
          <button onClick={handleTargetFileSelect} className="button-base btn-select">
            ファイルを選択
          </button>

          {targetFile && (
            <div style={{ marginTop: "20px", textAlign: "center" }}>
              <p><strong>＜選択されたファイル: {targetPages.length}ページ＞</strong></p>
              <ul className="file-list">
                <li className="file-item">
                  <span className="file-item-name">{targetFile.name}</span>
                  <button
                    onClick={() => {
                      setTargetFile(null);
                      setTargetPages([]);
                      setSelectedPageIndex(null);
                      setSelectedPageIndices(new Set());
                    }}
                    className="file-remove-button"
                    title="削除"
                  >
                    ×
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ページ選択エリア */}
      {targetPages.length > 0 && (
        <div className="page-selector-container">
          <h4 className="page-selector-title-centered">
            {operationType === "replace" && "差し替えるページを選択"}
            {operationType === "insertBefore" && "この前に挿入するページを選択"}
            {operationType === "insertAfter" && "この後に挿入するページを選択"}
            {operationType === "delete" && `削除するページを選択（${selectedPageIndices.size}ページ選択中）`}
          </h4>
          <div className="page-grid-centered">
            {targetPages.map((page, index) => (
              <div
                key={index}
                className={`page-item ${
                  operationType === "delete"
                    ? selectedPageIndices.has(index) ? "selected" : ""
                    : selectedPageIndex === index ? "selected" : ""
                }`}
                onClick={() => {
                  if (operationType === "delete") {
                    handlePageToggle(index);
                  } else {
                    setSelectedPageIndex(index);
                  }
                }}
              >
                <div className="page-number">{index + 1}</div>
                {page.thumbnail && (
                  <img
                    src={page.thumbnail}
                    alt={`Page ${index + 1}`}
                    className="page-thumbnail"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ボタンエリア */}
      <div className="button-group">
        {!isConverted ? (
          <button
            className="button-base btn-convert"
            onClick={handleExecute}
            disabled={
              (operationType !== "delete" && !sourceFile) ||
              !targetFile ||
              (operationType === "delete" ? selectedPageIndices.size === 0 : selectedPageIndex === null)
            }
          >
            {operationType === "replace" && "ページを差し替える"}
            {operationType === "insertBefore" && "ページを挿入（前）"}
            {operationType === "insertAfter" && "ページを挿入（後）"}
            {operationType === "delete" && `ページを削除（${selectedPageIndices.size}ページ）`}
          </button>
        ) : (
          <>
            <button className="button-base btn-save" onClick={handleSave}>
              保存
            </button>
            <button className="button-base btn-cancel" onClick={handleCancel}>
              キャンセル
            </button>
          </>
        )}
      </div>

      {/* プレビュー表示（処理後） */}
      {isConverted && resultFile && (
        <SinglePdfPreview filePath={resultFile} />
      )}

      {isLoading && <LoadingModal />}
    </div>
  );
}

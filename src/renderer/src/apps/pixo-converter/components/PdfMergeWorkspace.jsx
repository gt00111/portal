import { useCallback, useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import MergePdfCardThumb from "./MergePdfCardThumb.jsx";
import { useToastContext } from "../contexts/ToastContext.jsx";
import "./style/merge-workspace.css";

/**
 * Acrobat 風：ツールバー + 横スクロールのドキュメント帯（ドラッグで並べ替え）
 */
export default function PdfMergeWorkspace({
  pdfFiles,
  onFileSelect,
  onConvert,
  onSave,
  onCancel,
  isConverted,
  isLoading,
}) {
  const { addToast } = useToastContext();
  const [pageCounts, setPageCounts] = useState({});

  const loadPageCounts = useCallback(async (files) => {
    const next = {};
    if (!window.electronAPI?.getPdfPageCount) return;
    for (const file of files) {
      if (!file?.path) continue;
      try {
        const r = await window.electronAPI.getPdfPageCount(file.path);
        if (r.success && typeof r.pageCount === "number") {
          next[file.path] = r.pageCount;
        } else {
          next[file.path] = null;
        }
      } catch {
        next[file.path] = null;
      }
    }
    setPageCounts(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadPageCounts(pdfFiles);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfFiles, loadPageCounts]);

  const handleAddFiles = async () => {
    try {
      if (!window.electronAPI) {
        addToast("electronAPI が利用できません。", "error");
        return;
      }
      const filePaths = await window.electronAPI.selectMargePDF();
      if (filePaths && filePaths.length > 0) {
        const files = filePaths.map((path) => ({
          name: path.split(/[\\/]/).pop(),
          path,
        }));
        onFileSelect((prev) => [...prev, ...files]);
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(pdfFiles);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    onFileSelect(reordered);
  };

  const handleRemoveFile = async (indexToRemove) => {
    const fileToDelete = pdfFiles[indexToRemove];
    if (fileToDelete?.path && window.electronAPI?.deleteTempFile) {
      await window.electronAPI.deleteTempFile(fileToDelete.path);
    }
    const updated = pdfFiles.filter((_, index) => index !== indexToRemove);
    onFileSelect(updated);
  };

  const sortByName = (dir) => {
    const sorted = [...pdfFiles].sort((a, b) => {
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return dir === "asc" ? nameA.localeCompare(nameB, "ja") : nameB.localeCompare(nameA, "ja");
    });
    onFileSelect(sorted);
  };

  const totalPages = pdfFiles.reduce((sum, f) => {
    const n = pageCounts[f.path];
    return sum + (typeof n === "number" ? n : 0);
  }, 0);

  return (
    <div className="acrobat-merge-root">
      <div className="acrobat-merge-toolbar">
        <span className="acrobat-merge-toolbar-title">結合</span>
        <button type="button" className="acrobat-merge-btn" onClick={handleAddFiles} disabled={isLoading}>
          ＋ PDF を追加
        </button>
        {pdfFiles.length > 1 && (
          <>
            <button type="button" className="acrobat-merge-btn" onClick={() => sortByName("asc")} disabled={isLoading}>
              名前 ↑
            </button>
            <button type="button" className="acrobat-merge-btn" onClick={() => sortByName("desc")} disabled={isLoading}>
              名前 ↓
            </button>
          </>
        )}
        {pdfFiles.length > 0 && !isConverted && (
          <button
            type="button"
            className="acrobat-merge-btn acrobat-merge-btn--primary"
            onClick={onConvert}
            disabled={isLoading}
          >
            この順で結合
          </button>
        )}
        {isConverted && (
          <>
            <button type="button" className="acrobat-merge-btn acrobat-merge-btn--success" onClick={onSave} disabled={isLoading}>
              名前を付けて保存…
            </button>
            <button type="button" className="acrobat-merge-btn" onClick={onCancel} disabled={isLoading}>
              最初からやり直す
            </button>
          </>
        )}
        {pdfFiles.length > 0 && !isConverted && (
          <button type="button" className="acrobat-merge-btn" onClick={onCancel} disabled={isLoading} style={{ marginLeft: "auto" }}>
            クリア
          </button>
        )}
      </div>

      <div className="acrobat-merge-strip-wrap">
        <div className="acrobat-merge-strip-label">
          {pdfFiles.length === 0
            ? "ドキュメントを追加すると、左から順に 1 本の PDF に結合されます（カードをドラッグして並べ替え）。"
            : `ドキュメント ${pdfFiles.length} 件${totalPages > 0 ? ` · 合計約 ${totalPages} ページ` : ""}`}
        </div>

        {pdfFiles.length === 0 ? (
          <div className="acrobat-merge-placeholder">＋ PDF を追加 からファイルを選んでください</div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="merge-documents" direction="horizontal">
              {(dropProvided) => (
                <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="acrobat-merge-strip">
                  {pdfFiles.map((file, index) => {
                    const safeId =
                      file && typeof file.path === "string" && file.path.length > 0
                        ? file.path
                        : `${file?.name || "file"}-${index}`;
                    const pc = pageCounts[file.path];
                    return (
                      <Draggable key={safeId} draggableId={safeId} index={index}>
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`acrobat-merge-card ${snapshot.isDragging ? "acrobat-merge-card--dragging" : ""}`}
                          >
                            <div className="acrobat-merge-card-top">
                              <span className="acrobat-merge-order">{index + 1}</span>
                              <button
                                type="button"
                                className="acrobat-merge-remove"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleRemoveFile(index);
                                }}
                                title="リストから外す"
                                aria-label="削除"
                              >
                                ×
                              </button>
                            </div>
                            <div className="acrobat-merge-card-body" {...dragProvided.dragHandleProps}>
                              <MergePdfCardThumb filePath={file.path} />
                              <span className="acrobat-merge-filename" title={file.name}>
                                {file.name}
                              </span>
                              <span className="acrobat-merge-meta">
                                {pc === null ? "ページ数: —" : typeof pc === "number" ? `${pc} ページ` : "読込中…"}
                              </span>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      <p className="acrobat-merge-hint">
        ヒント：結合後は下のプレビューで内容を確認してから「名前を付けて保存」してください。
      </p>
    </div>
  );
}

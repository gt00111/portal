import { useEffect, useMemo, useRef, useState } from "react";

import PixoPdfPageCanvas from "./PixoPdfPageCanvas.jsx";
import { usePdfJsDocument } from "../hooks/usePdfJsDocument";
import "./style/replace-workspace.css";

const FILMSTRIP_MIN = 100;
const FILMSTRIP_DEFAULT = 148;

const OPS = [
  { id: "replace", label: "差し替え" },
  { id: "insertBefore", label: "前に挿入" },
  { id: "insertAfter", label: "後に挿入" },
  { id: "delete", label: "削除" },
];

/**
 * Acrobat 風：モードツールバー + ファイルチップ + 左フィルムストリップ + 右メイン
 */
export default function PdfReplaceWorkspace({
  operationType,
  onOperationTypeChange,
  sourceFile,
  targetFile,
  targetPages,
  selectedPageIndex,
  selectedPageIndices,
  onSourceFileSelect,
  onTargetFileSelect,
  onClearSource,
  onClearTarget,
  onPageThumbClick,
  isConverted,
  isLoading,
  executeDisabled,
  executeLabel,
  onExecute,
  onSave,
  onCancel,
  onUndo,
  canUndo = false,
  resultFile,
  targetPdfDataUrl,
}) {
  const { doc: pdfDoc, error: pdfLoadError } = usePdfJsDocument(targetPdfDataUrl ?? null);

  const bodyRef = useRef(null);
  const filmstripRef = useRef(null);
  const [filmstripInnerW, setFilmstripInnerW] = useState(FILMSTRIP_DEFAULT);
  const [filmstripWidth, setFilmstripWidth] = useState(FILMSTRIP_DEFAULT);
  const [resizerDragging, setResizerDragging] = useState(false);
  const [isNarrowLayout, setIsNarrowLayout] = useState(false);
  const dragStartRef = useRef({ clientX: 0, width: FILMSTRIP_DEFAULT });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsNarrowLayout(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!resizerDragging) {
      return;
    }
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    const onMove = (e) => {
      const body = bodyRef.current;
      const rect = body?.getBoundingClientRect();
      const maxW = rect ? Math.min(440, Math.max(FILMSTRIP_MIN + 80, rect.width * 0.52)) : 440;
      const next = clamp(
        dragStartRef.current.width + (e.clientX - dragStartRef.current.clientX),
        FILMSTRIP_MIN,
        maxW,
      );
      setFilmstripWidth(next);
    };

    const onUp = () => setResizerDragging(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizerDragging]);

  useEffect(() => {
    const el = filmstripRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const apply = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) {
        setFilmstripInnerW(w);
      }
    };
    apply();
    const ro = new ResizeObserver(() => apply());
    ro.observe(el);
    return () => ro.disconnect();
  }, [targetPages.length, isNarrowLayout, filmstripWidth]);

  const thumbPdfScale = useMemo(() => {
    if (isNarrowLayout) {
      return 0.2;
    }
    const w = Math.max(filmstripInnerW, 72);
    return Math.min(0.58, Math.max(0.14, w / 580));
  }, [filmstripInnerW, isNarrowLayout]);

  const onResizerPointerDown = (e) => {
    if (e.button !== 0 || isNarrowLayout) {
      return;
    }
    e.preventDefault();
    dragStartRef.current = { clientX: e.clientX, width: filmstripWidth };
    setResizerDragging(true);
  };

  const modeHint = () => {
    switch (operationType) {
      case "replace":
        return "左の一覧で差し替え先ページを 1 枚選び、差し替え用 PDF を指定して実行します。完了後も同じ手順で続けて差し替えられ、最後に「名前を付けて保存」してください。";
      case "insertBefore":
        return "挿入位置となるページを 1 枚選びます（その直前に新しいページが入ります）。";
      case "insertAfter":
        return "挿入位置となるページを 1 枚選びます（その直後に新しいページが入ります）。";
      case "delete":
        return "削除するページを左の一覧で複数選択できます。チェックが付いたページがまとめて削除対象になります。";
      default:
        return "";
    }
  };

  const previewIndex =
    operationType === "delete"
      ? selectedPageIndices?.size > 0
        ? Math.min(...selectedPageIndices)
        : null
      : selectedPageIndex;

  const previewPage = previewIndex != null ? targetPages[previewIndex] : null;
  const pageTotal = pdfDoc?.numPages ?? targetPages.length;

  const showExecute = !isConverted;
  const showSave = Boolean(resultFile);
  const showSessionReset = Boolean(targetFile || resultFile);

  return (
    <div className="acrobat-replace-root">
      <div className="acrobat-replace-toolbar">
        <span className="acrobat-replace-toolbar-title">編集</span>
        <div className="acrobat-replace-mode-group" role="tablist" aria-label="操作種別">
          {OPS.map((op) => (
            <button
              key={op.id}
              type="button"
              role="tab"
              aria-selected={operationType === op.id}
              className={`acrobat-replace-mode ${operationType === op.id ? "acrobat-replace-mode--active" : ""}`}
              onClick={() => onOperationTypeChange(op.id)}
              disabled={isLoading || isConverted}
            >
              {op.label}
            </button>
          ))}
        </div>

        <button type="button" className="acrobat-replace-btn" onClick={onTargetFileSelect} disabled={isLoading || isConverted}>
          対象 PDF を開く…
        </button>
        <button
          type="button"
          className="acrobat-replace-btn"
          onClick={onSourceFileSelect}
          disabled={isLoading || isConverted || operationType === "delete"}
          title={operationType === "delete" ? "削除では不要です" : undefined}
        >
          {operationType === "replace" ? "差し替え用 PDF…" : "挿入する PDF…"}
        </button>

        <span className="acrobat-replace-toolbar-spacer" />

        {showExecute ? (
          <button
            type="button"
            className="acrobat-replace-btn acrobat-replace-btn--primary"
            onClick={onExecute}
            disabled={isLoading || executeDisabled}
          >
            {executeLabel}
          </button>
        ) : null}
        {showSave ? (
          <button type="button" className="acrobat-replace-btn acrobat-replace-btn--success" onClick={onSave} disabled={isLoading}>
            名前を付けて保存…
          </button>
        ) : null}
        {targetFile ? (
          <button
            type="button"
            className="acrobat-replace-btn"
            onClick={onUndo}
            disabled={isLoading || !canUndo}
            title={
              canUndo
                ? "直前の差し替え・挿入・削除を取り消し、1つ前のPDFに戻します"
                : "編集を適用すると使えるようになります（開いた直後のみでは戻せません）"
            }
          >
            元に戻す
          </button>
        ) : null}
        {showSessionReset ? (
          <button type="button" className="acrobat-replace-btn" onClick={onCancel} disabled={isLoading}>
            やり直す
          </button>
        ) : null}
      </div>

      <div className="acrobat-replace-files-row">
        <div className="acrobat-replace-file-chip">
          <span className="acrobat-replace-file-chip-label">対象</span>
          {targetFile ? (
            <>
              <span className="acrobat-replace-file-chip-name" title={targetFile.name}>
                {targetFile.name}
                {targetPages.length > 0 ? ` · ${targetPages.length} ページ` : ""}
              </span>
              <button
                type="button"
                className="acrobat-replace-file-chip-remove"
                onClick={onClearTarget}
                aria-label="対象 PDF を閉じる"
                title="閉じる"
                disabled={isConverted}
              >
                ×
              </button>
            </>
          ) : (
            <span className="acrobat-replace-file-chip-name">未選択</span>
          )}
        </div>
        <div className="acrobat-replace-file-chip" style={{ opacity: operationType === "delete" ? 0.5 : 1 }}>
          <span className="acrobat-replace-file-chip-label">
            {operationType === "replace" ? "差し替え" : "挿入"}
          </span>
          {operationType === "delete" ? (
            <span className="acrobat-replace-file-chip-name">—</span>
          ) : sourceFile ? (
            <>
              <span className="acrobat-replace-file-chip-name" title={sourceFile.name}>
                {sourceFile.name}
              </span>
              <button
                type="button"
                className="acrobat-replace-file-chip-remove"
                onClick={onClearSource}
                aria-label="操作用 PDF を外す"
                title="外す"
                disabled={isConverted}
              >
                ×
              </button>
            </>
          ) : (
            <span className="acrobat-replace-file-chip-name">未選択</span>
          )}
        </div>
      </div>

      <div ref={bodyRef} className="acrobat-replace-body">
        <aside
          ref={filmstripRef}
          className="acrobat-replace-filmstrip"
          aria-label="ページ一覧"
          style={
            isNarrowLayout
              ? { width: "100%", flex: "none" }
              : { width: filmstripWidth, flex: "0 0 auto" }
          }
        >
          {targetPages.length === 0 ? (
            <p className="acrobat-replace-filmstrip-empty">
              「対象 PDF を開く」でファイルを読み込むと、ここにページのフィルムストリップが表示されます。
            </p>
          ) : (
            targetPages.map((page, index) => {
              const selected =
                operationType === "delete"
                  ? selectedPageIndices.has(index)
                  : selectedPageIndex === index;
              return (
                <button
                  key={page.index ?? index}
                  type="button"
                  className={`acrobat-replace-thumb ${selected ? "acrobat-replace-thumb--selected" : ""}`}
                  onClick={() => onPageThumbClick(index)}
                  disabled={isConverted}
                >
                  <div className="acrobat-replace-thumb-bar">
                    <span>{index + 1}</span>
                    {operationType === "delete" && selected ? (
                      <span className="acrobat-replace-thumb-check">✓</span>
                    ) : null}
                  </div>
                  {pdfDoc ? (
                    <div className="acrobat-replace-thumb-canvas-wrap">
                      <PixoPdfPageCanvas
                        doc={pdfDoc}
                        pageNumber={index + 1}
                        scale={thumbPdfScale}
                        aria-label={`ページ ${index + 1} のサムネイル`}
                      />
                    </div>
                  ) : page.thumbnail ? (
                    <img
                      src={page.thumbnail}
                      alt={`ページ ${index + 1}`}
                      className="acrobat-replace-thumb-img"
                    />
                  ) : (
                    <div className="acrobat-replace-thumb-placeholder">{index + 1}</div>
                  )}
                </button>
              );
            })
          )}
        </aside>

        {!isNarrowLayout ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="ページ一覧とプレビューの幅を調整（ドラッグ）"
            className={`acrobat-replace-resizer ${resizerDragging ? "acrobat-replace-resizer--dragging" : ""}`}
            onPointerDown={onResizerPointerDown}
          />
        ) : null}

        <section className="acrobat-replace-main" aria-label="プレビュー">
          <div className="acrobat-replace-main-status">
            {pdfLoadError ? (
              <span style={{ color: "#f87171" }}>PDF 画像の読込に失敗: {pdfLoadError}</span>
            ) : targetPages.length === 0 ? (
              "ドキュメントが読み込まれていません。"
            ) : operationType === "delete" && selectedPageIndices.size === 0 ? (
              "削除するページをフィルムストリップで選んでください（複数可）。"
            ) : operationType !== "delete" && selectedPageIndex === null ? (
              "操作の基準にするページをフィルムストリップで 1 枚選んでください。"
            ) : operationType === "delete" && selectedPageIndices.size > 1 ? (
              `${selectedPageIndices.size} ページを削除対象に選択中（表示は先頭の 1 枚）。`
            ) : previewIndex != null ? (
              `ページ ${previewIndex + 1} / ${pageTotal || targetPages.length}`
            ) : (
              ""
            )}
          </div>

          <div className="acrobat-replace-canvas-wrap">
            {previewIndex != null && pdfDoc ? (
              <div className="acrobat-replace-canvas" style={{ maxWidth: "100%" }}>
                <PixoPdfPageCanvas
                  doc={pdfDoc}
                  pageNumber={previewIndex + 1}
                  scale={1.28}
                  aria-label={`ページ ${previewIndex + 1} のプレビュー`}
                />
              </div>
            ) : previewPage?.thumbnail ? (
              <div className="acrobat-replace-canvas">
                <img src={previewPage.thumbnail} alt={`ページ ${previewIndex + 1} プレビュー`} />
              </div>
            ) : previewPage ? (
              <div className="acrobat-replace-canvas">
                <div className="acrobat-replace-canvas-placeholder">
                  <span className="acrobat-replace-canvas-placeholder-num">{previewIndex + 1}</span>
                  <span className="acrobat-replace-canvas-placeholder-sub">
                    {targetPdfDataUrl ? "プレビューを描画中…" : "サムネイル未生成（ページ番号のみ）"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="acrobat-replace-canvas" style={{ maxWidth: 360 }}>
                <div className="acrobat-replace-canvas-placeholder">
                  <span className="acrobat-replace-canvas-placeholder-sub" style={{ padding: "2rem", textAlign: "center" }}>
                    {modeHint()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

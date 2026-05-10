import { useEffect, useRef } from "react";

/**
 * 既に開いた pdf.js ドキュメントの 1 ページをキャンバスに描画
 * @param {import("pdfjs-dist").PDFDocumentProxy | null} doc
 * @param {number} pageNumber 1-origin
 * @param {number} scale
 */
export default function PixoPdfPageCanvas({
  doc,
  pageNumber,
  scale,
  className,
  "aria-label": ariaLabel,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas || pageNumber < 1) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const page = await doc.getPage(Math.min(pageNumber, doc.numPages));
        if (cancelled) {
          return;
        }
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch {
        if (!cancelled && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber, scale]);

  if (!doc || pageNumber < 1) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label={ariaLabel}
      role="img"
    />
  );
}

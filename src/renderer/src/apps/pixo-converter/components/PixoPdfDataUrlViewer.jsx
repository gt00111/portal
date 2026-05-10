import { useEffect, useRef, useState } from "react";

import { loadPdfFromDataUrl } from "../lib/pixoPdfjs";

/**
 * data URL 由来の PDF を pdf.js でキャンバス表示。
 * 表示領域に収まるようスケール自動調整（スクロール不要を目標）。
 */
export default function PixoPdfDataUrlViewer({
  dataUrl,
  /** 表示枠の高さ（CSS）。この枠の内側にページ全体が fit する */
  viewerMaxHeight = "min(72vh, 720px)",
}) {
  const [pdf, setPdf] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!dataUrl) {
      setPdf(null);
      setPageNum(1);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    const loadingTask = loadPdfFromDataUrl(dataUrl);
    void loadingTask.promise
      .then((doc) => {
        if (!cancelled) {
          setPdf(doc);
          setPageNum(1);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setPdf(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy().catch(() => {});
    };
  }, [dataUrl]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const apply = () => {
      const r = el.getBoundingClientRect();
      setBox((prev) => {
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        if (prev.w === w && prev.h === h) {
          return prev;
        }
        return { w, h };
      });
    };
    apply();
    const ro = new ResizeObserver(() => apply());
    ro.observe(el);
    return () => ro.disconnect();
  }, [dataUrl, pdf]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !wrapRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let cancelled = false;
    const n = pdf.numPages;
    const p = Math.min(Math.max(1, pageNum), n);

    const pad = 10;
    const availW = Math.max(box.w - pad * 2, 80);
    const availH = Math.max(box.h - pad * 2, 80);

    void pdf
      .getPage(p)
      .then(async (page) => {
        if (cancelled) {
          return;
        }
        const base = page.getViewport({ scale: 1 });
        const fitScale = Math.min(availW / base.width, availH / base.height);
        const scale = Math.min(Math.max(fitScale, 0.08), 4);
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNum, box.w, box.h]);

  if (!dataUrl) {
    return null;
  }

  if (error) {
    return (
      <div
        style={{
          padding: "1rem",
          color: "var(--error-color, #b91c1c)",
          background: "var(--error-light, #fef2f2)",
          borderRadius: "var(--radius-lg, 8px)",
          fontSize: "14px",
        }}
      >
        PDF の表示に失敗しました: {error}
      </div>
    );
  }

  const numPages = pdf?.numPages ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
      {numPages > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "13px", color: "var(--text-secondary, #64748b)" }}>
            {pageNum} / {numPages} ページ
          </span>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              disabled={pageNum <= 1}
              onClick={() => setPageNum((x) => Math.max(1, x - 1))}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid rgba(0,0,0,0.12)",
                background: pageNum <= 1 ? "#e5e7eb" : "#3d424d",
                color: pageNum <= 1 ? "#9ca3af" : "#e8eaed",
                cursor: pageNum <= 1 ? "not-allowed" : "pointer",
                fontSize: "13px",
              }}
            >
              前へ
            </button>
            <button
              type="button"
              disabled={pageNum >= numPages}
              onClick={() => setPageNum((x) => Math.min(numPages, x + 1))}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid rgba(0,0,0,0.12)",
                background: pageNum >= numPages ? "#e5e7eb" : "#3d424d",
                color: pageNum >= numPages ? "#9ca3af" : "#e8eaed",
                cursor: pageNum >= numPages ? "not-allowed" : "pointer",
                fontSize: "13px",
              }}
            >
              次へ
            </button>
          </div>
        </div>
      )}
      <div
        ref={wrapRef}
        style={{
          height: viewerMaxHeight,
          maxHeight: viewerMaxHeight,
          width: "100%",
          overflow: "hidden",
          borderRadius: "var(--radius-lg, 8px)",
          border: "2px solid var(--border-color, #e2e8f0)",
          background: "var(--bg-secondary, #f8fafc)",
          padding: "8px",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", maxWidth: "100%", maxHeight: "100%", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}
        />
      </div>
    </div>
  );
}

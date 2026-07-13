import { useEffect, useRef, useState } from "react";

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

import { Button } from "@renderer/components/ui/Button.js";
import { cn } from "@renderer/lib/cn.js";

import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const i = dataUrl.indexOf(",");
  if (i < 0) {
    throw new Error("Invalid data URL");
  }
  const b64 = dataUrl.slice(i + 1);
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let c = 0; c < len; c++) {
    bytes[c] = bin.charCodeAt(c);
  }
  return bytes;
}

/** 複数ページ PDF の閲覧＋ページ送り。fitToContainer=true で枠内にページ全体を収めて表示（スクロールなし）。 */
export function PdfJsViewer({
  dataUrl,
  fitToContainer = false,
}: {
  dataUrl: string | null;
  fitToContainer?: boolean;
}): JSX.Element {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [fit, setFit] = useState(fitToContainer);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFit(fitToContainer);
  }, [fitToContainer]);

  useEffect(() => {
    if (!dataUrl) {
      setPdf(null);
      setPageNum(1);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    const loadingTask = pdfjs.getDocument({ data: dataUrlToUint8Array(dataUrl), useSystemFonts: true });
    void loadingTask.promise
      .then((doc) => {
        if (!cancelled) {
          setPdf(doc);
          setPageNum(1);
        }
      })
      .catch((e: unknown) => {
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
    if (!pdf || !canvasRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    let cancelled = false;
    let activeTask: RenderTask | null = null;
    let raf = 0;

    const draw = async (): Promise<void> => {
      if (cancelled) return;
      if (activeTask) {
        try {
          activeTask.cancel();
        } catch {
          /* ignore */
        }
        activeTask = null;
      }
      let page;
      try {
        page = await pdf.getPage(Math.min(Math.max(1, pageNum), pdf.numPages));
      } catch {
        return;
      }
      if (cancelled) return;

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      let fitScale = 1.4;
      if (fit && wrapperRef.current) {
        const cw = wrapperRef.current.clientWidth - 16;
        const ch = wrapperRef.current.clientHeight - 16;
        if (cw <= 0 || ch <= 0) return;
        const base = page.getViewport({ scale: 1, rotation: 0 });
        fitScale = Math.min(cw / base.width, ch / base.height);
      }
      const viewport = page.getViewport({ scale: Math.max(fitScale, 0.05), rotation: 0 });
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const task = page.render({
        canvasContext: ctx,
        viewport,
        transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
      });
      activeTask = task;
      try {
        await task.promise;
      } catch {
        /* cancel 例外は無視 */
      }
      if (activeTask === task) activeTask = null;
    };

    void draw();

    let ro: ResizeObserver | null = null;
    if (fit && wrapperRef.current) {
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => void draw());
      });
      ro.observe(wrapperRef.current);
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (activeTask) {
        try {
          activeTask.cancel();
        } catch {
          /* ignore */
        }
      }
    };
  }, [pdf, pageNum, fit]);

  if (!dataUrl) {
    return <p className="text-sm text-fg-muted">PDF がありません。</p>;
  }
  if (error) {
    return <p className="text-sm text-state-danger">PDF の表示に失敗しました: {error}</p>;
  }

  const numPages = pdf?.numPages ?? 0;

  return (
    <div className={cn("flex flex-col gap-2", fit && "h-full min-h-0")}>
      {numPages > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-fg-primary">
            {pageNum} / {numPages} ページ
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFit((v) => !v)}
              title={fit ? "実寸表示に切替" : "画面に合わせる"}
            >
              {fit ? "実寸" : "画面に合わせる"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pageNum <= 1}
              onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            >
              前へ
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pageNum >= numPages}
              onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            >
              次へ
            </Button>
          </div>
        </div>
      )}
      <div
        ref={wrapperRef}
        className={cn(
          "rounded-lg border border-border-subtle bg-bg-base/40 p-2",
          fit
            ? "flex min-h-0 flex-1 items-center justify-center overflow-hidden"
            : "max-h-[min(88vh,1040px)] overflow-auto"
        )}
      >
        <canvas ref={canvasRef} className="block shadow-sm" />
      </div>
    </div>
  );
}

/** 一覧カード用。※ PDF の data URL のみ。未取得時は placeholder */
export function PdfCardThumbnail({
  dataUrl,
  className,
}: {
  dataUrl: string | null;
  className?: string;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!dataUrl || !container || !canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let alive = true;
    let pdfDoc: PDFDocumentProxy | null = null;
    let renderGen = 0;
    const loadingTask = pdfjs.getDocument({ data: dataUrlToUint8Array(dataUrl), useSystemFonts: true });

    const renderThumb = async (): Promise<void> => {
      if (!alive || !pdfDoc) {
        return;
      }
      const gen = ++renderGen;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw <= 0 || ch <= 0) {
        return;
      }
      try {
        const page = await pdfDoc.getPage(1);
        if (!alive || gen !== renderGen) {
          return;
        }
        const base = page.getViewport({ scale: 1, rotation: 0 });
        const scale = Math.min(cw / base.width, ch / base.height);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale, rotation: 0 });
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        await page
          .render({
            canvasContext: ctx,
            viewport,
            transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
          })
          .promise;
      } catch {
        /* ignore */
      }
    };

    void loadingTask.promise
      .then(async (doc) => {
        if (!alive) {
          return;
        }
        pdfDoc = doc;
        await renderThumb();
      })
      .catch(() => {});

    const ro = new ResizeObserver(() => {
      void renderThumb();
    });
    ro.observe(container);

    return () => {
      alive = false;
      ro.disconnect();
      void loadingTask.destroy().catch(() => {});
    };
  }, [dataUrl]);

  if (!dataUrl) {
    return (
      <div
        className={cn(
          "flex h-full min-h-[4.5rem] w-full items-center justify-center rounded-lg border border-dashed border-border-subtle bg-bg-elevated/40 px-2 text-center text-xs text-fg-primary",
          className
        )}
      >
        プレビューなし
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-lg bg-bg-elevated/50",
        className
      )}
    >
      <canvas ref={canvasRef} className="block max-h-full max-w-full" />
    </div>
  );
}

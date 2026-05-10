import { useEffect, useRef, useState } from "react";

import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

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

/** 複数ページ PDF の閲覧＋ページ送り */
export function PdfJsViewer({ dataUrl }: { dataUrl: string | null }): JSX.Element {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    if (!ctx) {
      return;
    }
    let cancelled = false;
    void pdf
      .getPage(Math.min(Math.max(1, pageNum), pdf.numPages))
      .then(async (page) => {
        if (cancelled) return;
        const scale = 1.4;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });
        await renderTask.promise;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNum]);

  if (!dataUrl) {
    return <p className="text-sm text-fg-muted">PDF がありません。</p>;
  }
  if (error) {
    return <p className="text-sm text-state-danger">PDF の表示に失敗しました: {error}</p>;
  }

  const numPages = pdf?.numPages ?? 0;

  return (
    <div className="flex flex-col gap-2">
      {numPages > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-fg-primary">
            {pageNum} / {numPages} ページ
          </span>
          <div className="flex gap-1">
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
      <div className="max-h-[min(88vh,1040px)] overflow-auto rounded-lg border border-border-subtle bg-bg-base/40 p-2">
        <canvas ref={canvasRef} className="mx-auto block shadow-sm" />
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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!dataUrl || !canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    let alive = true;
    const loadingTask = pdfjs.getDocument({ data: dataUrlToUint8Array(dataUrl), useSystemFonts: true });
    void loadingTask.promise
      .then(async (doc) => {
        if (!alive) return;
        const page = await doc.getPage(1);
        if (!alive) return;
        const viewport = page.getViewport({ scale: 0.22 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
      })
      .catch(() => {});

    return () => {
      alive = false;
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
      className={cn(
        "flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-lg bg-bg-elevated/50 p-2",
        className
      )}
    >
      <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

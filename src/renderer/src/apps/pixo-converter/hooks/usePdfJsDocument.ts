import { useEffect, useState } from "react";

import type { PDFDocumentProxy } from "pdfjs-dist";

import { loadPdfFromDataUrl } from "../lib/pixoPdfjs";

/**
 * PixoConverter 用: data URL から PDF ドキュメントを 1 本だけ読み込む（サムネ複数枚で使い回し）
 */
export function usePdfJsDocument(dataUrl: string | null): {
  doc: PDFDocumentProxy | null;
  error: string | null;
} {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dataUrl) {
      setDoc(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    const loadingTask = loadPdfFromDataUrl(dataUrl);
    void loadingTask.promise
      .then((d) => {
        if (!cancelled) {
          setDoc(d);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setDoc(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy().catch(() => {});
    };
  }, [dataUrl]);

  return { doc, error };
}

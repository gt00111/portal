import { useEffect, useState } from "react";

import PixoPdfPageCanvas from "./PixoPdfPageCanvas.jsx";
import { usePdfJsDocument } from "../hooks/usePdfJsDocument";

/**
 * 連結リスト用：ファイルパスから 1 ページ目を pdf.js でサムネ表示
 */
export default function MergePdfCardThumb({ filePath }) {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    if (!filePath || !window.electronAPI?.readFileAsDataURL) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.electronAPI.readFileAsDataURL(filePath);
        if (!cancelled && result.success && result.dataURL) {
          setDataUrl(result.dataURL);
        } else if (!cancelled) {
          setDataUrl(null);
        }
      } catch {
        if (!cancelled) {
          setDataUrl(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const { doc, error: docErr } = usePdfJsDocument(dataUrl);

  if (!filePath) {
    return null;
  }

  if (!dataUrl) {
    return <div className="acrobat-merge-card-thumb acrobat-merge-card-thumb--placeholder">…</div>;
  }

  if (docErr) {
    return <div className="acrobat-merge-card-thumb acrobat-merge-card-thumb--placeholder">—</div>;
  }

  if (!doc) {
    return <div className="acrobat-merge-card-thumb acrobat-merge-card-thumb--placeholder">…</div>;
  }

  return (
    <div className="acrobat-merge-card-thumb">
      <PixoPdfPageCanvas doc={doc} pageNumber={1} scale={0.24} aria-label="1 ページ目のプレビュー" />
    </div>
  );
}

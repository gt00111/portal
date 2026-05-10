// renderer/components/PdfPreview.jsx
import { useState, useEffect } from "react";

import PixoPdfDataUrlViewer from "./PixoPdfDataUrlViewer.jsx";

export default function PdfPreview({ pdfFiles = [] }) {
  const [dataURLs, setDataURLs] = useState({});

  useEffect(() => {
    const loadPDFs = async () => {
      const next = {};
      for (const filePath of pdfFiles) {
        try {
          const result = await window.electronAPI.readFileAsDataURL(filePath);
          if (result.success && result.dataURL) {
            next[filePath] = result.dataURL;
          }
        } catch {
          /* 未取得のまま */
        }
      }
      if (Object.keys(next).length > 0) {
        setDataURLs((prev) => ({ ...prev, ...next }));
      }
    };

    if (pdfFiles.length > 0) {
      void loadPDFs();
    }
  }, [pdfFiles]);

  if (!pdfFiles.length) {
    return null;
  }

  return (
    <div style={{ marginTop: "30px" }}>
      <h3 style={{ marginBottom: "20px", color: "var(--text-primary)", textAlign: "center" }}>＜PDFプレビュー＞</h3>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "30px",
          justifyContent: "center",
        }}
      >
        {pdfFiles.map((filePath, index) => {
          const fileName = filePath.split(/[\\/]/).pop();
          const dataURL = dataURLs[filePath];

          return (
            <div
              key={`${filePath}-${index}`}
              style={{
                width: "300px",
                textAlign: "center",
                background: "var(--bg-secondary, #fff)",
                padding: "10px",
                borderRadius: "10px",
                boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
              }}
            >
              <div
                style={{
                  marginBottom: "10px",
                  color: "var(--text-primary, #333)",
                  fontSize: "14px",
                  fontWeight: "bold",
                  wordBreak: "break-word",
                }}
              >
                {fileName}
              </div>

              {dataURL ? (
                <div style={{ width: "100%" }}>
                  <PixoPdfDataUrlViewer dataUrl={dataURL} viewerMaxHeight="520px" />
                </div>
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "400px",
                    border: "1px solid var(--border-color, #ccc)",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-secondary, #999)",
                  }}
                >
                  読み込み中...
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

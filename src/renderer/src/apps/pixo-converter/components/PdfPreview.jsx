// renderer/components/PdfPreview.jsx
import { useState, useEffect } from "react";

export default function PdfPreview({ pdfFiles = [] }) {
  const [dataURLs, setDataURLs] = useState({});

  useEffect(() => {
    const loadPDFs = async () => {
      const newDataURLs = {};
      for (const filePath of pdfFiles) {
        if (!dataURLs[filePath]) {
          try {
            const result = await window.electronAPI.readFileAsDataURL(filePath);
            if (result.success) {
              newDataURLs[filePath] = result.dataURL;
            }
          } catch (error) {
            console.error(`PDF読み込みエラー (${filePath}):`, error);
          }
        } else {
          newDataURLs[filePath] = dataURLs[filePath];
        }
      }
      if (Object.keys(newDataURLs).length > 0) {
        setDataURLs((prev) => ({ ...prev, ...newDataURLs }));
      }
    };

    if (pdfFiles.length > 0) {
      loadPDFs();
    }
  }, [pdfFiles]);

  if (!pdfFiles.length) return null;

  return (
    <div style={{ marginTop: "30px" }}>
      <h3 style={{ marginBottom: "20px", color: "black", textAlign: "center" }}>
        ＜PDFプレビュー＞
      </h3>

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
              key={index}
              style={{
                width: "300px",
                textAlign: "center",
                background: "#fff",
                padding: "10px",
                borderRadius: "10px",
                boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
              }}
            >
              <div
                style={{
                  marginBottom: "10px",
                  color: "#333",
                  fontSize: "14px",
                  fontWeight: "bold",
                  wordBreak: "break-word",
                }}
              >
                {fileName}
              </div>

              {dataURL ? (
                <iframe
                  src={dataURL}
                  title={`PDF Preview ${index}`}
                  style={{
                    width: "100%",
                    height: "400px",
                    border: "1px solid #ccc",
                    borderRadius: "10px",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "400px",
                    border: "1px solid #ccc",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#999",
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

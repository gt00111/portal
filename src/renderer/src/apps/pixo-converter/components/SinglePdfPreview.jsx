import { useState, useEffect } from "react";

import PixoPdfDataUrlViewer from "./PixoPdfDataUrlViewer.jsx";

export default function SinglePdfPreview({ filePath, heading = "＜PDFプレビュー＞" }) {
  const [dataURL, setDataURL] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!filePath) {
      setLoading(false);
      return;
    }

    const loadPDF = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await window.electronAPI.readFileAsDataURL(filePath);
        if (result.success && result.dataURL) {
          setDataURL(result.dataURL);
        } else {
          setError(result.error || "データURLの取得に失敗しました");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void loadPDF();
  }, [filePath]);

  if (!filePath) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: "30px",
        textAlign: "center",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <h3
        style={{
          marginBottom: "20px",
          color: "var(--text-primary)",
          fontWeight: "700",
          fontSize: "var(--font-size-2xl)",
        }}
      >
        {heading}
      </h3>

      {loading ? (
        <div
          style={{
            width: "80%",
            maxWidth: "1000px",
            height: "600px",
            border: "2px solid var(--border-color)",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-secondary)",
            background: "var(--bg-secondary)",
            fontSize: "var(--font-size-lg)",
          }}
        >
          読み込み中...
        </div>
      ) : error ? (
        <div
          style={{
            width: "80%",
            maxWidth: "1000px",
            minHeight: "200px",
            border: "2px solid var(--error-color)",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--error-color)",
            background: "var(--error-light)",
            padding: "var(--spacing-xl)",
          }}
        >
          <div style={{ fontSize: "var(--font-size-xl)", marginBottom: "var(--spacing-md)" }}>
            プレビューの読み込みに失敗しました
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>{error}</div>
        </div>
      ) : dataURL ? (
        <div style={{ width: "80%", maxWidth: "1000px", margin: "0 auto" }}>
          <PixoPdfDataUrlViewer dataUrl={dataURL} />
        </div>
      ) : (
        <div
          style={{
            width: "80%",
            maxWidth: "1000px",
            height: "200px",
            border: "2px solid var(--border-color)",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-tertiary)",
            background: "var(--bg-secondary)",
          }}
        >
          プレビューがありません
        </div>
      )}
    </div>
  );
}

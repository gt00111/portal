import { useState, useEffect, useRef } from "react";

export default function SinglePdfPreview({ filePath }) {
  const [dataURL, setDataURL] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fallback, setFallback] = useState(false); // iframeで表示できない場合のフォールバック
  const blobUrlRef = useRef(null);

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
          // dataURLをBlob URLに変換（iframe互換性向上）
          try {
            const blob = await fetch(result.dataURL).then((res) => res.blob());
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
          } catch (e) {
            console.warn("Blob URL生成に失敗しましたがdataURLを使用します:", e);
            blobUrlRef.current = null;
          }
        } else {
          setError(result.error || "データURLの取得に失敗しました");
        }
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    loadPDF();
    // cleanup: Blob URL解放
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [filePath]);

  if (!filePath) return null;

  const fileUrl = filePath ? encodeURI(`file://${filePath.replace(/\\/g, "/")}`) : null;
  const viewUrl = blobUrlRef.current || dataURL || fileUrl;

  return (
    <div style={{ 
      marginTop: "30px", 
      textAlign: "center",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    }}>
      <h3 style={{ 
        marginBottom: "20px", 
        color: "var(--text-primary)", 
        fontWeight: "700",
        fontSize: "var(--font-size-2xl)"
      }}>
        ＜連結PDFプレビュー＞
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
            height: "600px",
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
            ⚠️ プレビューの読み込みに失敗しました
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>
            {error}
          </div>
        </div>
      ) : viewUrl ? (
        <div style={{ width: "80%", maxWidth: "1000px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* まずiframeで表示 */}
          {!fallback && (
            <iframe
              src={viewUrl}
              title="Merged PDF Preview"
              style={{
                width: "100%",
                height: "600px",
                border: "2px solid var(--border-color)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-lg)",
                background: "white"
              }}
              onLoad={() => setFallback(false)}
              onError={() => setFallback(true)}
            />
          )}

          {/* iframeがだめな場合のフォールバック（objectタグ） */}
          {fallback && (
            <object
              data={viewUrl}
              type="application/pdf"
              width="100%"
              height="600px"
              style={{
                border: "2px solid var(--border-color)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-lg)",
                background: "white"
              }}
              onLoad={() => setFallback(false)}
              onError={() => setError("PDFを表示できませんでした")}
            >
              <p style={{ color: "var(--text-secondary)" }}>
                PDFを表示できませんでした。下のリンクから開いてください。
              </p>
            </object>
          )}
        </div>
      ) : (
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

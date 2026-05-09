// renderer/components/ConvertResult.jsx
import { useEffect, useState } from "react";

export default function ConvertResult({ images = [] }) {
  const [imageDataURLs, setImageDataURLs] = useState({});

  useEffect(() => {
    console.log("🖼️ プレビュー用画像パス:", images);
    
    // 画像をbase64エンコードして読み込む
    const loadImages = async () => {
      const newDataURLs = {};
      for (const imagePath of images) {
        if (!imageDataURLs[imagePath]) {
          try {
            if (window.electronAPI && window.electronAPI.readFileAsDataURL) {
              const result = await window.electronAPI.readFileAsDataURL(imagePath);
              if (result.success && result.dataURL) {
                newDataURLs[imagePath] = result.dataURL;
              }
            }
          } catch (error) {
            console.error(`画像読み込みエラー (${imagePath}):`, error);
          }
        } else {
          newDataURLs[imagePath] = imageDataURLs[imagePath];
        }
      }
      if (Object.keys(newDataURLs).length > 0) {
        setImageDataURLs((prev) => ({ ...prev, ...newDataURLs }));
      }
    };

    if (images.length > 0) {
      loadImages();
    }
  }, [images]);

  if (!images.length) return null;

  return (
    <div style={{ marginTop: "30px" }}>
      <h3 style={{ marginBottom: "20px", color: "black", textAlign: "center" }}>
        ＜プレビュー＞
      </h3>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "30px",
          justifyContent: "center",
        }}
      >
        {images.map((imagePath, index) => {
          const ext = imagePath.split(".").pop().toLowerCase();
          const filename = imagePath.split(/[/\\]/).pop();
          const dataURL = imageDataURLs[imagePath];

          return (
            <div
              key={index}
              style={{
                width: "300px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
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
                {filename}
              </div>

              {ext !== "pdf" ? (
                dataURL ? (
                  <img
                    src={dataURL}
                    alt={`Page ${index + 1}`}
                    style={{
                      width: "100%",
                      height: "auto",
                      maxHeight: "400px",
                      objectFit: "contain",
                      border: "1px solid #ccc",
                      borderRadius: "10px",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "300px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid #ccc",
                      borderRadius: "10px",
                      color: "#999",
                      fontSize: "14px",
                    }}
                  >
                    読み込み中...
                  </div>
                )
              ) : (
                <div style={{ color: "#999", fontSize: "12px" }}>
                  PDFファイル（プレビュー非対応）
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

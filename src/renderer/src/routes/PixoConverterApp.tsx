import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import ImageConvertPage from "@renderer/apps/pixo-converter/pages/ImageConvertPage.jsx";
import PdfConvertPage from "@renderer/apps/pixo-converter/pages/PdfConvertPage.jsx";
import PdfMergePage from "@renderer/apps/pixo-converter/pages/PdfMergePage.jsx";
import PdfReplacePage from "@renderer/apps/pixo-converter/pages/PdfReplacePage.jsx";
import TiffConvertPage from "@renderer/apps/pixo-converter/pages/TiffConvertPage.jsx";
import { ToastProvider, useToastContext } from "@renderer/apps/pixo-converter/contexts/ToastContext.jsx";
import { pixoElectronApi } from "@renderer/apps/pixo-converter/pixoBridge.js";
import ToastContainer from "@renderer/apps/pixo-converter/components/ToastContainer.jsx";
import Sidebar from "@renderer/apps/pixo-converter/Sidebar.jsx";

import "@renderer/apps/pixo-converter/styles/variables.css";
import "@renderer/apps/pixo-converter/components/style/app.css";

function PixoContent(): JSX.Element {
  const { toasts, removeToast } = useToastContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "clamp(16px, 4vw, 40px)",
          background: "var(--bg-secondary)",
          minWidth: 0,
        }}
      >
        <Routes>
          <Route index element={<PdfConvertPage />} />
          <Route path="tiff-convert" element={<TiffConvertPage />} />
          <Route path="image-convert" element={<ImageConvertPage />} />
          <Route path="merge" element={<PdfMergePage />} />
          <Route path="replace" element={<PdfReplacePage />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </main>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

/** ポータル `#/apps/pixo-converter/*` 内蔵 PixoConverter（元アプリ構造のまま） */
export function PixoConverterApp(): JSX.Element {
  useEffect(() => {
    const previous = window.electronAPI;
    window.electronAPI = pixoElectronApi;
    return () => {
      window.electronAPI = previous;
    };
  }, []);

  return (
    <ToastProvider>
      <PixoContent />
    </ToastProvider>
  );
}

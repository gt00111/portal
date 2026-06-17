import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import ImageConvertPage from "@renderer/apps/pixo-converter/pages/ImageConvertPage.jsx";
import PdfConvertPage from "@renderer/apps/pixo-converter/pages/PdfConvertPage.jsx";
import PdfMergePage from "@renderer/apps/pixo-converter/pages/PdfMergePage.jsx";
import PdfReplacePage from "@renderer/apps/pixo-converter/pages/PdfReplacePage.jsx";
import TiffConvertPage from "@renderer/apps/pixo-converter/pages/TiffConvertPage.jsx";
import { ToastProvider, useToastContext } from "@renderer/apps/pixo-converter/contexts/ToastContext.jsx";
import { pixoElectronApi } from "@renderer/apps/pixo-converter/pixoBridge.js";
import ToastContainer from "@renderer/apps/pixo-converter/components/ToastContainer.jsx";
import Sidebar from "@renderer/apps/pixo-converter/Sidebar.jsx";
import {
  PixoConverterHelpContent,
  pixoHelpTitle,
} from "@renderer/apps/pixo-converter/PixoConverterHelpModal.js";
import type { PixoHelpVariant } from "@renderer/apps/pixo-converter/pixoConverterHelpCopy.js";
import { Modal } from "@renderer/components/ui/Modal.js";
import { Button } from "@renderer/components/ui/Button.js";

import "@renderer/apps/pixo-converter/styles/variables.css";
import "@renderer/apps/pixo-converter/components/style/app.css";

function resolvePixoHelpVariant(pathname: string): PixoHelpVariant {
  const seg = pathname.split("/").filter(Boolean).pop() ?? "";
  if (seg === "tiff-convert") return "tiff-convert";
  if (seg === "image-convert") return "image-convert";
  if (seg === "merge") return "merge";
  if (seg === "replace") return "replace";
  return "pdf-convert";
}

function PixoContent(): JSX.Element {
  const location = useLocation();
  const { toasts, removeToast } = useToastContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpVariant = useMemo(() => resolvePixoHelpVariant(location.pathname), [location.pathname]);

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
          position: "relative",
          flex: 1,
          overflowY: "auto",
          padding: "clamp(16px, 4vw, 40px)",
          background: "var(--bg-secondary)",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
          <Button type="button" variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
            ヘルプ
          </Button>
        </div>
        <Routes>
          <Route index element={<PdfConvertPage />} />
          <Route path="tiff-convert" element={<TiffConvertPage />} />
          <Route path="image-convert" element={<ImageConvertPage />} />
          <Route path="merge" element={<PdfMergePage />} />
          <Route path="replace" element={<PdfReplacePage />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
        <Modal
          open={helpOpen}
          title={pixoHelpTitle(helpVariant)}
          onClose={() => setHelpOpen(false)}
          width="lg"
          placement="contained"
        >
          <PixoConverterHelpContent variant={helpVariant} />
        </Modal>
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

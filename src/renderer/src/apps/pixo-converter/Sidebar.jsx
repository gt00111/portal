// renderer/Sidebar.jsx（ポータル内蔵: 相対ルート）
import { NavLink } from "react-router-dom";
import { useState, useEffect } from "react";
import pixoLogo from "@branding/pixo-converter/logo.png?url";
import "./components/style/sidebar.css";

export default function Sidebar({ isOpen, onToggle }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const navLinks = [
    { to: ".", label: "PDF → JPG/PNG 変換", end: true },
    { to: "tiff-convert", label: "TIFF/TIF → PDF 変換" },
    { to: "image-convert", label: "PNG/JPG → PDF 変換" },
    { to: "merge", label: "PDFファイル連結" },
    { to: "replace", label: "PDFページ編集" },
  ];

  return (
    <>
      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <img src={pixoLogo} alt="" className="sidebar-brand-logo" decoding="async" aria-hidden />
          <h1 className="logo-title">PixoConvert</h1>
        </div>

        <nav>
          <ul className="sidebar-nav">
            {navLinks.map((link) => (
              <li key={link.to} className="sidebar-item">
                <NavLink
                  to={link.to}
                  end={link.end ?? false}
                  className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
                  onClick={() => {
                    if (isMobile) {
                      onToggle();
                    }
                  }}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {isMobile && (
        <button
          type="button"
          className="mobile-menu-button"
          onClick={onToggle}
          aria-label="メニューを開く"
          style={{
            position: "fixed",
            top: "20px",
            left: "20px",
            zIndex: 999,
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            border: "none",
            borderRadius: "12px",
            padding: "14px",
            cursor: "pointer",
            boxShadow: "0 8px 20px rgba(99, 102, 241, 0.4)",
            fontSize: "22px",
            width: "50px",
            height: "50px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.1) rotate(5deg)";
            e.currentTarget.style.boxShadow = "0 12px 30px rgba(99, 102, 241, 0.6)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1) rotate(0deg)";
            e.currentTarget.style.boxShadow = "0 8px 20px rgba(99, 102, 241, 0.4)";
          }}
        >
          ☰
        </button>
      )}
    </>
  );
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";

import { App } from "@renderer/App.js";

import "@renderer/index.css";
import "@svar-ui/react-gantt/all.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root が見つかりません");
}

createRoot(rootEl).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);

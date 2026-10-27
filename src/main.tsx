// exportHtml must be evaluated first: it captures the page HTML before React renders.
import "./lib/exportHtml.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./styles.css";
import { App } from "./App.tsx";
import { applyTheme, getTheme } from "./components/ui.tsx";

applyTheme(getTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

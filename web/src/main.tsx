import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initializeTheme } from "./components/ThemeToggle";
import "./styles.css";

initializeTheme();

if (window.vd?.platform === "darwin") {
  document.documentElement.classList.add("platform-mac");
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import { initializeTheme } from "./lib/theme";
import "./styles/index.css";

initializeTheme();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("CJS root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

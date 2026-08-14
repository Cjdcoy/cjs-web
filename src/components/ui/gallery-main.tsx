import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../styles/index.css";
import "../../styles/gallery.css";
import { DesignSystemGallery } from "./DesignSystemGallery";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Design-system gallery root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <DesignSystemGallery />
  </StrictMode>,
);

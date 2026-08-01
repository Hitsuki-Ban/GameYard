import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./i18n";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("GameYard Hub root element is missing.");
}

createRoot(rootElement).render(<App />);

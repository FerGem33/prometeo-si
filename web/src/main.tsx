import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/report.css";
import "./styles/app.css";
import "./styles/flow.css";
import "./styles/variants.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

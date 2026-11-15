import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/report.css";
import "./styles/app.css";
import "./styles/flow.css";
import "./styles/graph.css";
import "./styles/variants.css";
import "./styles/workspace.css";
import "./styles/summary.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

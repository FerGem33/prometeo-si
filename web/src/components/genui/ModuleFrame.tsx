/** Numbered figure/table frame with caption and origin label (owner: D9). */
import type { ReactNode } from "react";
import type { ModuleOrigin } from "../../genui/types";
import { t } from "../../i18n";
import "../../styles/genui/base.css";

export interface ModuleFrameProps {
  kind: "Figure" | "Table";
  n: number;
  title: string;
  caption: string;
  origin: ModuleOrigin;
  children: ReactNode;
}

export function ModuleFrame({ kind, n, title, caption, origin, children }: ModuleFrameProps) {
  const originLabel =
    origin === "ai" ? t("Layout chosen by AI · values computed locally") : t("Rule-based layout");
  return (
    <figure className="gx-frame" id={`gx-${kind.toLowerCase()}-${n}`}>
      {children}
      <figcaption>
        <b>
          {kind} {n}.
        </b>{" "}
        {title}. {caption}
        <span className="gx-origin">{originLabel}</span>
      </figcaption>
    </figure>
  );
}

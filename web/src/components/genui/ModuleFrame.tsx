/** Numbered figure/table frame with caption and origin label (owner: D9). STUB from F0. */
import type { ReactNode } from "react";
import type { ModuleOrigin } from "../../genui/types";

export interface ModuleFrameProps {
  kind: "Figure" | "Table";
  n: number;
  title: string;
  caption: string;
  origin: ModuleOrigin;
  children: ReactNode;
}

export function ModuleFrame({ kind, n, title, caption, children }: ModuleFrameProps) {
  return (
    <figure className="gx-frame">
      {children}
      <figcaption>
        {kind} {n} · {title}. {caption}
      </figcaption>
    </figure>
  );
}

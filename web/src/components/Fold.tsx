import { useState } from "react";

/** A section that opens on demand. The content stays in the page so that printing always includes it. */
export function Fold({ title, hint, children, open: initial = false }: { title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className={open ? "fold open" : "fold"}>
      <button type="button" className="fold-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="fold-mark" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
        <span className="fold-title">{title}</span>
        {hint && <span className="fold-hint">{hint}</span>}
        <span className="fold-act">{open ? "Hide" : "Show"}</span>
      </button>
      <div className="fold-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

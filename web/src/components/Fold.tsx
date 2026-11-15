import { useState } from "react";

/** A section that opens on demand. The content stays in the page so that printing always includes it.
 *  Pass `open` and `onOpenChange` to control it from outside; otherwise it keeps its own state. */
export function Fold({ title, hint, children, open: initial = false, controlled, onOpenChange, id }: {
  title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; open?: boolean; controlled?: boolean; onOpenChange?: (open: boolean) => void; id?: string;
}) {
  const [own, setOwn] = useState(initial);
  const open = controlled ? initial : own;
  const toggle = () => {
    if (!controlled) setOwn(!open);
    onOpenChange?.(!open);
  };
  return (
    <section className={open ? "fold open" : "fold"} id={id}>
      <button type="button" className="fold-head" aria-expanded={open} onClick={toggle}>
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

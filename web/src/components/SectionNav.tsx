import { useEffect, useState } from "react";
import { t, tx, lazy } from "../i18n";

/** The four layers of the report, from the answer to the material needed to check it. The ids are those of its sections. */
const SECTIONS: { id: string; label: string }[] = lazy([
  { id: "sec-answer", label: tx("Answer") },
  { id: "sec-why", label: tx("Why") },
  { id: "sec-explore", label: tx("Explore the evidence") },
  { id: "sec-sources", label: tx("Data, sources and methods") },
]);

/** A bar that stays in view: where the reader is in the report, and the actions of the report (passed as children). */
export function SectionNav({ children }: { children?: React.ReactNode }) {
  const [active, setActive] = useState(SECTIONS[0].id);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    // A section is current while it crosses a thin band below the bar.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-18% 0px -72% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return (
    <div className="secnav noprint">
      <nav aria-label={t("Report sections")}>
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-current={active === s.id ? "true" : undefined}
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <span className="secnav-n">{i + 1}</span> {s.label}
          </button>
        ))}
      </nav>
      <div className="secnav-actions">{children}</div>
    </div>
  );
}

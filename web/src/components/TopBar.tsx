import type { Stage } from "../state";

const TABS: { id: Extract<Stage, "report" | "graph" | "workspace">; label: string }[] = [
  { id: "report", label: "Report" },
  { id: "graph", label: "Evidence map" },
  { id: "workspace", label: "Workspace" },
];

/** Slim section bar: the three places a reader can be in, always visible, never printed. */
export function TopBar({ active, onGo }: { active: Stage; onGo: (next: Stage) => void }) {
  return (
    <header className="topbar noprint">
      <button type="button" className="topbar-brand" onClick={() => onGo("cover")}>
        Prometeo
      </button>
      <nav className="topbar-tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={active === t.id ? "page" : undefined}
            onClick={() => onGo(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

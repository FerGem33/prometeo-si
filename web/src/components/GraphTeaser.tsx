import { useMemo } from "react";
import type { Scenario } from "../engine";
import { useData } from "./ctx";
import { buildGraph } from "../report/graph";

/**
 * Stand-in for the old inline figure: the report keeps a small true preview of the network and
 * announces the full, interactive map as its own section.
 */
export function GraphTeaser({ scenario, onOpen }: { scenario: Scenario; onOpen: () => void }) {
  const { pack, lens } = useData();
  const unit = lens.unit_of_study ?? "study";
  const g = useMemo(() => buildGraph(pack, scenario, 340), [pack, scenario]);
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const n of g.nodes) counts[n.result.grade]++;
  const linked = g.edges.length;

  return (
    <aside className="kg-teaser noprint" aria-labelledby="kg-teaser-title">
      <div className="kg-teaser-art" aria-hidden="true">
        <svg viewBox="0 0 340 340" focusable="false">
          {g.edges.map((e) => {
            const a = g.nodes.find((n) => n.id === e.a);
            const b = g.nodes.find((n) => n.id === e.b);
            if (!a || !b) return null;
            return <line key={`${e.a}|${e.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="kg-teaser-edge" />;
          })}
          {g.nodes.map((n) => (
            <circle
              key={n.id}
              cx={n.x}
              cy={n.y}
              r={n.result.grade === "A" ? 16 : n.result.grade === "B" ? 13 : n.result.grade === "C" ? 10 : 7}
              className={`kg-teaser-node g-${n.result.grade}`}
            />
          ))}
        </svg>
      </div>
      <div className="kg-teaser-body">
        <h2 id="kg-teaser-title">Evidence map</h2>
        <p>
          The {g.nodes.length} {unit}s as a network: {linked} links the engine computes from shared variables, shared publications and declared
          relations. Pan, zoom and open any node without leaving the page you are reading.
        </p>
        <p className="kg-teaser-meta">
          Grades now: A {counts.A} · B {counts.B} · C {counts.C} · D {counts.D}
        </p>
        <button type="button" className="cta" onClick={onOpen}>
          Open the evidence map
        </button>
      </div>
    </aside>
  );
}

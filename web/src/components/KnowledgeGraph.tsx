import { useMemo, useState } from "react";
import type { Grade, Scenario } from "../engine";
import { useData, useProv } from "./ctx";
import { buildGraph, edgeText, matchingVariables } from "../report/graph";
import type { GraphEdge, GraphNode } from "../report/graph";
import { doiOf, num, varOf } from "../report/format";

const SIZE = 640;
const GRADES: Grade[] = ["A", "B", "C", "D"];

function Shape({ grade, r }: { grade: Grade; r: number }) {
  const common = { className: `gn gn-${grade}`, strokeDasharray: grade === "D" ? "4 3" : undefined };
  if (grade === "A") return <circle r={r} {...common} />;
  if (grade === "B") return <rect x={-r} y={-r} width={2 * r} height={2 * r} {...common} />;
  if (grade === "C") return <path d={`M0,${-r - 3} L${r + 3},0 L0,${r + 3} L${-r - 3},0 Z`} {...common} />;
  return <circle r={r} {...common} />;
}

export function KnowledgeGraph({ scenario, figure }: { scenario: Scenario; figure: number }) {
  const { pack, lens } = useData();
  const open = useProv();
  const unit = lens.unit_of_study ?? "study";
  const g = useMemo(() => buildGraph(pack, scenario, SIZE), [pack, scenario]);
  const [sel, setSel] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<GraphEdge | null>(null);
  const node = g.nodes.find((n) => n.id === sel) ?? null;
  const pos = new Map(g.nodes.map((n) => [n.id, n]));
  const edgesOf = (id: string) => g.edges.filter((e) => e.a === id || e.b === id);
  const linked = new Set(node ? edgesOf(node.id).flatMap((e) => [e.a, e.b]) : []);
  const counts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const n of g.nodes) counts[n.result.grade]++;

  const pick = (id: string) => setSel((s) => (s === id ? null : id));
  const nameOf = (id: string) => pos.get(id)?.study.short ?? id;
  const distText = (n: GraphNode) => (n.result.distance === null ? "no comparable record" : `d = ${num(n.result.distance)}`);
  const caption = hoverEdge ? `${hoverEdge.a} – ${hoverEdge.b}: ${edgeText(pack, hoverEdge)}` : null;

  const detail = (n: GraphNode) => {
    const matches = matchingVariables(pack, scenario, n.id);
    const doi = doiOf(pack, n.id);
    const obj = n.study.summary.objective?.trim() ?? "";
    const edges = edgesOf(n.id);
    return (
      <div>
        <h4>{n.study.short}</h4>
        <p className="kg-sub">{n.study.title}</p>
        <dl>
          <dt>Objective</dt>
          <dd>{obj ? (obj.length > 420 ? obj.slice(0, 420).trimEnd() + "…" : obj) : "Not stated in the pack."}</dd>
          <dt>Grade</dt>
          <dd>
            {n.result.grade}
            {n.result.grade === "D" ? " · no comparable record" : ""}
          </dd>
          <dt>Distance</dt>
          <dd>
            {n.result.distance === null ? (
              "none: no record to compare"
            ) : n.result.nearest ? (
              <button type="button" className="src" title="Show source: file, row and DOI" onClick={() => open(n.result.nearest!)}>
                {num(n.result.distance)}
              </button>
            ) : (
              num(n.result.distance)
            )}
          </dd>
          <dt>Variables matching the scenario</dt>
          <dd>
            {matches.length === 0
              ? "None: no record holds a scenario value."
              : matches.map((m, i) => (
                  <span key={m.variable}>
                    {i > 0 && ", "}
                    <button type="button" className="src" title="Show source: file, row and DOI" onClick={() => open(m.record)}>
                      {varOf(pack, m.variable).label}
                    </button>
                  </span>
                ))}
          </dd>
          <dt>Links ({edges.length})</dt>
          <dd>
            {edges.length === 0 ? (
              "None computed."
            ) : (
              <ul>
                {edges.map((e) => {
                  const o = e.a === n.id ? e.b : e.a;
                  return (
                    <li key={o}>
                      <button type="button" className="linkbtn" onClick={() => setSel(o)}>
                        {nameOf(o)}
                      </button>
                      : {edgeText(pack, e)}
                    </li>
                  );
                })}
              </ul>
            )}
          </dd>
          {doi && (
            <>
              <dt>Dataset DOI</dt>
              <dd>
                <a href={doi.url} target="_blank" rel="noreferrer">
                  {doi.label}
                </a>
              </dd>
            </>
          )}
        </dl>
      </div>
    );
  };

  return (
    <figure className="fig wide kg" id="fig-graph">
      <div className="kg-grid">
        <div className="kg-plot">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label={`Evidence network of ${g.nodes.length} ${unit}s, ordered by rank, clockwise from the top`}>
            <g>
              {g.edges.map((e) => {
                const a = pos.get(e.a)!;
                const b = pos.get(e.b)!;
                const on = node && (e.a === node.id || e.b === node.id);
                return (
                  <line
                    key={`${e.a}|${e.b}`}
                    className={`ge${on ? " on" : ""}${node && !on ? " off" : ""}${e.kinds.includes("related") ? " rel" : ""}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    onMouseEnter={() => setHoverEdge(e)}
                    onMouseLeave={() => setHoverEdge(null)}
                  >
                    <title>{`${e.a} – ${e.b}: ${edgeText(pack, e)}`}</title>
                  </line>
                );
              })}
            </g>
            <g>
              {g.nodes.map((n) => {
                const on = sel === n.id;
                const dim = node && !on && !linked.has(n.id);
                return (
                  <g
                    key={n.id}
                    className={`gnode${on ? " sel" : ""}${dim ? " dim" : ""}${n.result.grade === "D" ? " dd" : ""}`}
                    transform={`translate(${n.x} ${n.y})`}
                    tabIndex={0}
                    role="button"
                    aria-pressed={on}
                    aria-label={`${n.study.short}, grade ${n.result.grade}, ${distText(n)}, ${edgesOf(n.id).length} links`}
                    onClick={() => pick(n.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        pick(n.id);
                      }
                    }}
                  >
                    <Shape grade={n.result.grade} r={n.r} />
                    <text className="gl" textAnchor="middle" dy="0.35em">
                      {n.result.grade}
                    </text>
                    <text className="gid" textAnchor="middle" y={n.r + 14}>
                      {n.id}
                    </text>
                    <title>{`${n.study.short} · grade ${n.result.grade} · ${distText(n)}`}</title>
                  </g>
                );
              })}
            </g>
          </svg>
          <p className="kg-status" aria-live="polite">
            {caption ?? (node ? `${node.id}: ${edgesOf(node.id).length} computed links.` : "Select a node to see its links; hover a line to read why it is drawn.")}
          </p>
        </div>

        <aside className="kg-side" aria-label={`Selected ${unit}`}>
          {node ? detail(node) : <p className="kg-empty">No {unit} selected. Nodes are ordered clockwise from the top by rank; size, shape and letter give the grade (A largest, D smallest and dashed).</p>}
        </aside>
      </div>

      <div className="kg-legend" aria-label="Legend">
        {GRADES.map((k) => (
          <span key={k}>
            <svg viewBox="-20 -20 40 40" width="22" height="22" aria-hidden="true">
              <Shape grade={k} r={k === "A" ? 13 : k === "B" ? 11 : k === "C" ? 9 : 8} />
              <text className="gl" textAnchor="middle" dy="0.35em">
                {k}
              </text>
            </svg>
            Grade {k} ({counts[k]})
          </span>
        ))}
        <span>
          <svg viewBox="0 0 30 10" width="30" height="10" aria-hidden="true">
            <line className="ge rel" x1="0" y1="5" x2="30" y2="5" />
          </svg>
          linked: related study
        </span>
        <span>
          <svg viewBox="0 0 30 10" width="30" height="10" aria-hidden="true">
            <line className="ge" x1="0" y1="5" x2="30" y2="5" />
          </svg>
          shared variables or publications
        </span>
      </div>

      <figcaption>
        <b>
          Figure {figure} | Evidence network of the {g.nodes.length} {unit}s.
        </b>{" "}
        Size, shape, letter and outline give the grade against the active scenario; {unit}s without a comparable record (grade D) stay visible, dimmed and dashed. Links are <b>computed by the engine from the pack</b>, not statements extracted from the authors&apos; texts: a thick line joins {unit}s listed as related in the pack; a thin line joins {unit}s that both record at least two variables that not every {unit} records, or that share a publication DOI. The layout is a fixed circle in rank order.
      </figcaption>

      <details className="kg-alt">
        <summary>
          Table form of the network ({g.nodes.length} {unit}s, same order)
        </summary>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>{unit.charAt(0).toUpperCase() + unit.slice(1)}</th>
              <th>Grade</th>
              <th>Distance</th>
              <th>Linked to</th>
            </tr>
          </thead>
          <tbody>
            {g.nodes.map((n) => (
              <tr key={n.id}>
                <td>{n.index + 1}</td>
                <td>
                  <button type="button" className="linkbtn" onClick={() => pick(n.id)}>
                    {n.id} · {n.study.short}
                  </button>
                </td>
                <td>{n.result.grade}</td>
                <td>{n.result.distance === null ? "none" : num(n.result.distance)}</td>
                <td>
                  {edgesOf(n.id)
                    .map((e) => (e.a === n.id ? e.b : e.a))
                    .join(", ") || "none"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

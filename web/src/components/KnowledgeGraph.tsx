import { useEffect, useMemo, useRef, useState } from "react";
import type { Grade, Scenario } from "../engine";
import { useData, useProv } from "./ctx";
import { buildEdges, buildGraph, createSim, edgeText, matchingVariables, simLinks, tick } from "../report/graph";
import type { GraphNode, Sim } from "../report/graph";
import { doiOf, num, varOf } from "../report/format";

const W = 920;
const H = 560;
const GRADES: Grade[] = ["A", "B", "C", "D"];

/**
 * Evidence network as a living graph: linked nodes pull together, any node can be dragged and its neighbours follow,
 * and a very slow drift keeps the picture from looking frozen. React renders the nodes once at their settled position;
 * the animation then moves them by writing to the DOM directly, so a frame never re-renders the component.
 */
export function KnowledgeGraph({ scenario, figure }: { scenario: Scenario; figure: number }) {
  const { pack, lens } = useData();
  const open = useProv();
  const unit = lens.unit_of_study ?? "study";
  const g = useMemo(() => buildGraph(pack, scenario, W, H), [pack, scenario]);
  const slot = useMemo(() => new Map(pack.studies.map((s, i) => [s.id, i])), [pack]);
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const svg = useRef<SVGSVGElement>(null);
  const nodeEls = useRef(new Map<string, SVGGElement>());
  const edgeEls = useRef(new Map<string, SVGLineElement>());
  const sim = useRef<Sim | null>(null);
  const alpha = useRef(0);
  const drag = useRef<{ i: number; id: string; x0: number; y0: number; moved: boolean } | null>(null);
  const start = useRef(g);
  start.current = g;

  // Live simulation. It starts from the settled layout, so nothing moves until a node is dragged.
  useEffect(() => {
    const first = start.current;
    const s = createSim(pack.studies.length, simLinks(pack, buildEdges(pack)), W, H);
    for (const n of first.nodes) {
      const k = slot.get(n.id)!;
      s.x[k] = n.x;
      s.y[k] = n.y;
    }
    sim.current = s;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ids = pack.studies.map((x) => x.id);
    const px = new Array<number>(ids.length).fill(0);
    const py = new Array<number>(ids.length).fill(0);
    let raf = 0;
    let visible = true;
    const t0 = performance.now();
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const pinned = drag.current?.i ?? -1;
      if (alpha.current > 0.004) {
        tick(s, alpha.current, pinned);
        alpha.current *= 0.975;
      } else if (still) return;
      const sec = (t - t0) / 1000;
      for (let i = 0; i < ids.length; i++) {
        const drift = still || i === pinned ? 0 : 1.8;
        px[i] = s.x[i] + drift * Math.sin(sec * 0.55 + i * 1.7);
        py[i] = s.y[i] + drift * Math.cos(sec * 0.45 + i * 2.3);
        nodeEls.current.get(ids[i])?.setAttribute("transform", `translate(${px[i].toFixed(2)} ${py[i].toFixed(2)})`);
      }
      for (const [key, el] of edgeEls.current) {
        const [a, b] = key.split("|");
        const i = slot.get(a)!;
        const j = slot.get(b)!;
        el.setAttribute("x1", px[i].toFixed(2));
        el.setAttribute("y1", py[i].toFixed(2));
        el.setAttribute("x2", px[j].toFixed(2));
        el.setAttribute("y2", py[j].toFixed(2));
      }
    };
    raf = requestAnimationFrame(frame);
    const io = new IntersectionObserver((entries) => (visible = entries.some((e) => e.isIntersecting)));
    if (svg.current) io.observe(svg.current);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [pack, slot]);

  // Close the detail card by clicking anywhere outside it (except nodes, the table form and the source panel) or with Escape.
  useEffect(() => {
    if (!sel) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element)) return;
      if (!e.target.closest(".kg-card, .gnode, .prov, .kg-alt")) setSel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSel(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sel]);

  const node = g.nodes.find((n) => n.id === sel) ?? null;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const edgesOf = (id: string) => g.edges.filter((e) => e.a === id || e.b === id);
  const focus = hover ?? sel;
  const near = new Set(focus ? edgesOf(focus).flatMap((e) => [e.a, e.b]) : []);
  const counts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const n of g.nodes) counts[n.result.grade]++;
  const nameOf = (id: string) => byId.get(id)?.study.short ?? id;
  const distText = (n: GraphNode) => (n.result.distance === null ? "no comparable record" : `d = ${num(n.result.distance)}`);
  const edgeHit = hoverEdge ? g.edges.find((e) => `${e.a}|${e.b}` === hoverEdge) : null;

  const point = (e: React.PointerEvent): [number, number] => {
    const box = svg.current!.getBoundingClientRect();
    return [((e.clientX - box.left) * W) / box.width, ((e.clientY - box.top) * H) / box.height];
  };
  const down = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    const [x, y] = point(e);
    drag.current = { i: slot.get(id)!, id, x0: x, y0: y, moved: false };
    svg.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const s = sim.current;
    if (!d || !s) return;
    const [x, y] = point(e);
    if (!d.moved && Math.hypot(x - d.x0, y - d.y0) < 4) return;
    if (!d.moved) setDragging(true);
    d.moved = true;
    s.x[d.i] = Math.min(W - 30, Math.max(30, x));
    s.y[d.i] = Math.min(H - 42, Math.max(30, y));
    alpha.current = Math.max(alpha.current, 0.35);
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    svg.current?.releasePointerCapture(e.pointerId);
    setDragging(false);
    if (!d.moved) setSel((cur) => (cur === d.id ? null : d.id));
    else alpha.current = Math.max(alpha.current, 0.2);
  };
  const reset = () => {
    const s = sim.current;
    if (!s) return;
    for (const n of g.nodes) {
      const k = slot.get(n.id)!;
      s.x[k] = n.x;
      s.y[k] = n.y;
      s.vx[k] = 0;
      s.vy[k] = 0;
    }
    alpha.current = 0.02;
  };

  const detail = (n: GraphNode) => {
    const matches = matchingVariables(pack, scenario, n.id);
    const doi = doiOf(pack, n.id);
    const obj = n.study.summary.objective?.trim() ?? "";
    const edges = edgesOf(n.id);
    return (
      <>
        <header>
          <span className={`kg-badge g${n.result.grade}`}>{n.result.grade}</span>
          <h4>{n.study.short}</h4>
          <button type="button" className="kg-close" aria-label="Close" onClick={() => setSel(null)}>
            ×
          </button>
        </header>
        <p className="kg-sub">{n.study.title}</p>
        <dl>
          <dt>Grade and distance</dt>
          <dd>
            {n.result.grade}
            {n.result.grade === "D" ? " · no comparable record" : ""}
            {n.result.distance !== null && (
              <>
                {" · "}
                {n.result.nearest ? (
                  <button type="button" className="src" title="Show source: file, row and DOI" onClick={() => open(n.result.nearest!)}>
                    d = {num(n.result.distance)}
                  </button>
                ) : (
                  `d = ${num(n.result.distance)}`
                )}
              </>
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
          <dt>Objective</dt>
          <dd>{obj ? (obj.length > 300 ? obj.slice(0, 300).trimEnd() + "…" : obj) : "Not stated in the pack."}</dd>
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
                      <button type="button" className="linkbtn" onClick={() => setSel(o)} onMouseEnter={() => setHover(o)} onMouseLeave={() => setHover(null)}>
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
      </>
    );
  };

  return (
    <figure className="fig wide kg" id="fig-graph">
      <div className={`kg-stage${dragging ? " dragging" : ""}${focus ? " focus" : ""}`}>
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label={`Evidence network of ${g.nodes.length} ${unit}s. Linked ${unit}s are drawn close together.`}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <defs>
            <pattern id="kg-dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1" className="kg-dot" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#kg-dots)" />
          <g>
            {g.edges.map((e) => {
              const a = byId.get(e.a)!;
              const b = byId.get(e.b)!;
              const key = `${e.a}|${e.b}`;
              const on = focus ? e.a === focus || e.b === focus : hoverEdge === key;
              return (
                <line
                  key={key}
                  ref={(el) => {
                    if (el) edgeEls.current.set(key, el);
                    else edgeEls.current.delete(key);
                  }}
                  className={`ge${on ? " on" : ""}${e.kinds.includes("related") || e.kinds.includes("publication") ? " rel" : ""}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  onMouseEnter={() => setHoverEdge(key)}
                  onMouseLeave={() => setHoverEdge(null)}
                />
              );
            })}
          </g>
          <g>
            {g.nodes.map((n) => {
              const on = sel === n.id;
              const lit = !focus || n.id === focus || near.has(n.id);
              return (
                <g
                  key={n.id}
                  ref={(el) => {
                    if (el) nodeEls.current.set(n.id, el);
                    else nodeEls.current.delete(n.id);
                  }}
                  className={`gnode g${n.result.grade}${on ? " sel" : ""}${lit ? "" : " dim"}`}
                  transform={`translate(${n.x} ${n.y})`}
                  tabIndex={0}
                  role="button"
                  aria-pressed={on}
                  aria-label={`${n.study.short}, grade ${n.result.grade}, ${distText(n)}, ${edgesOf(n.id).length} links`}
                  onPointerDown={(e) => down(e, n.id)}
                  onPointerEnter={() => !drag.current && setHover(n.id)}
                  onPointerLeave={() => setHover(null)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setSel((cur) => (cur === n.id ? null : n.id));
                    }
                  }}
                >
                  {on && <circle className="gring" r={n.r + 7} />}
                  <circle className="gn" r={n.r} />
                  <text className="gl" textAnchor="middle" dy="0.36em" style={{ fontSize: n.result.grade === "D" ? 9 : 12 }}>
                    {n.result.grade}
                  </text>
                  <text className="gid" textAnchor="middle" y={n.r + 15}>
                    {n.study.short}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        <div className="kg-tools noprint">
          <button type="button" className="kg-float-btn" onClick={reset}>
            Reset layout
          </button>
        </div>

        <div className="kg-legend" aria-label="Legend">
          {GRADES.map((k) => (
            <span key={k}>
              <i className={`kg-badge g${k}`}>{k}</i>
              {counts[k]}
            </span>
          ))}
          <span>
            <i className="kg-line rel" /> related
          </span>
          <span>
            <i className="kg-line" /> shared variables
          </span>
        </div>

        <p className="kg-status" aria-live="polite">
          {edgeHit ? `${nameOf(edgeHit.a)} – ${nameOf(edgeHit.b)}: ${edgeText(pack, edgeHit)}` : focus ? `${nameOf(focus)}: ${edgesOf(focus).length} computed links` : "Drag a node to rearrange the network · select one to open it"}
        </p>

        {node && (
          <aside className="kg-card" aria-label={`Selected ${unit}`}>
            {detail(node)}
          </aside>
        )}
      </div>

      <figcaption>
        <b>
          Figure {figure} | Evidence network of the {g.nodes.length} {unit}s.
        </b>{" "}
        Size, letter and outline give the grade against the active scenario; {unit}s without a comparable record (grade D) stay visible, small and dashed. Links are <b>computed by the engine from the pack</b>, not statements extracted from the authors&apos; texts: a thick line joins {unit}s listed as related in the pack or sharing a publication DOI; a thin line joins {unit}s that both record at least two variables that not every {unit} records. Linked {unit}s are pulled together by a force layout that always starts from the same positions; beyond that, position carries no meaning, and nodes can be dragged freely.
      </figcaption>

      <details className="kg-alt">
        <summary>
          Table form of the network ({g.nodes.length} {unit}s, by rank)
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
                  <button type="button" className="linkbtn" onClick={() => setSel(n.id)}>
                    {n.id} · {n.study.short}
                  </button>
                </td>
                <td>{n.result.grade}</td>
                <td>{n.result.distance === null ? "none" : num(n.result.distance)}</td>
                <td>
                  {edgesOf(n.id)
                    .map((e) => nameOf(e.a === n.id ? e.b : e.a))
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

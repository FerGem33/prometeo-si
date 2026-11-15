import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { Grade, Scenario } from "../engine";
import { ProvCtx, useData } from "./ctx";
import { Provenance } from "./Provenance";
import { buildGraph, edgeText, matchingVariables } from "../report/graph";
import type { GraphEdge, GraphNode } from "../report/graph";
import { doiOf, num, varOf } from "../report/format";
import { ghostNetwork } from "./graph/ghosts";

const SIZE = 760;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.6;
const GRADES: Grade[] = ["A", "B", "C", "D"];
const RADII: Record<Grade, number> = { A: 17, B: 14, C: 11, D: 8 };

type Cam = { x: number; y: number; k: number };
const IDENTITY: Cam = { x: 0, y: 0, k: 1 };

function Shape({ grade, r }: { grade: Grade; r: number }) {
  const common = { className: `gn gn-${grade}`, strokeDasharray: grade === "D" ? "4 3" : undefined };
  if (grade === "A") return <circle r={r} {...common} />;
  if (grade === "B") return <rect x={-r} y={-r} width={2 * r} height={2 * r} {...common} />;
  if (grade === "C") return <path d={`M0,${-r - 3} L${r + 3},0 L0,${r + 3} L${-r - 3},0 Z`} {...common} />;
  return <circle r={r} {...common} />;
}

/** A gently curved edge: straight chords read as unrelated crossings in a dense ring. */
function curve(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = len * 0.07;
  const cx = mx - (dy / len) * off;
  const cy = my + (dx / len) * off;
  return `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`;
}

export function EvidenceMap({ scenario, onReport }: { scenario: Scenario; onReport: () => void }) {
  const { pack, lens } = useData();
  const unit = lens.unit_of_study ?? "study";
  const g = useMemo(() => buildGraph(pack, scenario, SIZE), [pack, scenario]);
  const ghosts = useMemo(() => ghostNetwork(SIZE, `${pack.contract}:${pack.meta.id}:${pack.studies.length}`), [pack]);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nodeRefs = useRef<Record<string, SVGGElement | null>>({});

  const [prov, setProv] = useState<string | null>(null);
  const openProv = useCallback((id: string) => setProv(id), []);

  const [cam, setCam] = useState<Cam>(IDENTITY);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<{ left: number; top: number; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [grades, setGrades] = useState<Record<Grade, boolean>>({ A: true, B: true, C: true, D: true });
  const [kbd, setKbd] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);

  const anim = useRef<number | null>(null);
  const pan = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);
  const dragNode = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  // new scenario or pack: re-seed positions and reset the camera
  useEffect(() => {
    setPos(Object.fromEntries(g.nodes.map((n) => [n.id, { x: n.x, y: n.y }])));
    setCam(IDENTITY);
    setSel(null);
    setHover(null);
    setTip(null);
  }, [g]);

  const byId = useMemo(() => new Map(g.nodes.map((n) => [n.id, n])), [g]);
  const xy = useCallback((n: GraphNode) => pos[n.id] ?? { x: n.x, y: n.y }, [pos]);

  const edgesOf = useCallback((id: string) => g.edges.filter((e) => e.a === id || e.b === id), [g]);
  const linked = useMemo(() => {
    const set = new Set<string>();
    if (sel) for (const e of edgesOf(sel)) {
      set.add(e.a);
      set.add(e.b);
    }
    return set;
  }, [edgesOf, sel]);

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (id: string) => {
      if (!q) return false;
      const s = byId.get(id);
      return id.toLowerCase().includes(q) || !!s?.study.short.toLowerCase().includes(q);
    },
    [byId, q],
  );
  const shown = g.nodes.filter((n) => grades[n.result.grade]);
  const shownIds = new Set(shown.map((n) => n.id));

  const node = sel ? byId.get(sel) ?? null : null;
  // a node with no computed links should not empty the rest of the map
  const focusDim = !!sel && edgesOf(sel).length > 0;
  const counts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const n of g.nodes) counts[n.result.grade]++;

  // ---- camera helpers -------------------------------------------------------
  // the SVG keeps its square viewBox but is drawn inside a shorter box, so the mapping
  // between client pixels and user units has to account for the letterboxing
  const metrics = useCallback(() => {
    const box = svgRef.current?.getBoundingClientRect();
    const w = box?.width ?? SIZE;
    const h = box?.height ?? SIZE;
    const s = Math.min(w / SIZE, h / SIZE) || 1;
    return { box, s, ox: (w - SIZE * s) / 2, oy: (h - SIZE * s) / 2 };
  }, []);

  const toUser = useCallback(
    (clientX: number, clientY: number) => {
      const { box, s, ox, oy } = metrics();
      if (!box) return { x: 0, y: 0 };
      return { x: (clientX - box.left - ox) / s, y: (clientY - box.top - oy) / s };
    },
    [metrics],
  );

  const stopAnim = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  };

  const animateTo = useCallback((target: Cam) => {
    stopAnim();
    const from = cam;
    const t0 = performance.now();
    const D = 200;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / D);
      const e = 1 - Math.pow(1 - p, 3);
      setCam({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e });
      if (p < 1) anim.current = requestAnimationFrame(step);
      else anim.current = null;
    };
    anim.current = requestAnimationFrame(step);
  }, [cam]);

  const focusOn = useCallback(
    (n: GraphNode) => {
      const k = 1.9;
      const p = xy(n);
      animateTo({ k, x: SIZE / 2 - p.x * k, y: SIZE / 2 - p.y * k });
    },
    [animateTo, xy],
  );

  // wheel zoom anchored at the cursor (native listener so preventDefault works)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      stopAnim();
      const p = toUser(ev.clientX, ev.clientY);
      setCam((c) => {
        const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.k * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
        const f = k / c.k;
        return { k, x: p.x - (p.x - c.x) * f, y: p.y - (p.y - c.y) * f };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toUser]);

  // Escape clears the selection from anywhere on the screen
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setSel(null);
        setTip(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => stopAnim(), []);

  // ---- pointer: pan, node drag ---------------------------------------------
  const onPointerDown = (ev: ReactPointerEvent) => {
    stopAnim();
    setTip(null);
    suppressClick.current = false;
    pan.current = { px: ev.clientX, py: ev.clientY, cx: cam.x, cy: cam.y };
    setPanning(true);
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev: ReactPointerEvent) => {
    const d = dragNode.current;
    if (d) {
      const p = toUser(ev.clientX, ev.clientY);
      // translate the pointer inside the camera transform
      const ux = (p.x - cam.x) / cam.k;
      const uy = (p.y - cam.y) / cam.k;
      setPos((prev) => ({ ...prev, [d.id]: { x: ux - d.dx, y: uy - d.dy } }));
      d.moved = true;
      suppressClick.current = true;
      return;
    }
    const p = pan.current;
    if (!p) return;
    const { s } = metrics();
    setCam((c) => ({ ...c, x: p.cx + (ev.clientX - p.px) / s, y: p.cy + (ev.clientY - p.py) / s }));
  };

  const onPointerUp = (ev: ReactPointerEvent) => {
    pan.current = null;
    setPanning(false);
    dragNode.current = null;
    if ((ev.currentTarget as Element).hasPointerCapture?.(ev.pointerId)) (ev.currentTarget as Element).releasePointerCapture(ev.pointerId);
  };

  const startNodeDrag = (ev: ReactPointerEvent, n: GraphNode) => {
    ev.stopPropagation();
    stopAnim();
    suppressClick.current = false;
    const p = toUser(ev.clientX, ev.clientY);
    const c = xy(n);
    dragNode.current = { id: n.id, dx: (p.x - cam.x) / cam.k - c.x, dy: (p.y - cam.y) / cam.k - c.y, moved: false };
  };

  // ---- tooltips -------------------------------------------------------------
  const showTip = (ev: ReactMouseEvent, text: string) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const left = Math.max(8, Math.min(ev.clientX - box.left + 14, box.width - 268));
    const top = Math.max(8, ev.clientY - box.top - 34);
    setTip({ left, top, text });
  };

  // ---- keyboard -------------------------------------------------------------
  const order = g.nodes.map((n) => n.id);
  const activeId = (kbd && order.includes(kbd) ? kbd : null) ?? order[0] ?? null;
  const move = (from: string, delta: number) => {
    const i = order.indexOf(from);
    if (i < 0) return;
    const next = order[(i + delta + order.length) % order.length];
    setKbd(next);
    nodeRefs.current[next]?.focus();
  };
  const onNodeKey = (ev: ReactKeyboardEvent, id: string) => {
    if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
      ev.preventDefault();
      move(id, 1);
    } else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
      ev.preventDefault();
      move(id, -1);
    } else if (ev.key === "Home") {
      ev.preventDefault();
      move(id, -order.indexOf(id));
    } else if (ev.key === "End") {
      ev.preventDefault();
      move(id, order.length - 1 - order.indexOf(id));
    } else if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      setSel((s) => (s === id ? null : id));
    }
  };

  const distText = (n: GraphNode) => (n.result.distance === null ? "no comparable record" : `d = ${num(n.result.distance)}`);
  const nameOf = (id: string) => byId.get(id)?.study.short ?? id;

  const detail = (n: GraphNode) => {
    const matchesVars = matchingVariables(pack, scenario, n.id);
    const doi = doiOf(pack, n.id);
    const obj = n.study.summary.objective?.trim() ?? "";
    const edges = edgesOf(n.id);
    return (
      <div>
        <h2>{n.study.short}</h2>
        <p className="map-study-title">{n.study.title}</p>
        <dl>
          <dt>Objective</dt>
          <dd>{obj ? (obj.length > 380 ? obj.slice(0, 380).trimEnd() + "…" : obj) : "Not stated in the pack."}</dd>
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
              <button type="button" className="src" title="Show source: file, row and DOI" onClick={() => openProv(n.result.nearest!)}>
                {num(n.result.distance)}
              </button>
            ) : (
              num(n.result.distance)
            )}
          </dd>
          <dt>Variables matching the scenario</dt>
          <dd>
            {matchesVars.length === 0
              ? "None: no record holds a scenario value."
              : matchesVars.map((m, i) => (
                  <span key={m.variable}>
                    {i > 0 && ", "}
                    <button type="button" className="src" title="Show source: file, row and DOI" onClick={() => openProv(m.record)}>
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
    <ProvCtx.Provider value={openProv}>
      <div className="screen map-screen">
        <header className="map-head">
          <div>
            <p className="map-kicker">Evidence map</p>
            <h1>
              The {g.nodes.length} {unit}s and what links them
            </h1>
            <p className="map-sub">
              Size, shape and letter give the grade against the active scenario. Links are computed by the engine from the pack: shared variables,
              shared publications or a declared relation.
            </p>
          </div>
          <button type="button" className="chip noprint" onClick={onReport}>
            Back to report
          </button>
        </header>

        <div className="map-toolbar noprint">
          <label className="map-search">
            <span>Find</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="id or short name"
              aria-label={`Find a ${unit} by id or short name`}
            />
          </label>
          <div className="map-grades" role="group" aria-label="Filter by grade">
            {GRADES.map((k) => (
              <button
                key={k}
                type="button"
                className={`chip${grades[k] ? " on" : ""}`}
                aria-pressed={grades[k]}
                onClick={() => setGrades((s) => ({ ...s, [k]: !s[k] }))}
              >
                {k} ({counts[k]})
              </button>
            ))}
          </div>
          <div className="map-zoom" role="group" aria-label="Zoom">
            <button type="button" className="chip" onClick={() => setCam((c) => ({ ...c, k: Math.max(ZOOM_MIN, c.k / 1.2) }))} aria-label="Zoom out">
              −
            </button>
            <span className="map-zoom-value">{Math.round(cam.k * 100)}%</span>
            <button type="button" className="chip" onClick={() => setCam((c) => ({ ...c, k: Math.min(ZOOM_MAX, c.k * 1.2) }))} aria-label="Zoom in">
              +
            </button>
          </div>
          <button type="button" className="chip" onClick={() => animateTo(IDENTITY)}>
            Reset view
          </button>
          {sel && (
            <button type="button" className="chip" onClick={() => setSel(null)}>
              Clear selection
            </button>
          )}
        </div>

        <div className="map-grid">
          <div className={`map-canvas${panning ? " is-panning" : ""}`} ref={boxRef}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="group"
              aria-label={`Evidence network of ${g.nodes.length} ${unit}s. Select one to see its links.`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.k})`}>
                <g className={`map-ghosts${focusDim ? " is-dim" : ""}`} aria-hidden="true">
                  {ghosts.edges.map((e, i) => {
                    const a = ghosts.nodes[e.a];
                    const b = ghosts.nodes[e.b];
                    return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={0.7} opacity={e.o} />;
                  })}
                  {ghosts.nodes.map((n, i) => (
                    <circle key={i} cx={n.x} cy={n.y} r={n.r} opacity={n.o} />
                  ))}
                </g>

                {g.edges.map((e: GraphEdge) => {
                  const a = byId.get(e.a);
                  const b = byId.get(e.b);
                  if (!a || !b || !shownIds.has(e.a) || !shownIds.has(e.b)) return null;
                  const on = !!sel && (e.a === sel || e.b === sel);
                  const off = focusDim && !on;
                  const d = curve(xy(a), xy(b));
                  return (
                    <g key={`${e.a}|${e.b}`} className={`map-edge${on ? " on" : ""}${off ? " off" : ""}`}>
                      <path d={d} className={`ge${e.kinds.includes("related") ? " rel" : ""}`} />
                      <path
                        d={d}
                        className="map-edge-hit"
                        onMouseEnter={(ev) => showTip(ev, `${e.a} – ${e.b}: ${edgeText(pack, e)}`)}
                        onMouseMove={(ev) => showTip(ev, `${e.a} – ${e.b}: ${edgeText(pack, e)}`)}
                        onMouseLeave={() => setTip(null)}
                      />
                    </g>
                  );
                })}

                {shown.map((n) => {
                  const p = xy(n);
                  const on = sel === n.id;
                  const dim = (focusDim && !on && !linked.has(n.id)) || (!!q && !matches(n.id));
                  const focusable = activeId === n.id;
                  return (
                    <g
                      key={n.id}
                      ref={(el) => {
                        nodeRefs.current[n.id] = el;
                      }}
                      className={`gnode${on ? " sel" : ""}${dim ? " dim" : ""}${n.result.grade === "D" ? " dd" : ""}${hover === n.id ? " hov" : ""}`}
                      transform={`translate(${p.x} ${p.y})`}
                      tabIndex={focusable ? 0 : -1}
                      role="button"
                      aria-pressed={on}
                      aria-label={`${n.study.short}, grade ${n.result.grade}, ${distText(n)}, ${edgesOf(n.id).length} links`}
                      onFocus={() => setKbd(n.id)}
                      onClick={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        setSel((s) => (s === n.id ? null : n.id));
                      }}
                      onDoubleClick={() => {
                        setSel(n.id);
                        focusOn(n);
                      }}
                      onPointerDown={(ev) => startNodeDrag(ev, n)}
                      onMouseEnter={(ev) => {
                        setHover(n.id);
                        showTip(ev, `${n.id} · ${n.study.short} · grade ${n.result.grade} · ${distText(n)}`);
                      }}
                      onMouseMove={(ev) => showTip(ev, `${n.id} · ${n.study.short} · grade ${n.result.grade} · ${distText(n)}`)}
                      onMouseLeave={() => {
                        setHover(null);
                        setTip(null);
                      }}
                      onKeyDown={(ev) => onNodeKey(ev, n.id)}
                    >
                      <Shape grade={n.result.grade} r={RADII[n.result.grade]} />
                      <text className="gl" textAnchor="middle" dy="0.35em">
                        {n.result.grade}
                      </text>
                      <text className="gid" textAnchor="middle" y={RADII[n.result.grade] + 14}>
                        {n.id}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            {tip && (
              <div className="map-tip" style={{ left: tip.left, top: tip.top }} role="status">
                {tip.text}
              </div>
            )}
          </div>

          <aside className="map-side" aria-label={`Selected ${unit}`}>
            {node ? (
              detail(node)
            ) : (
              <div>
                <p className="map-empty">No {unit} selected. Click a node to read it; double-click to focus on it and its neighbours.</p>
                <ul className="map-legend">
                  {GRADES.map((k) => (
                    <li key={k}>
                      <svg viewBox="-20 -20 40 40" width="22" height="22" aria-hidden="true">
                        <Shape grade={k} r={k === "A" ? 13 : k === "B" ? 11 : k === "C" ? 9 : 8} />
                        <text className="gl" textAnchor="middle" dy="0.35em">
                          {k}
                        </text>
                      </svg>
                      Grade {k} ({counts[k]})
                    </li>
                  ))}
                  <li>
                    <svg viewBox="0 0 30 10" width="30" height="10" aria-hidden="true">
                      <line className="ge rel" x1="0" y1="5" x2="30" y2="5" />
                    </svg>
                    linked: related study
                  </li>
                  <li>
                    <svg viewBox="0 0 30 10" width="30" height="10" aria-hidden="true">
                      <line className="ge" x1="0" y1="5" x2="30" y2="5" />
                    </svg>
                    shared variables or publications
                  </li>
                </ul>
              </div>
            )}
          </aside>
        </div>

        <p className="map-note">
          Drag the background to pan and use the wheel to zoom; drag a node to move it. Positions are a reading aid, not a measurement. The faint
          points behind the network are decorative texture, not studies. Links are computed by the engine from the pack, not statements extracted
          from the authors&apos; texts.
        </p>

        <details className="map-alt">
          <summary>
            Table form of the network ({g.nodes.length} {unit}s, rank order)
          </summary>
          <div className="map-alt-scroll">
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
                      .map((e) => (e.a === n.id ? e.b : e.a))
                      .join(", ") || "none"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </details>

        {prov && <Provenance id={prov} onClose={() => setProv(null)} />}
      </div>
    </ProvCtx.Provider>
  );
}

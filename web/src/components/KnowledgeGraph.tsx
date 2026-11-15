import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Grade, Scenario } from "../engine";
import { useData, useProv } from "./ctx";
import { buildGraph, edgeText, matchingVariables } from "../report/graph";
import type { GraphEdge, GraphNode } from "../report/graph";
import { doiOf, num, varOf } from "../report/format";

const SIZE = 640;
const GRADES: Grade[] = ["A", "B", "C", "D"];

interface ForceNode {
  id: string;
  kind: "study" | "var" | "mat";
  label: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag?: boolean;
  grade?: Grade;
}

interface ForceLink {
  a: string;
  b: string;
  kind: "study" | "hw" | "var" | "mat";
  label: string;
  s: ForceNode;
  e: ForceNode;
}

function Shape({ grade, r }: { grade: Grade; r: number }) {
  const common = { className: `gn gn-${grade}`, strokeDasharray: grade === "D" ? "4 3" : undefined };
  if (grade === "A") return <circle r={r} {...common} />;
  if (grade === "B") return <rect x={-r} y={-r} width={2 * r} height={2 * r} {...common} />;
  if (grade === "C")
    return <path d={`M0,${-r - 3} L${r + 3},0 L0,${r + 3} L${-r - 3},0 Z`} {...common} />;
  return <circle r={r} {...common} />;
}

export function KnowledgeGraph({ scenario, figure }: { scenario: Scenario; figure: number }) {
  const { pack, lens } = useData();
  const open = useProv();
  const unit = lens.unit_of_study ?? "study";
  const g = useMemo(() => buildGraph(pack, scenario, SIZE), [pack, scenario]);

  const [mode, setMode] = useState<"force" | "circle">("force");
  const [showVars, setShowVars] = useState(true);
  const [showMats, setShowMats] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<GraphEdge | null>(null);
  const [hoverForceLink, setHoverForceLink] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const svgRef = useRef<SVGSVGElement>(null);
  const forceRef = useRef<{
    nodes: ForceNode[];
    links: ForceLink[];
    byId: Map<string, ForceNode>;
  } | null>(null);
  const isDraggingRef = useRef(false);

  const node = g.nodes.find((n) => n.id === sel) ?? null;
  const pos = new Map(g.nodes.map((n) => [n.id, n]));
  const edgesOf = (id: string) => g.edges.filter((e) => e.a === id || e.b === id);
  const linked = new Set(node ? edgesOf(node.id).flatMap((e) => [e.a, e.b]) : []);
  const counts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const n of g.nodes) counts[n.result.grade]++;

  // Physics step for interactive force-directed mode with collision separation
  const tickPhysics = useCallback(() => {
    const cur = forceRef.current;
    if (!cur) return;
    const { nodes, links } = cur;
    const c = SIZE / 2;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const d2 = dx * dx + dy * dy + 0.01;
        const d = Math.sqrt(d2);
        const f = 3800 / d2;
        dx /= d;
        dy /= d;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
        // Minimum label clearance so nodes never pile on top of each other
        const minSep = a.r + b.r + 34;
        if (d < minSep) {
          const push = (minSep - d) * 0.28;
          if (!a.drag) {
            a.x += dx * push;
            a.y += dy * push;
          }
          if (!b.drag) {
            b.x -= dx * push;
            b.y -= dy * push;
          }
        }
      }
    }
    for (const l of links) {
      const dx = l.e.x - l.s.x;
      const dy = l.e.y - l.s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const len = l.kind === "var" ? 185 : l.kind === "mat" ? 135 : 140;
      const f = (d - len) * 0.018 * (l.kind === "var" ? 0.32 : 0.85);
      l.s.vx += (dx / d) * f;
      l.s.vy += (dy / d) * f;
      l.e.vx -= (dx / d) * f;
      l.e.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      n.vx += (c - n.x) * 0.0034;
      n.vy += (c - n.y) * 0.0034;
      if (n.drag) continue;
      n.x += n.vx * 0.48;
      n.y += n.vy * 0.48;
      n.vx *= 0.58;
      n.vy *= 0.58;
      if (Number.isNaN(n.x) || Number.isNaN(n.y)) {
        n.x = c;
        n.y = c;
        n.vx = 0;
        n.vy = 0;
      }
      n.x = Math.max(48, Math.min(SIZE - 48, n.x));
      n.y = Math.max(38, Math.min(SIZE - 42, n.y));
    }
  }, []);

  // Build force-directed graph whenever pack, scenario grades, or node filters change
  const rebuildForce = useCallback(() => {
    const nodes: ForceNode[] = [];
    const rawLinks: { a: string; b: string; kind: "study" | "hw" | "var" | "mat"; label: string }[] = [];
    const byId = new Map<string, ForceNode>();

    // 1. Study nodes (carrying grade from g.nodes)
    for (const gn of g.nodes) {
      const fn: ForceNode = {
        id: gn.id,
        kind: "study",
        label: gn.study.short,
        r: gn.r,
        x: gn.x,
        y: gn.y,
        vx: 0,
        vy: 0,
        grade: gn.result.grade,
      };
      nodes.push(fn);
      byId.set(fn.id, fn);
    }

    // 2. Study-to-study edges from report/graph.ts
    for (const e of g.edges) {
      rawLinks.push({
        a: e.a,
        b: e.b,
        kind: e.kinds.includes("related") ? "study" : "hw",
        label: `${e.a} – ${e.b}: ${edgeText(pack, e)}`,
      });
    }

    // 3. Optional numeric variable hub nodes
    if (showVars) {
      const numVars = pack.schema.variables.filter((v) => v.type === "num");
      numVars.forEach((v, idx) => {
        const ang = (idx / Math.max(1, numVars.length)) * Math.PI * 2;
        const vid = `v:${v.id}`;
        const fn: ForceNode = {
          id: vid,
          kind: "var",
          label: v.label,
          r: 9,
          x: SIZE / 2 + Math.cos(ang) * 120,
          y: SIZE / 2 + Math.sin(ang) * 120,
          vx: 0,
          vy: 0,
        };
        nodes.push(fn);
        byId.set(vid, fn);
        for (const st of pack.studies) {
          const has = pack.records.some(
            (r) => r.study === st.id && Array.isArray(r.values[v.id]) && r.values[v.id] !== undefined,
          );
          if (has) {
            rawLinks.push({
              a: st.id,
              b: vid,
              kind: "var",
              label: `${st.short} records ${v.label}`,
            });
          }
        }
      });
    }

    // 4. Optional shared material nodes (>= 2 studies)
    if (showMats) {
      const matStudies = new Map<string, Set<string>>();
      for (const r of pack.records) {
        const mat = r.values.material;
        if (typeof mat === "string" && mat && mat !== "None") {
          if (!matStudies.has(mat)) matStudies.set(mat, new Set());
          matStudies.get(mat)!.add(r.study);
        }
      }
      let mIdx = 0;
      for (const [matName, set] of matStudies.entries()) {
        if (set.size < 2) continue;
        const mid = `m:${matName}`;
        const ang = (mIdx++ / 8) * Math.PI * 2 + 0.4;
        const fn: ForceNode = {
          id: mid,
          kind: "mat",
          label: matName,
          r: 6,
          x: SIZE / 2 + Math.cos(ang) * 175,
          y: SIZE / 2 + Math.sin(ang) * 175,
          vx: 0,
          vy: 0,
        };
        nodes.push(fn);
        byId.set(mid, fn);
        for (const sid of set) {
          if (byId.has(sid)) {
            rawLinks.push({
              a: sid,
              b: mid,
              kind: "mat",
              label: `${sid} tests material ${matName}`,
            });
          }
        }
      }
    }

    const links: ForceLink[] = [];
    for (const rl of rawLinks) {
      const s = byId.get(rl.a);
      const e = byId.get(rl.b);
      if (s && e) links.push({ ...rl, s, e });
    }

    forceRef.current = { nodes, links, byId };
    for (let k = 0; k < 220; k++) tickPhysics();
    setTick((t) => t + 1);
  }, [g, pack, showVars, showMats, tickPhysics]);

  useEffect(() => {
    rebuildForce();
  }, [rebuildForce]);

  const handlePointerDown = (fn: ForceNode, e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    fn.drag = true;
    isDraggingRef.current = false;
    svg.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      isDraggingRef.current = true;
      const pt = svg.createSVGPoint();
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const q = pt.matrixTransform(ctm.inverse());
        fn.x = Math.max(30, Math.min(SIZE - 30, q.x));
        fn.y = Math.max(30, Math.min(SIZE - 30, q.y));
        for (let i = 0; i < 2; i++) tickPhysics();
        setTick((t) => t + 1);
      }
    };

    const onUp = () => {
      fn.drag = false;
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      if (!isDraggingRef.current) {
        setSel((prev) => (prev === fn.id ? null : fn.id));
      }
    };

    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
  };

  const pick = (id: string) => setSel((s) => (s === id ? null : id));
  const nameOf = (id: string) => pos.get(id)?.study.short ?? id;
  const distText = (n: GraphNode) =>
    n.result.distance === null ? "no comparable record" : `d = ${num(n.result.distance)}`;
  const caption =
    hoverForceLink ??
    (hoverEdge ? `${hoverEdge.a} – ${hoverEdge.b}: ${edgeText(pack, hoverEdge)}` : null);

  const forceNeighbors = useMemo(() => {
    const s = new Set<string>();
    if (!sel || !forceRef.current) return s;
    for (const l of forceRef.current.links) {
      if (l.a === sel) s.add(l.b);
      if (l.b === sel) s.add(l.a);
    }
    return s;
  }, [sel]);

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
              <button
                type="button"
                className="src"
                title="Show source: file, row and DOI"
                onClick={() => open(n.result.nearest!)}
              >
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
                    <button
                      type="button"
                      className="src"
                      title="Show source: file, row and DOI"
                      onClick={() => open(m.record)}
                    >
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

  const auxDetail = () => {
    if (!sel || !forceRef.current) return null;
    const fn = forceRef.current.byId.get(sel);
    if (!fn || fn.kind === "study") return null;
    const connected = forceRef.current.links
      .filter((l) => l.a === sel || l.b === sel)
      .map((l) => (l.a === sel ? l.e : l.s))
      .filter((x) => x.kind === "study");
    return (
      <div>
        <h4>
          {fn.kind === "var" ? "Variable hub: " : "Shared material: "}
          {fn.label}
        </h4>
        <p className="kg-sub">
          {fn.kind === "var"
            ? `Recorded in ${connected.length} ${unit}s in this corpus.`
            : `Tested across ${connected.length} ${unit}s in this corpus.`}
        </p>
        <dl>
          <dt>Connected {unit}s ({connected.length})</dt>
          <dd>
            <ul>
              {connected.map((st) => (
                <li key={st.id}>
                  <button type="button" className="linkbtn" onClick={() => setSel(st.id)}>
                    {st.label} ({st.id})
                  </button>
                  {st.grade ? ` · grade ${st.grade}` : ""}
                </li>
              ))}
            </ul>
          </dd>
        </dl>
      </div>
    );
  };

  const fGraph = forceRef.current;

  return (
    <figure className="fig wide kg" id="fig-graph">
      <div className="figctl noprint" role="group" aria-label="Knowledge graph controls">
        <span>Layout:</span>
        <button
          type="button"
          className="chip"
          aria-pressed={mode === "force"}
          onClick={() => setMode("force")}
        >
          Force-directed (interactive drag)
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={mode === "circle"}
          onClick={() => setMode("circle")}
        >
          Ranked circle
        </button>
        {mode === "force" && (
          <>
            <span className="sep-dot">·</span>
            <button
              type="button"
              className="chip"
              aria-pressed={showVars}
              onClick={() => setShowVars((v) => !v)}
            >
              ◆ Variables
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={showMats}
              onClick={() => setShowMats((m) => !m)}
            >
              ○ Shared materials
            </button>
            <button type="button" className="chip" onClick={rebuildForce}>
              Reset physics
            </button>
          </>
        )}
      </div>

      <div className="kg-grid">
        <div className="kg-plot">
          {mode === "circle" || !fGraph ? (
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="group"
              aria-label={`Evidence network of ${g.nodes.length} ${unit}s, ordered by rank, clockwise from the top`}
            >
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
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="group"
              aria-label={`Interactive force-directed evidence network of ${g.nodes.length} ${unit}s`}
            >
              <g>
                {fGraph.links.map((l, idx) => {
                  const on = sel && (l.a === sel || l.b === sel);
                  return (
                    <line
                      key={`fl-${idx}`}
                      className={`ge${on ? " on" : ""}${sel && !on ? " off" : ""}${l.kind === "study" ? " rel" : ""}${l.kind === "var" || l.kind === "mat" ? " aux" : ""}`}
                      x1={l.s.x}
                      y1={l.s.y}
                      x2={l.e.x}
                      y2={l.e.y}
                      strokeDasharray={l.kind === "mat" ? "3 3" : l.kind === "var" ? "2 3" : undefined}
                      onMouseEnter={() => setHoverForceLink(l.label)}
                      onMouseLeave={() => setHoverForceLink(null)}
                    >
                      <title>{l.label}</title>
                    </line>
                  );
                })}
              </g>
              <g>
                {fGraph.nodes.map((fn) => {
                  const on = sel === fn.id;
                  const dim = sel && !on && !forceNeighbors.has(fn.id);
                  if (fn.kind === "study") {
                    const gr = fn.grade ?? "D";
                    return (
                      <g
                        key={fn.id}
                        className={`gnode${on ? " sel" : ""}${dim ? " dim" : ""}${gr === "D" ? " dd" : ""}`}
                        transform={`translate(${fn.x} ${fn.y})`}
                        tabIndex={0}
                        role="button"
                        aria-pressed={on}
                        aria-label={`${fn.label}, grade ${gr}`}
                        onPointerDown={(e) => handlePointerDown(fn, e)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            pick(fn.id);
                          }
                        }}
                      >
                        <Shape grade={gr} r={fn.r} />
                        <text className="gl" textAnchor="middle" dy="0.35em">
                          {gr}
                        </text>
                        <text className="gid" textAnchor="middle" y={fn.r + 13}>
                          {fn.label}
                        </text>
                      </g>
                    );
                  }
                  if (fn.kind === "var") {
                    return (
                      <g
                        key={fn.id}
                        className={`gnode gnode-var${on ? " sel" : ""}${dim ? " dim" : ""}`}
                        transform={`translate(${fn.x} ${fn.y})`}
                        tabIndex={0}
                        role="button"
                        aria-pressed={on}
                        aria-label={`Variable ${fn.label}`}
                        onPointerDown={(e) => handlePointerDown(fn, e)}
                      >
                        <rect
                          x={-7}
                          y={-7}
                          width={14}
                          height={14}
                          transform="rotate(45)"
                          className="gn gn-var"
                        />
                        <text className="gid gid-var" textAnchor="middle" y={-12}>
                          {fn.label}
                        </text>
                      </g>
                    );
                  }
                  return (
                    <g
                      key={fn.id}
                      className={`gnode gnode-mat${on ? " sel" : ""}${dim ? " dim" : ""}`}
                      transform={`translate(${fn.x} ${fn.y})`}
                      tabIndex={0}
                      role="button"
                      aria-pressed={on}
                      aria-label={`Shared material ${fn.label}`}
                      onPointerDown={(e) => handlePointerDown(fn, e)}
                    >
                      <circle r={fn.r} className="gn gn-mat" />
                      <text className="gid gid-mat" x={9} y={3}>
                        {fn.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
          <p className="kg-status" aria-live="polite">
            {caption ??
              (node
                ? `${node.id}: ${edgesOf(node.id).length} computed links.`
                : mode === "force"
                  ? "Click or drag any study, variable (◆) or material (○) node to explore its connections."
                  : "Select a node to see its links; hover a line to read why it is drawn.")}
          </p>
        </div>

        <aside className="kg-side" aria-label={`Selected ${unit}`}>
          {node ? (
            detail(node)
          ) : auxDetail() ? (
            auxDetail()
          ) : (
            <p className="kg-empty">
              No {unit} selected. Size, shape and letter give the grade (A largest, D smallest and dashed). In force-directed mode, drag any node to rearrange the network.
            </p>
          )}
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
        {mode === "force" && showVars && (
          <span>
            <svg viewBox="-12 -12 24 24" width="18" height="18" aria-hidden="true">
              <rect x="-6" y="-6" width="12" height="12" transform="rotate(45)" className="gn gn-var" />
            </svg>
            variable hub
          </span>
        )}
        {mode === "force" && showMats && (
          <span>
            <svg viewBox="-10 -10 20 20" width="18" height="18" aria-hidden="true">
              <circle r="5" className="gn gn-mat" />
            </svg>
            shared material (≥2 studies)
          </span>
        )}
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
        Size, shape, letter and outline give the grade against the active scenario; {unit}s without a comparable record (grade D) stay visible, dimmed and dashed. Links are{" "}
        <b>computed by the engine from the pack</b>, not statements extracted from the authors&apos; texts: a thick line joins {unit}s listed as related in the pack; a thin line joins {unit}s that both record at least two variables that not every {unit} records, or that share a publication DOI. Switch between interactive force-directed physics (with draggable study, variable and material nodes) and the fixed ranked circle.
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

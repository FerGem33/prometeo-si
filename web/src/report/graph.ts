import { rank } from "../engine";
import type { DataRecord, Grade, Pack, Range, Scenario, Study, StudyResult } from "../engine";
import { t, count } from "../i18n";

/**
 * Evidence network: relations computed from data already in the pack. These are NOT claims
 * extracted from the authors' texts. Pure and deterministic: same pack + scenario => same layout.
 */

export type EdgeKind = "related" | "publication" | "variables";

export type GraphEdge = {
  a: string;
  b: string;
  kinds: EdgeKind[];
  /** variable ids both studies record (informative ones only, see `informative`) */
  variables: string[];
  /** DOIs both studies list */
  dois: string[];
};

export type GraphNode = {
  id: string;
  index: number;
  x: number;
  y: number;
  r: number;
  result: StudyResult;
  study: Study;
};

export type VariableMatch = { variable: string; record: string };

export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
};

const RADIUS: Record<Grade, number> = { A: 22, B: 19, C: 16, D: 10 };

/** Force simulation state. Indexes follow the order of the studies in the pack, so the layout does not depend on the scenario. */
export type Sim = {
  x: number[];
  y: number[];
  vx: number[];
  vy: number[];
  links: { a: number; b: number; rest: number; k: number }[];
  width: number;
  height: number;
};

const SPACING = 84; // minimum distance between two nodes, leaves room for the label
const MARGIN = 34;

/** Starting positions on a fixed spiral (golden angle): no randomness, so the result is reproducible. */
export function createSim(n: number, links: Sim["links"], width: number, height: number): Sim {
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const ang = i * 2.399963;
    const rad = 26 * Math.sqrt(i + 0.5);
    x.push(width / 2 + rad * Math.cos(ang) * 1.5);
    y.push(height / 2 + rad * Math.sin(ang));
  }
  return { x, y, vx: new Array(n).fill(0), vy: new Array(n).fill(0), links, width, height };
}

/** One step: nodes repel, links pull to their rest length, a weak pull keeps the cloud centred. `pinned` is held in place (dragging). */
export function tick(sim: Sim, alpha: number, pinned = -1): void {
  const { x, y, vx, vy, links, width, height } = sim;
  const n = x.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let dx = x[j] - x[i];
      let dy = y[j] - y[i];
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) {
        dx = 0.1 * (((i * 7 + j * 13) % 5) - 2 || 1);
        dy = 0.1 * (((i * 11 + j * 3) % 5) - 2 || 1);
        d2 = dx * dx + dy * dy;
      }
      const d = Math.sqrt(d2);
      let f = (11000 / d2) * alpha;
      if (d < SPACING) f += ((SPACING - d) / d) * 0.5;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      vx[i] -= fx;
      vy[i] -= fy;
      vx[j] += fx;
      vy[j] += fy;
    }
    vx[i] += (width / 2 - x[i]) * 0.006 * alpha;
    vy[i] += (height / 2 - y[i]) * 0.014 * alpha;
  }
  for (const l of links) {
    const dx = x[l.b] - x[l.a];
    const dy = y[l.b] - y[l.a];
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = ((d - l.rest) / d) * l.k * alpha;
    vx[l.a] += dx * f;
    vy[l.a] += dy * f;
    vx[l.b] -= dx * f;
    vy[l.b] -= dy * f;
  }
  for (let i = 0; i < n; i++) {
    if (i === pinned) {
      vx[i] = 0;
      vy[i] = 0;
      continue;
    }
    vx[i] *= 0.78;
    vy[i] *= 0.78;
    x[i] = Math.min(width - MARGIN, Math.max(MARGIN, x[i] + vx[i]));
    y[i] = Math.min(height - MARGIN - 12, Math.max(MARGIN, y[i] + vy[i]));
  }
}

/** Links of the pack as simulation springs: related studies sit closer than studies that only share variables. */
export function simLinks(pack: Pack, edges: GraphEdge[]): Sim["links"] {
  const at = new Map(pack.studies.map((s, i) => [s.id, i]));
  return edges.map((e) => {
    const strong = e.kinds.includes("related") || e.kinds.includes("publication");
    return { a: at.get(e.a)!, b: at.get(e.b)!, rest: strong ? 104 : 168, k: strong ? 0.09 : 0.016 };
  });
}

/** The settled layout: a fixed number of steps from the fixed start. Same pack, same picture. */
export function settledSim(pack: Pack, edges: GraphEdge[], width: number, height: number): Sim {
  const sim = createSim(pack.studies.length, simLinks(pack, edges), width, height);
  let alpha = 1;
  for (let i = 0; i < 420; i++) {
    tick(sim, alpha);
    alpha = Math.max(0.03, alpha * 0.99);
  }
  return sim;
}

/** Variables recorded by a study, from its records. */
export function recordedVariables(pack: Pack): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const s of pack.studies) m.set(s.id, new Set());
  for (const r of pack.records) {
    const set = m.get(r.study);
    if (set) for (const k of Object.keys(r.values)) set.add(k);
  }
  return m;
}

/** Numeric variables that do not distinguish studies (recorded by every study with records) are not used as links. */
export function informativeVariables(pack: Pack): string[] {
  const rec = recordedVariables(pack);
  const withRecords = [...rec.values()].filter((s) => s.size > 0);
  return pack.schema.variables
    .filter((v) => v.type === "num")
    .map((v) => v.id)
    .filter((id) => withRecords.some((s) => !s.has(id)) && withRecords.some((s) => s.has(id)));
}

export const MIN_SHARED_VARIABLES = 2;

export function buildEdges(pack: Pack): GraphEdge[] {
  const rec = recordedVariables(pack);
  const info = informativeVariables(pack);
  const ids = pack.studies.map((s) => s.id);
  const known = new Set(ids);
  const byId = new Map(pack.studies.map((s) => [s.id, s]));
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const edges = new Map<string, GraphEdge>();
  const get = (a: string, b: string): GraphEdge => {
    const k = key(a, b);
    let e = edges.get(k);
    if (!e) {
      const [x, y] = a < b ? [a, b] : [b, a];
      e = { a: x, b: y, kinds: [], variables: [], dois: [] };
      edges.set(k, e);
    }
    return e;
  };
  for (const s of pack.studies)
    for (const o of s.related) if (known.has(o) && o !== s.id) {
      const e = get(s.id, o);
      if (!e.kinds.includes("related")) e.kinds.push("related");
    }
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = byId.get(ids[i])!;
      const b = byId.get(ids[j])!;
      const da = new Set((a.publications ?? []).map((p) => p.doi).filter(Boolean));
      const dois = [...new Set((b.publications ?? []).map((p) => p.doi).filter((d) => d && da.has(d)))].sort();
      if (dois.length) {
        const e = get(a.id, b.id);
        e.kinds.push("publication");
        e.dois = dois;
      }
      const ra = rec.get(a.id)!;
      const rb = rec.get(b.id)!;
      const shared = info.filter((v) => ra.has(v) && rb.has(v));
      if (shared.length >= MIN_SHARED_VARIABLES) {
        const e = get(a.id, b.id);
        e.kinds.push("variables");
        e.variables = shared;
      }
    }
  // fill shared variables on every edge, for explanation, even if below the link threshold
  for (const e of edges.values())
    if (!e.variables.length) e.variables = info.filter((v) => rec.get(e.a)!.has(v) && rec.get(e.b)!.has(v));
  return [...edges.values()].sort((p, q) => (p.a + p.b < q.a + q.b ? -1 : 1));
}

/** Nodes in ranking order, placed by the force layout. Position carries no meaning beyond the links. */
export function buildGraph(pack: Pack, scenario: Scenario, width = 920, height = 560): Graph {
  const ranking = rank(pack, scenario);
  const byId = new Map(pack.studies.map((s) => [s.id, s]));
  const slot = new Map(pack.studies.map((s, i) => [s.id, i]));
  const edges = buildEdges(pack);
  const sim = settledSim(pack, edges, width, height);
  const nodes: GraphNode[] = ranking.map((result, index) => {
    const k = slot.get(result.study)!;
    return {
      id: result.study,
      index,
      x: Math.round(sim.x[k] * 100) / 100,
      y: Math.round(sim.y[k] * 100) / 100,
      r: RADIUS[result.grade],
      result,
      study: byId.get(result.study)!,
    };
  });
  return { nodes, edges, width, height };
}

const covers = (v: Range | string, x: number | string): boolean =>
  Array.isArray(v) ? typeof x === "number" && x >= v[0] && x <= v[1] : v === x;

/** Active scenario variables for which a record of the study holds the scenario value (with the record that proves it). */
export function matchingVariables(pack: Pack, scenario: Scenario, studyId: string): VariableMatch[] {
  const recs: DataRecord[] = pack.records.filter((r) => r.study === studyId);
  const out: VariableMatch[] = [];
  for (const id of scenario.active) {
    const x = scenario.values[id];
    if (x === undefined || x === "") continue;
    const hit = recs.find((r) => r.values[id] !== undefined && covers(r.values[id], x));
    if (hit) out.push({ variable: id, record: hit.id });
  }
  return out;
}

export function edgeText(pack: Pack, e: GraphEdge): string {
  const label = (id: string) => pack.schema.variables.find((v) => v.id === id)?.label ?? id;
  const parts: string[] = [];
  if (e.kinds.includes("variables")) parts.push(t("shares variables {0}", e.variables.map(label).join(", ")));
  if (e.kinds.includes("publication")) parts.push(t("shares {0} (same DOI)", count(e.dois.length, "publication")));
  if (e.kinds.includes("related")) parts.push(t("linked: related study"));
  return parts.join("; ");
}

import { rank } from "../engine";
import type { DataRecord, Grade, Pack, Range, Scenario, Study, StudyResult } from "../engine";

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
  size: number;
};

const RADIUS: Record<Grade, number> = { A: 17, B: 14, C: 11, D: 8 };

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

/** Circular layout in ranking order (best first, clockwise from the top). */
export function buildGraph(pack: Pack, scenario: Scenario, size = 640): Graph {
  const ranking = rank(pack, scenario);
  const byId = new Map(pack.studies.map((s) => [s.id, s]));
  const c = size / 2;
  const R = c - 56;
  const n = ranking.length;
  const nodes: GraphNode[] = ranking.map((result, index) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, n);
    return {
      id: result.study,
      index,
      x: Math.round((c + R * Math.cos(ang)) * 100) / 100,
      y: Math.round((c + R * Math.sin(ang)) * 100) / 100,
      r: RADIUS[result.grade],
      result,
      study: byId.get(result.study)!,
    };
  });
  return { nodes, edges: buildEdges(pack), size };
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
  if (e.kinds.includes("variables")) parts.push(`shares variables ${e.variables.map(label).join(", ")}`);
  if (e.kinds.includes("publication")) parts.push(`shares ${e.dois.length} publication${e.dois.length === 1 ? "" : "s"} (same DOI)`);
  if (e.kinds.includes("related")) parts.push("linked: related study");
  return parts.join("; ");
}

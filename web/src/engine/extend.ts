// Phase 2 engine functions: knowledge graph, parts of a proposal, explanation of a rank,
// and comparison of two assessments. Pure, deterministic, and free of corpus vocabulary:
// every name comes from pack and lens. Contract: docs/CONTRATOS_FASE2.md section 2.
import { activeCats, activeNums, comparable, coverage, evidence, intervalGap, numRange, partitionOf, rank, round, sigmaOf } from "./core";
import { evidenceLevels, findings } from "./interpret";
import type {
  Coverage,
  EvidenceLevel,
  Finding,
  Grade,
  Lens,
  OverallEvidence,
  Pack,
  Partition,
  Range,
  Scenario,
  StudyResult,
  VariableEvidence,
} from "./types";

// ---------------------------------------------------------------- graph (guide 6.5)

export type GraphNodeKind = "study" | "variable" | "category" | "attribute";
export type GraphEdgeKind = "related" | "attribute" | "variable" | "category";

export type GraphNode = {
  /** "study:<id>", "variable:<id>", "category:<variable>:<value>", "attribute:<key>:<normalised name>" */
  id: string;
  kind: GraphNodeKind;
  /** study id, variable id, categorical value or canonical attribute name */
  ref: string;
  label: string;
  /** variable id (category nodes) or attribute key (attribute nodes) */
  group?: string;
  /** studies connected to the node (for study nodes: number of edges) */
  degree: number;
  /** records behind the node: of the study, carrying the variable, or with the categorical value */
  records: number;
};

export type GraphEdge = {
  source: string;
  target: string;
  kind: GraphEdgeKind;
  /** records of the study behind the edge (variable, category); 1 otherwise */
  weight: number;
  label?: string;
};

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type GraphOptions = {
  /** study attributes whose shared values link studies; default: lens.graph.attributes, else none */
  attributes?: string[];
  /** a categorical value becomes a node when it appears in at least this many studies (default 2) */
  minStudies?: number;
  /** names closer than this are the same attribute value (default 0.9) */
  similarity?: number;
};

const normalise = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

/** Normalised Levenshtein similarity in [0, 1]. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const n = a.length;
  const m = b.length;
  if (!n || !m) return 0;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[m] / Math.max(n, m);
}

/**
 * Knowledge graph of the pack. Nodes: studies, variables, categorical values present in two or
 * more studies, and shared attribute values. Edges are computed from the pack only; relations
 * stated by authors are not edges here (they will come from pack.claims).
 */
export function graph(pack: Pack, lens?: Lens, opts: GraphOptions = {}): Graph {
  const attributes = opts.attributes ?? lens?.graph?.attributes ?? [];
  const minStudies = opts.minStudies ?? 2;
  const threshold = opts.similarity ?? 0.9;
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const studyIds = new Set(pack.studies.map((s) => s.id));
  const add = (n: GraphNode) => {
    nodes.set(n.id, n);
    return n;
  };
  const link = (e: GraphEdge) => {
    edges.push(e);
    for (const id of [e.source, e.target]) {
      const n = nodes.get(id);
      if (n) n.degree++;
    }
  };

  const perStudy = new Map<string, Pack["records"]>();
  for (const s of pack.studies) perStudy.set(s.id, []);
  for (const r of pack.records) perStudy.get(r.study)?.push(r);
  for (const s of pack.studies) add({ id: `study:${s.id}`, kind: "study", ref: s.id, label: s.short, degree: 0, records: perStudy.get(s.id)!.length });

  // related: declared by the study record, undirected, both ends must exist
  const seenPairs = new Set<string>();
  for (const s of pack.studies)
    for (const other of s.related) {
      if (!studyIds.has(other) || other === s.id) continue;
      const key = [s.id, other].sort().join("|");
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      link({ source: `study:${s.id}`, target: `study:${other}`, kind: "related", weight: 1 });
    }

  // variable and category edges
  for (const v of pack.schema.variables) {
    if (v.type === "num") {
      const node = add({ id: `variable:${v.id}`, kind: "variable", ref: v.id, label: v.label, degree: 0, records: 0 });
      for (const s of pack.studies) {
        const n = perStudy.get(s.id)!.filter((r) => Array.isArray(r.values[v.id])).length;
        if (n === 0) continue;
        node.records += n;
        link({ source: `study:${s.id}`, target: node.id, kind: "variable", weight: n });
      }
      if (node.degree === 0) nodes.delete(node.id);
    } else {
      const byValue = new Map<string, Map<string, number>>();
      for (const r of pack.records) {
        const x = r.values[v.id];
        if (typeof x !== "string") continue;
        const m = byValue.get(x) ?? byValue.set(x, new Map()).get(x)!;
        m.set(r.study, (m.get(r.study) ?? 0) + 1);
      }
      for (const [value, studies] of [...byValue].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (studies.size < minStudies) continue;
        const node = add({ id: `category:${v.id}:${value}`, kind: "category", ref: value, label: value, group: v.id, degree: 0, records: 0 });
        for (const s of pack.studies) {
          const n = studies.get(s.id);
          if (!n) continue;
          node.records += n;
          link({ source: `study:${s.id}`, target: node.id, kind: "category", weight: n });
        }
      }
    }
  }

  // shared attribute values (names are split on commas and semicolons and matched approximately)
  for (const key of attributes) {
    const clusters: { norm: string; label: string; studies: Set<string> }[] = [];
    for (const s of pack.studies) {
      const raw = s.attributes[key];
      const names = (Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []).flatMap((x) => x.split(/[,;]/)).map((x) => x.trim()).filter(Boolean);
      for (const name of names) {
        const norm = normalise(name);
        if (!norm) continue;
        const c = clusters.find((k) => similarity(k.norm, norm) >= threshold);
        if (c) c.studies.add(s.id);
        else clusters.push({ norm, label: name, studies: new Set([s.id]) });
      }
    }
    for (const c of clusters) {
      if (c.studies.size < 2) continue;
      const node = add({ id: `attribute:${key}:${c.norm}`, kind: "attribute", ref: c.label, label: c.label, group: key, degree: 0, records: 0 });
      for (const s of pack.studies) if (c.studies.has(s.id)) link({ source: `study:${s.id}`, target: node.id, kind: "attribute", weight: 1, label: c.label });
    }
  }
  return { nodes: [...nodes.values()], edges };
}

export type StudyEmphasis = { study: string; position: number; grade: Grade; distance: number | null; /** 1 for the best ranked study, down to 0 for grade D */ weight: number };

/** Size and highlight of each study node for the active scenario: derived from rank(), nothing else. */
export function emphasis(results: StudyResult[]): Record<string, StudyEmphasis> {
  const graded = results.filter((r) => r.grade !== "D").length;
  const out: Record<string, StudyEmphasis> = {};
  results.forEach((r, i) => {
    out[r.study] = { study: r.study, position: i + 1, grade: r.grade, distance: r.distance, weight: r.grade === "D" ? 0 : round(1 - i / Math.max(1, graded) / 2, 3) };
  });
  return out;
}

// ---------------------------------------------------------------- parts of a proposal

const LEVEL_STRENGTH: Record<EvidenceLevel, number> = { not_studied: 0, near: 1, scarce: 2, studied: 3 };

export type PartEvidence = {
  /** lens.parts[].id, or null for active variables that belong to no part */
  part: string | null;
  label: string | null;
  /** the weakest level among the variables of the part */
  level: EvidenceLevel;
  /** variable that sets the level (first one with the weakest level) */
  decidedBy: string;
  variables: VariableEvidence[];
};

/** Evidence level per named part of the proposal: the weakest variable of the part decides. */
export function partLevels(lens: Lens, levels: VariableEvidence[]): PartEvidence[] {
  const out: PartEvidence[] = [];
  const used = new Set<string>();
  const build = (part: string | null, label: string | null, vars: VariableEvidence[]) => {
    if (!vars.length) return;
    const weakest = vars.reduce((a, b) => (LEVEL_STRENGTH[b.level] < LEVEL_STRENGTH[a.level] ? b : a));
    out.push({ part, label, level: weakest.level, decidedBy: weakest.variable, variables: vars });
  };
  for (const p of lens.parts ?? []) {
    const vars = levels.filter((l) => p.variables.includes(l.variable) && !used.has(l.variable));
    vars.forEach((l) => used.add(l.variable));
    build(p.id, p.label, vars);
  }
  build(null, null, levels.filter((l) => !used.has(l.variable)));
  return out;
}

// ---------------------------------------------------------------- why a study ranks where it does

export type RankTerm = {
  variable: string;
  type: "num" | "cat";
  value: number | string;
  /** value of the nearest record on this variable; null when the record does not carry it */
  recordValue: Range | string | null;
  status: "inside" | "outside" | "not_recorded" | "same" | "differs";
  /** distance to the record interval, in the unit of the variable (numeric) */
  gap?: number;
  /** numeric: gap / sigma (enters the distance squared); categorical: the penalty added */
  contribution: number;
  /** envelope of the comparable records of the study on this variable */
  tested?: Range;
};

export type RankExplanation = {
  study: string;
  grade: Grade;
  distance: number | null;
  /** nearest comparable record; null when the study has none */
  nearest: string | null;
  terms: RankTerm[];
};

/** Decomposes the distance of a study into one term per active variable, with the real values. */
export function explainRank(pack: Pack, scenario: Scenario, studyId: string): RankExplanation | null {
  const result = rank(pack, scenario).find((r) => r.study === studyId);
  if (!result) return null;
  const rec = result.nearest ? pack.records.find((r) => r.id === result.nearest) : undefined;
  const recs = comparable(
    pack.records.filter((r) => r.study === studyId),
    partitionOf(pack, scenario),
  );
  const terms: RankTerm[] = [];
  for (const v of activeNums(pack, scenario)) {
    const t = scenario.values[v.id] as number;
    const rg = rec ? numRange(rec, v.id) : null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of recs) {
      const x = numRange(r, v.id);
      if (x) {
        lo = Math.min(lo, x[0]);
        hi = Math.max(hi, x[1]);
      }
    }
    const tested: Range | undefined = lo === Infinity ? undefined : [lo, hi];
    if (!rg) terms.push({ variable: v.id, type: "num", value: t, recordValue: null, status: "not_recorded", contribution: 0, tested });
    else {
      const gap = intervalGap(t, rg);
      terms.push({ variable: v.id, type: "num", value: t, recordValue: rg, status: gap === 0 ? "inside" : "outside", gap: round(gap, 4), contribution: round(gap / sigmaOf(v, scenario), 2), tested });
    }
  }
  for (const c of activeCats(pack, scenario)) {
    const want = scenario.values[c.id] as string;
    const x = rec?.values[c.id];
    if (typeof x !== "string") terms.push({ variable: c.id, type: "cat", value: want, recordValue: null, status: "not_recorded", contribution: 0 });
    else terms.push({ variable: c.id, type: "cat", value: want, recordValue: x, status: x === want ? "same" : "differs", contribution: x === want ? 0 : (c.penalty ?? 0) });
  }
  return { study: studyId, grade: result.grade, distance: result.distance, nearest: result.nearest, terms };
}

// ---------------------------------------------------------------- assessment and comparison

export type Assessment = {
  scenario: Scenario;
  partition: Partition;
  overall: OverallEvidence;
  coverage: Coverage;
  levels: VariableEvidence[];
  parts: PartEvidence[];
  ranking: StudyResult[];
  findings: Finding[];
};

/** Everything the report shows for one scenario, in one call. */
export function assess(pack: Pack, lens: Lens, scenario: Scenario): Assessment {
  const levels = evidenceLevels(pack, lens, scenario);
  return {
    scenario,
    partition: partitionOf(pack, scenario),
    overall: evidence(pack, scenario),
    coverage: coverage(pack, scenario),
    levels,
    parts: partLevels(lens, levels),
    ranking: rank(pack, scenario),
    findings: findings(pack, lens, scenario),
  };
}

export type Direction = "up" | "down" | "same" | "added" | "removed";

export type AssessmentDiff = {
  /** true when nothing a reader would see has changed */
  unchanged: boolean;
  values: { variable: string; from: number | string | null; to: number | string | null }[];
  levels: { variable: string; from: EvidenceLevel | null; to: EvidenceLevel | null; direction: Direction }[];
  parts: { part: string | null; from: EvidenceLevel | null; to: EvidenceLevel | null; direction: Direction }[];
  grades: { study: string; from: Grade; to: Grade; distanceFrom: number | null; distanceTo: number | null; direction: Direction }[];
  findings: { added: Finding[]; removed: Finding[]; changed: { from: Finding; to: Finding }[] };
};

const GRADE_STRENGTH: Record<Grade, number> = { D: 0, C: 1, B: 2, A: 3 };
const dir = (from: number, to: number): Direction => (to > from ? "up" : to < from ? "down" : "same");

/**
 * What changed between two assessments (before/after an adjustment, or two saved variants).
 * "up" always means more evidence: a stronger level, a better grade or a smaller distance.
 */
export function diffAssessment(before: Assessment, after: Assessment): AssessmentDiff {
  const ids = (a: Assessment) => a.scenario.active.filter((id) => a.scenario.values[id] !== undefined);
  const allVars = [...new Set([...ids(before), ...ids(after)])];
  const values = allVars
    .map((variable) => ({
      variable,
      from: ids(before).includes(variable) ? before.scenario.values[variable] : null,
      to: ids(after).includes(variable) ? after.scenario.values[variable] : null,
    }))
    .filter((x) => x.from !== x.to);

  const levels = allVars
    .map((variable) => {
      const a = before.levels.find((l) => l.variable === variable)?.level ?? null;
      const b = after.levels.find((l) => l.variable === variable)?.level ?? null;
      const direction: Direction = a === null ? "added" : b === null ? "removed" : dir(LEVEL_STRENGTH[a], LEVEL_STRENGTH[b]);
      return { variable, from: a, to: b, direction };
    })
    .filter((x) => x.direction !== "same");

  const partIds = [...new Set([...before.parts, ...after.parts].map((p) => p.part))];
  const parts = partIds
    .map((part) => {
      const a = before.parts.find((p) => p.part === part)?.level ?? null;
      const b = after.parts.find((p) => p.part === part)?.level ?? null;
      const direction: Direction = a === null ? "added" : b === null ? "removed" : dir(LEVEL_STRENGTH[a], LEVEL_STRENGTH[b]);
      return { part, from: a, to: b, direction };
    })
    .filter((x) => x.direction !== "same");

  const grades = after.ranking
    .map((b) => {
      const a = before.ranking.find((r) => r.study === b.study);
      if (!a) return null;
      const byGrade = dir(GRADE_STRENGTH[a.grade], GRADE_STRENGTH[b.grade]);
      const byDistance = a.distance === null || b.distance === null ? "same" : dir(-a.distance, -b.distance);
      const direction: Direction = byGrade !== "same" ? byGrade : byDistance;
      return { study: b.study, from: a.grade, to: b.grade, distanceFrom: a.distance, distanceTo: b.distance, direction };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.direction !== "same");

  const same = (x: Finding, y: Finding) => x.level === y.level && x.metric.value === y.metric.value && JSON.stringify(x.sources) === JSON.stringify(y.sources);
  const fb = new Map(before.findings.map((f) => [f.id, f]));
  const fa = new Map(after.findings.map((f) => [f.id, f]));
  const fnd = {
    added: after.findings.filter((f) => !fb.has(f.id)),
    removed: before.findings.filter((f) => !fa.has(f.id)),
    changed: after.findings.filter((f) => fb.has(f.id) && !same(fb.get(f.id)!, f)).map((f) => ({ from: fb.get(f.id)!, to: f })),
  };
  const unchanged = !values.length && !levels.length && !parts.length && !grades.length && !fnd.added.length && !fnd.removed.length && !fnd.changed.length;
  return { unchanged, values, levels, parts, grades, findings: fnd };
}

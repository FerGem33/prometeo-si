import {
  activeCats,
  activeNums,
  comparable,
  coverage,
  envelope,
  intervalGap,
  numRange,
  partitionOf,
  pool,
  rank,
  round,
  sigmaOf,
} from "./core";
import type {
  DataRecord,
  Finding,
  FindingLevel,
  GapCell,
  GapGrid,
  Lens,
  Pack,
  Scenario,
  VariableEvidence,
} from "./types";

const LEVEL_ORDER: Record<FindingLevel, number> = { attention: 0, caution: 1, context: 2, support: 3 };

const fmt = (x: number): string => String(round(x, 2));

/** True when a flag of the record concerns the given variable. */
export function flaggedFor(pack: Pack, r: DataRecord, variableId: string): boolean {
  return r.flags.some((f) => {
    const vars = pack.schema.flags?.[f]?.variables;
    return !vars || vars.includes(variableId);
  });
}

function covers(r: DataRecord, id: string, t: number, tol: number): boolean {
  const rg = numRange(r, id);
  return !!rg && t >= rg[0] - tol && t <= rg[1] + tol;
}

/**
 * Evidence level per active variable (plan section 2), computed on the comparable pool:
 * studied / scarce / near (outside the tested range, within reach) / not_studied.
 */
export function evidenceLevels(pack: Pack, lens: Lens, scenario: Scenario): VariableEvidence[] {
  const th = pack.schema.thresholds;
  const tests = pool(pack, scenario);
  const minStudies = lens.evidence.min_studies;
  const out: VariableEvidence[] = [];

  for (const v of activeNums(pack, scenario)) {
    const t = scenario.values[v.id] as number;
    const sigma = sigmaOf(v, scenario);
    const tol = th.tolerance * sigma;
    const have = tests.filter((r) => numRange(r, v.id));
    const env = envelope(have, v.id);
    const base = { variable: v.id, value: t, recorded: have.length, pool: tests.length };
    if (!env) {
      out.push({ ...base, level: "not_studied", reason: "never_recorded", covering: 0, studies: [] });
      continue;
    }
    if (t >= env[0] - tol && t <= env[1] + tol) {
      const cov = have.filter((r) => covers(r, v.id, t, tol));
      const clean = cov.filter((r) => !flaggedFor(pack, r, v.id));
      const studies = [...new Set(cov.map((r) => r.study))];
      const cleanStudies = new Set(clean.map((r) => r.study));
      const reason =
        cov.length === 0
          ? "no_record_at_value"
          : clean.length === 0
            ? "flagged_only"
            : cleanStudies.size < minStudies
              ? "few_studies"
              : "covered";
      out.push({
        ...base,
        level: reason === "covered" ? "studied" : "scarce",
        reason,
        tested: env,
        gap: 0,
        covering: cov.length,
        studies,
        source: (clean[0] ?? cov[0])?.id,
      });
      continue;
    }
    const gap = intervalGap(t, env);
    const above = t > env[1];
    const edge = have.find((r) => {
      const rg = numRange(r, v.id)!;
      return above ? rg[1] === env[1] : rg[0] === env[0];
    });
    const near = gap < th.closeness_reach * sigma;
    out.push({
      ...base,
      level: near ? "near" : "not_studied",
      reason: near ? "outside_near" : "outside_far",
      tested: env,
      gap: round(gap, 4),
      covering: 0,
      studies: edge ? [edge.study] : [],
      source: edge?.id,
    });
  }

  for (const c of activeCats(pack, scenario)) {
    const want = scenario.values[c.id] as string;
    const have = tests.filter((r) => typeof r.values[c.id] === "string");
    const cov = have.filter((r) => r.values[c.id] === want);
    const studies = [...new Set(cov.map((r) => r.study))];
    out.push({
      variable: c.id,
      value: want,
      level: cov.length === 0 ? "not_studied" : studies.length < minStudies ? "scarce" : "studied",
      reason: cov.length === 0 ? "category_absent" : studies.length < minStudies ? "few_studies" : "covered",
      recorded: have.length,
      covering: cov.length,
      studies,
      source: cov[0]?.id,
      pool: tests.length,
    });
  }
  return out;
}

/** Deterministic findings (guide 6.7). The interface and the language model only word them. */
export function findings(pack: Pack, lens: Lens, scenario: Scenario): Finding[] {
  const th = pack.schema.thresholds;
  const part = partitionOf(pack, scenario);
  const tests = pool(pack, scenario);
  const others = part ? pack.records.filter((r) => r.kind === "test" && r.values[part.variable] !== part.value) : [];
  const short = new Map(pack.studies.map((s) => [s.id, s.short]));
  const out: Finding[] = [];
  const push = (f: Omit<Finding, "id">) => out.push({ ...f, id: f.variable ? `${f.code}:${f.variable}` : f.code });

  for (const v of activeNums(pack, scenario)) {
    const t = scenario.values[v.id] as number;
    const tol = th.tolerance * sigmaOf(v, scenario);
    const have = tests.filter((r) => numRange(r, v.id));
    const env = envelope(have, v.id);
    const anywhere = pack.records.some((r) => numRange(r, v.id));
    let outside = false;

    if (!anywhere) {
      outside = true;
      push({
        level: "attention",
        code: "no_evidence_variable",
        variable: v.id,
        params: { value: t, unit: v.unit },
        sources: [],
        metric: { value: "0", unit: "records" },
      });
    } else if (!env) {
      outside = true;
      push({
        level: "attention",
        code: "never_measured",
        variable: v.id,
        params: { value: t, unit: v.unit, n: tests.length, partition: part?.value ?? "" },
        sources: [...new Set(tests.map((r) => r.study))],
        metric: { value: `0 / ${tests.length}` },
      });
    } else if (t > env[1] + tol || t < env[0] - tol) {
      outside = true;
      const above = t > env[1];
      const edgeValue = above ? env[1] : env[0];
      const edge = have.find((r) => {
        const rg = numRange(r, v.id)!;
        return above ? rg[1] === edgeValue : rg[0] === edgeValue;
      })!;
      const delta = round(Math.abs(t - edgeValue), 2);
      const risky = v.risk?.direction === (above ? "up" : "down");
      push({
        level: risky ? "attention" : "caution",
        code: above ? "above_tested" : "below_tested",
        variable: v.id,
        params: {
          value: t,
          unit: v.unit,
          delta_unit: v.delta_unit ?? v.unit,
          delta,
          edge: edgeValue,
          min: env[0],
          max: env[1],
          n: have.length,
          partition: part?.value ?? "",
          study: short.get(edge.study) ?? edge.study,
          record: edge.label,
          row: edge.source.row ?? edge.source.page ?? 0,
        },
        sources: [edge.id],
        metric: { value: `${above ? "+" : "−"}${fmt(delta)}`, unit: v.delta_unit ?? v.unit },
        note: risky && v.risk ? { text: v.risk.note, source: v.risk.source } : undefined,
      });
    } else {
      const cov = have.filter((r) => covers(r, v.id, t, tol));
      const studies = [...new Set(cov.map((r) => r.study))];
      push({
        level: "support",
        code: "within_tested",
        variable: v.id,
        params: { value: t, unit: v.unit, min: env[0], max: env[1], n: cov.length, studies: studies.length, recorded: have.length },
        sources: cov.length ? studies : [...new Set(have.map((r) => r.study))],
        metric: { value: `${fmt(env[0])}–${fmt(env[1])}`, unit: v.unit },
      });
    }

    if (outside && anywhere) {
      const elsewhere = others.filter((r) => covers(r, v.id, t, tol));
      if (elsewhere.length > 0) {
        const parts = [...new Set(elsewhere.map((r) => r.values[part!.variable] as string))];
        push({
          level: "context",
          code: "tested_elsewhere",
          variable: v.id,
          params: { value: t, unit: v.unit, n: elsewhere.length, partitions: parts.join(", "), partition: part?.value ?? "" },
          sources: [...new Set(elsewhere.map((r) => r.study))],
          metric: { value: String(elsewhere.length), unit: "tests" },
        });
      }
    }
    const known = lens.known_gaps?.find((g) => g.variable === v.id);
    if (known && outside) {
      push({
        level: "caution",
        code: "known_gap",
        variable: v.id,
        params: { value: t, unit: v.unit },
        sources: [],
        metric: { value: fmt(t), unit: v.unit },
        note: { text: known.note, source: known.source },
      });
    }
  }

  for (const c of activeCats(pack, scenario)) {
    const want = scenario.values[c.id] as string;
    const cov = tests.filter((r) => r.values[c.id] === want);
    const studies = [...new Set(cov.map((r) => r.study))];
    if (cov.length > 0)
      push({
        level: "support",
        code: "category_tested",
        variable: c.id,
        params: { value: want, n: cov.length, studies: studies.length, names: studies.map((s) => short.get(s) ?? s).join(", ") },
        sources: studies,
        metric: { value: String(cov.length), unit: "tests" },
      });
    else
      push({
        level: "attention",
        code: "category_untested",
        variable: c.id,
        params: { value: want, n: tests.length, partition: part?.value ?? "" },
        sources: [],
        metric: { value: `0 / ${tests.length}` },
      });
  }

  const cov = coverage(pack, scenario);
  if (cov.full > 0)
    push({
      level: "support",
      code: "full_coverage",
      params: { n: cov.full, studies: cov.studiesFull.length },
      sources: cov.studiesFull,
      metric: { value: String(cov.full), unit: "tests" },
    });

  const top = rank(pack, scenario)[0];
  if (top && top.grade !== "D") {
    const recs = comparable(
      pack.records.filter((r) => r.study === top.study),
      part,
    );
    const flagged = recs.filter((r) => r.flags.length > 0);
    if (flagged.length > 0)
      push({
        level: "context",
        code: "quality_flags",
        params: {
          study: short.get(top.study) ?? top.study,
          n: flagged.length,
          of: recs.length,
          flags: [...new Set(flagged.flatMap((r) => r.flags))].join(", "),
        },
        sources: [top.study],
        metric: { value: `${flagged.length} / ${recs.length}` },
      });
  }

  const prio = lens.finding_priority ?? [];
  const p = (code: string) => {
    const i = prio.indexOf(code);
    return i < 0 ? prio.length : i;
  };
  return out
    .map((f, i) => ({ f, i }))
    .sort((a, b) => LEVEL_ORDER[a.f.level] - LEVEL_ORDER[b.f.level] || p(a.f.code) - p(b.f.code) || a.i - b.i)
    .map((x) => x.f);
}

const mid = (r: DataRecord, id: string): number | null => {
  const rg = numRange(r, id);
  return rg ? (rg[0] + rg[1]) / 2 : null;
};

/** Cell edges at quantiles of the observed values, rounded to readable numbers. */
export function quantileEdges(values: number[], cells = 8): number[] {
  if (values.length === 0) return [];
  const s = [...values].sort((a, b) => a - b);
  const nice = (x: number) => (x === 0 ? 0 : Number(x.toPrecision(2)));
  const edges: number[] = [];
  for (let i = 0; i <= cells; i++) {
    const q = s[Math.min(s.length - 1, Math.round((i / cells) * (s.length - 1)))];
    edges.push(nice(q));
  }
  edges[0] = Math.min(edges[0], s[0]);
  edges[edges.length - 1] = Math.max(edges[edges.length - 1], s[s.length - 1]);
  const uniq = [...new Set(edges)].sort((a, b) => a - b);
  return uniq.length >= 2 ? uniq : [uniq[0], uniq[0] + 1];
}

const cellIndex = (edges: number[], x: number): number => {
  if (x < edges[0] || x > edges[edges.length - 1]) return -1;
  for (let i = 0; i < edges.length - 1; i++) if (x < edges[i + 1]) return i;
  return edges.length - 2;
};

/** Gap map of two numeric variables for one partition value (guide 6.4). */
export function gaps(
  pack: Pack,
  opts: { x: string; y: string; partition?: string | null; scenario?: Scenario },
): GapGrid {
  const pv = pack.schema.variables.find((v) => v.type === "cat" && v.role === "partition");
  const part = opts.partition ?? null;
  const tests = pack.records.filter((r) => r.kind === "test");
  const mine = part && pv ? tests.filter((r) => r.values[pv.id] === part) : tests;
  const rest = part && pv ? tests.filter((r) => r.values[pv.id] !== part) : [];

  const xs = tests.map((r) => mid(r, opts.x)).filter((v): v is number => v !== null);
  const ys = tests.map((r) => mid(r, opts.y)).filter((v): v is number => v !== null);
  const xEdges = quantileEdges(xs);
  const yEdges = quantileEdges(ys);
  const nx = Math.max(0, xEdges.length - 1);
  const ny = Math.max(0, yEdges.length - 1);
  const cells: GapCell[][] = Array.from({ length: ny }, () =>
    Array.from({ length: nx }, () => ({ n: 0, studies: [] as string[], other: 0 })),
  );

  let both = 0;
  let noX = 0;
  let noY = 0;
  for (const r of mine) {
    const x = mid(r, opts.x);
    const y = mid(r, opts.y);
    if (x === null) noX++;
    if (y === null) noY++;
    if (x === null || y === null) continue;
    both++;
    const xi = cellIndex(xEdges, x);
    const yi = cellIndex(yEdges, y);
    if (xi < 0 || yi < 0) continue;
    const c = cells[yi][xi];
    c.n++;
    if (!c.studies.includes(r.study)) c.studies.push(r.study);
  }
  for (const r of rest) {
    const x = mid(r, opts.x);
    const y = mid(r, opts.y);
    if (x === null || y === null) continue;
    const xi = cellIndex(xEdges, x);
    const yi = cellIndex(yEdges, y);
    if (xi >= 0 && yi >= 0) cells[yi][xi].other++;
  }

  let scenarioCell: GapGrid["scenarioCell"] = null;
  let nearestCell: GapGrid["nearestCell"] = null;
  const sx = opts.scenario?.values[opts.x];
  const sy = opts.scenario?.values[opts.y];
  if (typeof sx === "number" && typeof sy === "number" && nx > 0 && ny > 0) {
    const clamp = (edges: number[], v: number) =>
      v < edges[0] ? 0 : v > edges[edges.length - 1] ? edges.length - 2 : cellIndex(edges, v);
    scenarioCell = { xi: clamp(xEdges, sx), yi: clamp(yEdges, sy) };
    let bestD = Infinity;
    for (let yi = 0; yi < ny; yi++)
      for (let xi = 0; xi < nx; xi++) {
        if (cells[yi][xi].n === 0) continue;
        const d = Math.hypot(xi - scenarioCell.xi, yi - scenarioCell.yi);
        if (d < bestD) {
          bestD = d;
          nearestCell = { xi, yi, n: cells[yi][xi].n };
        }
      }
  }
  return {
    x: opts.x,
    y: opts.y,
    partition: part,
    xEdges,
    yEdges,
    cells,
    total: mine.length,
    both,
    no_x: noX,
    no_y: noY,
    scenarioCell,
    nearestCell,
  };
}

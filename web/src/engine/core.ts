import type {
  AxisScore,
  CatVariable,
  Coverage,
  DataRecord,
  Grade,
  NumVariable,
  OverallEvidence,
  Pack,
  Partition,
  Range,
  Scenario,
  StudyResult,
  Variable,
  Why,
} from "./types";

export const round = (x: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round((x + 1e-12) * f) / f;
};

export function variable(pack: Pack, id: string): Variable | undefined {
  return pack.schema.variables.find((v) => v.id === id);
}

export function sigmaOf(v: NumVariable, scenario: Scenario): number {
  const s = scenario.sigma?.[v.id];
  return typeof s === "number" && s > 0 ? s : v.sigma;
}

/** Active numeric variables that have a numeric value in the scenario. */
export function activeNums(pack: Pack, scenario: Scenario): NumVariable[] {
  return pack.schema.variables.filter(
    (v): v is NumVariable =>
      v.type === "num" && scenario.active.includes(v.id) && typeof scenario.values[v.id] === "number",
  );
}

/** Active categorical variables (not the partition) that have a value in the scenario. */
export function activeCats(pack: Pack, scenario: Scenario): CatVariable[] {
  return pack.schema.variables.filter(
    (v): v is CatVariable =>
      v.type === "cat" &&
      v.role !== "partition" &&
      scenario.active.includes(v.id) &&
      typeof scenario.values[v.id] === "string" &&
      scenario.values[v.id] !== "",
  );
}

export function partitionVariable(pack: Pack): CatVariable | undefined {
  return pack.schema.variables.find((v): v is CatVariable => v.type === "cat" && v.role === "partition");
}

/**
 * Partition of the scenario (guide 6.1): fixed directly, or implied by an active categorical
 * whose matching records all share one partition value. Otherwise null (no filtering).
 */
export function partitionOf(pack: Pack, scenario: Scenario): Partition {
  const pv = partitionVariable(pack);
  if (!pv) return null;
  const direct = scenario.values[pv.id];
  if (typeof direct === "string" && direct !== "") return { variable: pv.id, value: direct, via: pv.id };
  for (const c of activeCats(pack, scenario)) {
    const want = scenario.values[c.id];
    const seen = new Set<string>();
    for (const r of pack.records) {
      if (r.values[c.id] === want) {
        const p = r.values[pv.id];
        if (typeof p === "string") seen.add(p);
      }
    }
    if (seen.size === 1) return { variable: pv.id, value: [...seen][0], via: c.id };
  }
  return null;
}

export function comparable(records: DataRecord[], partition: Partition): DataRecord[] {
  if (!partition) return records;
  return records.filter((r) => r.values[partition.variable] === partition.value);
}

/** Comparable individual tests: the population every count in the report refers to. */
export function pool(pack: Pack, scenario: Scenario): DataRecord[] {
  return comparable(pack.records, partitionOf(pack, scenario)).filter((r) => r.kind === "test");
}

export function numRange(r: DataRecord, id: string): Range | null {
  const v = r.values[id];
  return Array.isArray(v) ? v : null;
}

/** Distance from t to the interval [lo, hi]; 0 inside. */
export function intervalGap(t: number, [lo, hi]: Range): number {
  return t < lo ? lo - t : t > hi ? t - hi : 0;
}

export function envelope(records: DataRecord[], id: string): Range | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of records) {
    const v = numRange(r, id);
    if (v) {
      if (v[0] < lo) lo = v[0];
      if (v[1] > hi) hi = v[1];
    }
  }
  return lo === Infinity ? null : [lo, hi];
}

function byStudy(pack: Pack): Map<string, DataRecord[]> {
  const m = new Map<string, DataRecord[]>();
  for (const s of pack.studies) m.set(s.id, []);
  for (const r of pack.records) m.get(r.study)?.push(r);
  return m;
}

/** Closeness per study and active variable, 0-100 (guide 6.2). */
export function closeness(pack: Pack, scenario: Scenario): Record<string, Record<string, AxisScore>> {
  const part = partitionOf(pack, scenario);
  const reach = pack.schema.thresholds.closeness_reach;
  const nums = activeNums(pack, scenario);
  const cats = activeCats(pack, scenario);
  const inPack = new Set<string>();
  for (const r of pack.records) for (const k of Object.keys(r.values)) inPack.add(k);

  const out: Record<string, Record<string, AxisScore>> = {};
  for (const [study, all] of byStudy(pack)) {
    const recs = comparable(all, part);
    const row: Record<string, AxisScore> = {};
    const blank = (id: string, reason: AxisScore["reason"]): AxisScore => ({
      variable: id,
      score: 0,
      missing: true,
      reason,
    });
    for (const v of nums) {
      if (!inPack.has(v.id)) row[v.id] = blank(v.id, "no_evidence");
      else if (all.length === 0) row[v.id] = blank(v.id, "no_records");
      else if (recs.length === 0) row[v.id] = blank(v.id, "not_comparable");
      else {
        const t = scenario.values[v.id] as number;
        let best = Infinity;
        let nearest: string | undefined;
        for (const r of recs) {
          const rg = numRange(r, v.id);
          if (!rg) continue;
          const e = intervalGap(t, rg);
          if (e < best) {
            best = e;
            nearest = r.id;
          }
        }
        if (best === Infinity) row[v.id] = blank(v.id, "not_recorded");
        else
          row[v.id] = {
            variable: v.id,
            score: Math.round(100 * Math.max(0, 1 - best / (reach * sigmaOf(v, scenario)))),
            missing: false,
            gap: round(best, 4),
            nearest,
            tested: envelope(recs, v.id) ?? undefined,
          };
      }
    }
    for (const c of cats) {
      if (!inPack.has(c.id)) row[c.id] = blank(c.id, "no_evidence");
      else if (all.length === 0) row[c.id] = blank(c.id, "no_records");
      else if (recs.length === 0) row[c.id] = blank(c.id, "not_comparable");
      else {
        const hit = recs.find((r) => r.values[c.id] === scenario.values[c.id]);
        const any = recs.some((r) => typeof r.values[c.id] === "string");
        row[c.id] = hit
          ? { variable: c.id, score: 100, missing: false, nearest: hit.id }
          : { variable: c.id, score: 0, missing: !any, reason: any ? undefined : "not_recorded" };
      }
    }
    out[study] = row;
  }
  return out;
}

const GRADE_ORDER: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3 };

/** Distance, grade and reasons per study (guide 6.3). Sorted by grade, missing count, distance. */
export function rank(pack: Pack, scenario: Scenario): StudyResult[] {
  const part = partitionOf(pack, scenario);
  const th = pack.schema.thresholds;
  const nums = activeNums(pack, scenario);
  const cats = activeCats(pack, scenario);
  const pv = partitionVariable(pack);
  const results: StudyResult[] = [];

  for (const [study, all] of byStudy(pack)) {
    const recs = comparable(all, part);
    const d = (why: Why, missing: string[]): StudyResult => ({
      study,
      grade: "D",
      distance: null,
      missing,
      nearest: null,
      why: [why],
      comparable: recs.length,
    });
    if (all.length === 0) {
      results.push(d({ code: "no_records" }, nums.map((v) => v.id)));
      continue;
    }
    if (recs.length === 0) {
      const has = pv ? [...new Set(all.map((r) => r.values[pv.id]).filter((x): x is string => typeof x === "string"))] : [];
      results.push(d({ code: "not_comparable", partition: part?.value ?? "", has }, nums.map((v) => v.id)));
      continue;
    }
    const env = new Map<string, Range>();
    for (const v of nums) {
      const e = envelope(recs, v.id);
      if (e) env.set(v.id, e);
    }
    const missing = nums.filter((v) => !env.has(v.id)).map((v) => v.id);
    if (env.size === 0) {
      results.push(d({ code: "no_common_variable" }, missing));
      continue;
    }

    let best = Infinity;
    let nearest: string | null = null;
    for (const r of recs) {
      let sum = 0;
      let used = 0;
      for (const v of nums) {
        const rg = numRange(r, v.id);
        if (!rg) continue;
        const e = intervalGap(scenario.values[v.id] as number, rg) / sigmaOf(v, scenario);
        sum += e * e;
        used++;
      }
      if (used === 0) continue;
      let dist = Math.sqrt(sum);
      for (const c of cats) {
        const rv = r.values[c.id];
        if (typeof rv === "string" && rv !== scenario.values[c.id]) dist += c.penalty ?? 0;
      }
      if (dist < best) {
        best = dist;
        nearest = r.id;
      }
    }

    const why: Why[] = [];
    for (const v of nums) {
      const e = env.get(v.id);
      if (!e) continue;
      const t = scenario.values[v.id] as number;
      const tol = th.tolerance * sigmaOf(v, scenario);
      if (t < e[0] - tol || t > e[1] + tol) why.push({ code: "out_of_range", variable: v.id, value: t, tested: e });
    }
    for (const c of cats) {
      const want = scenario.values[c.id] as string;
      if (!recs.some((r) => r.values[c.id] === want)) why.push({ code: "category_untested", variable: c.id, value: want });
    }
    const outside = why.length > 0;
    const grade: Grade = outside ? "C" : best <= th.grade_a && missing.length === 0 ? "A" : "B";
    if (!outside) why.push({ code: "within_tested" });
    if (missing.length) why.push({ code: "not_recorded", variables: missing });
    results.push({
      study,
      grade,
      distance: best === Infinity ? null : round(best, 2),
      missing,
      nearest,
      why,
      comparable: recs.length,
    });
  }

  const order = new Map(pack.studies.map((s, i) => [s.id, i]));
  results.sort(
    (a, b) =>
      GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] ||
      (a.grade === "D" ? 0 : a.missing.length - b.missing.length) ||
      (a.distance ?? Infinity) - (b.distance ?? Infinity) ||
      (order.get(a.study) ?? 0) - (order.get(b.study) ?? 0),
  );
  return results;
}

/** Tests of the pool that carry every active variable (full) or only some of them (partial). */
export function coverage(pack: Pack, scenario: Scenario): Coverage {
  const ids = [...activeNums(pack, scenario), ...activeCats(pack, scenario)].map((v) => v.id);
  const tests = pool(pack, scenario);
  let full = 0;
  let partial = 0;
  const studies = new Set<string>();
  for (const r of tests) {
    const n = ids.filter((id) => r.values[id] !== undefined).length;
    if (ids.length > 0 && n === ids.length) {
      full++;
      studies.add(r.study);
    } else if (n > 0) partial++;
  }
  return { full, partial, studiesFull: [...studies], pool: tests.length };
}

/** Best closeness reached by any study on each active variable. */
export function corpusSummary(pack: Pack, scenario: Scenario): { variable: string; best: number; study: string | null }[] {
  const cl = closeness(pack, scenario);
  const ids = [...activeNums(pack, scenario), ...activeCats(pack, scenario)].map((v) => v.id);
  return ids.map((id) => {
    let best = 0;
    let study: string | null = null;
    for (const s of pack.studies) {
      const sc = cl[s.id]?.[id]?.score ?? 0;
      if (sc > best) {
        best = sc;
        study = s.id;
      }
    }
    return { variable: id, best, study };
  });
}

export function evidence(pack: Pack, scenario: Scenario): OverallEvidence {
  const counts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const r of rank(pack, scenario)) counts[r.grade]++;
  const level = counts.A > 0 ? "strong" : counts.B > 0 ? "partial" : counts.C > 0 ? "scarce" : "none";
  return { level, counts };
}

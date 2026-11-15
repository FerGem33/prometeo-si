// Pure helpers for the ranking views: stable column sorting and per-study explanations.
// Nothing here recomputes engine results: every number comes from rank() and closeness().
import type { AxisScore, DataRecord, Pack, Range, Scenario, StudyResult } from "../engine";
import { rangeText } from "./format";

export type Dir = 1 | -1;
export type SortValue = number | string | null | undefined;

/**
 * Stable sort. `key` returns a number or string; null/undefined always go last whatever the direction.
 * Ties keep the input order (the default, engine order), so the result is reproducible.
 */
export function sortStable<T>(items: readonly T[], key: (x: T) => SortValue, dir: Dir): T[] {
  return items
    .map((x, i) => ({ x, i, k: key(x) }))
    .sort((a, b) => {
      const an = a.k === null || a.k === undefined;
      const bn = b.k === null || b.k === undefined;
      if (an || bn) return an === bn ? a.i - b.i : an ? 1 : -1;
      const c = typeof a.k === "string" || typeof b.k === "string" ? String(a.k).localeCompare(String(b.k), "en") : (a.k as number) - (b.k as number);
      return c * dir || a.i - b.i;
    })
    .map((e) => e.x);
}

/** Next sort state when a header is activated: a new column starts ascending, the same column toggles. */
export function nextSort<K extends string>(cur: { k: K; dir: Dir }, k: K): { k: K; dir: Dir } {
  return { k, dir: cur.k === k && cur.dir === 1 ? -1 : 1 };
}

export const ariaSort = (active: boolean, dir: Dir): "ascending" | "descending" | "none" => (active ? (dir === 1 ? "ascending" : "descending") : "none");

/**
 * Overall closeness of a study: mean of the closeness scores (0-100, as in Figure 2) over the active
 * variables the study records. Variables it does not record are not averaged in (missing is not zero);
 * they are reported separately. null when the study records none of them.
 */
export function overallCloseness(close: Record<string, AxisScore> | undefined, variables: string[]): number | null {
  const got = variables.map((id) => close?.[id]).filter((a): a is AxisScore => !!a && !a.reason && !a.missing);
  if (!got.length) return null;
  return Math.round((got.reduce((s, a) => s + a.score, 0) / got.length) * 10) / 10;
}

export type VarExplain = {
  variable: string;
  /** covered: a record covers the value; gap: nearest record is off by `gap`; tested / not_tested: category;
   *  missing: the study does not record the variable */
  status: "covered" | "gap" | "tested" | "not_tested" | "missing";
  score: number | null;
  scenarioValue: number | string | undefined;
  nearestRecord?: string;
  nearestValue?: Range | string;
  gap?: number;
  tested?: Range;
  reason?: AxisScore["reason"];
};

export type StudyExplain = {
  study: string;
  rank: number;
  result: StudyResult;
  vars: VarExplain[];
  /** active variables the study records / does not record */
  reported: string[];
  missing: string[];
  overall: number | null;
};

export function explainStudy(pack: Pack, scenario: Scenario, result: StudyResult, rankIndex: number, close: Record<string, Record<string, AxisScore>>): StudyExplain {
  const row = close[result.study] ?? {};
  const ids = scenario.active.filter((id) => scenario.values[id] !== undefined && row[id]);
  const vars: VarExplain[] = ids.map((id) => {
    const a = row[id];
    const v = pack.schema.variables.find((x) => x.id === id)!;
    const rec: DataRecord | undefined = a.nearest ? pack.records.find((r) => r.id === a.nearest) : undefined;
    const nearestValue = rec?.values[id];
    const base = { variable: id, scenarioValue: scenario.values[id], reason: a.reason };
    if (a.reason || a.missing) return { ...base, status: "missing" as const, score: null };
    if (v.type === "num")
      return { ...base, status: (a.gap ?? 0) === 0 ? ("covered" as const) : ("gap" as const), score: a.score, nearestRecord: rec?.id, nearestValue, gap: a.gap, tested: a.tested };
    return { ...base, status: a.score === 100 ? ("tested" as const) : ("not_tested" as const), score: a.score, nearestRecord: rec?.id, nearestValue };
  });
  return {
    study: result.study,
    rank: rankIndex + 1,
    result,
    vars,
    reported: vars.filter((x) => x.status !== "missing").map((x) => x.variable),
    missing: vars.filter((x) => x.status === "missing").map((x) => x.variable),
    overall: overallCloseness(row, ids),
  };
}

export function explainAll(pack: Pack, scenario: Scenario, ranking: StudyResult[], close: Record<string, Record<string, AxisScore>>): StudyExplain[] {
  return ranking.map((r, i) => explainStudy(pack, scenario, r, i, close));
}

export type RankKey = "rank" | "study" | "grade" | "distance" | "reported" | "overall";

export function sortKeyOf(e: StudyExplain, k: RankKey, studyName: (id: string) => string): SortValue {
  switch (k) {
    case "rank": return e.rank;
    case "study": return studyName(e.study);
    case "grade": return e.result.grade;
    case "distance": return e.result.distance;
    case "reported": return e.reported.length;
    case "overall": return e.overall;
  }
}

/** "22.2 %" / "22.2–30 %" for a numeric record value; plain text for a category. */
export const valueWithUnit = (x: Range | string | undefined, unit: string): string =>
  x === undefined ? "—" : Array.isArray(x) ? rangeText(x) + (unit ? ` ${unit}` : "") : x;

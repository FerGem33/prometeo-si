/** Deterministic statistics for dashboard modules. Pure: only reads the pack, documents and variables. */
import { numRange, quantileEdges } from "../engine";
import type { DataRecord, Pack, Scenario } from "../engine";
import type { ExtractedVariable, UploadedDoc } from "../ingest/types";
import { scoreVariables, tokens } from "./score";
import type {
  BoxRow,
  BoxSummary,
  CategoryCount,
  CategoryCounts,
  CompletenessRow,
  CoverageCell,
  CoverageMatrix,
  CrossAxis,
  CrossCell,
  CrossTab,
  DocSummary,
  GroupRange,
  GroupRanges,
  Histogram,
  KeyFigure,
  KeyFigures,
  PaperRelevance,
  RecordsTable,
  ScatterPoint,
} from "./types";

function numericValue(record: DataRecord, variable: string): number | null {
  const v = record.values[variable];
  if (!Array.isArray(v) || v.length < 2) return null;
  const mid = (Number(v[0]) + Number(v[1])) / 2;
  return Number.isFinite(mid) ? mid : null;
}

function unitOf(pack: Pack, variable: string): string | null {
  const v = pack.schema.variables.find((x) => x.id === variable);
  return v && v.type === "num" && v.unit ? v.unit : null;
}

export function histogram(pack: Pack, variable: string, bins?: number): Histogram | null {
  const pts: { id: string; x: number }[] = [];
  for (const r of pack.records) {
    const x = numericValue(r, variable);
    if (x !== null) pts.push({ id: r.id, x });
  }
  const n = pts.length;
  if (n === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    if (p.x < min) min = p.x;
    if (p.x > max) max = p.x;
  }
  const base = { variable, unit: unitOf(pack, variable), n, min, max };
  if (min === max) {
    return { ...base, bins: [{ from: min, to: max, count: n, records: pts.map((p) => p.id) }] };
  }
  const k = bins && bins > 0 ? Math.floor(bins) : Math.min(12, Math.max(3, Math.ceil(Math.log2(n)) + 1));
  const width = (max - min) / k;
  const out = Array.from({ length: k }, (_, i) => ({
    from: min + i * width,
    to: i === k - 1 ? max : min + (i + 1) * width,
    count: 0,
    records: [] as string[],
  }));
  for (const p of pts) {
    const i = Math.min(k - 1, Math.floor((p.x - min) / width));
    out[i].count++;
    out[i].records.push(p.id);
  }
  return { ...base, bins: out };
}

export function scatterPoints(pack: Pack, x: string, y: string): ScatterPoint[] {
  const short = new Map(pack.studies.map((s) => [s.id, s.short]));
  const out: ScatterPoint[] = [];
  for (const r of pack.records) {
    const xv = numericValue(r, x);
    const yv = numericValue(r, y);
    if (xv === null || yv === null) continue;
    out.push({ record: r.id, x: xv, y: yv, label: `${short.get(r.study) ?? r.study} · ${r.label}` });
  }
  return out;
}

const isDone = (d: UploadedDoc): boolean => d.status === "done";

export function coverageMatrix(docs: UploadedDoc[], vars: ExtractedVariable[], ids: string[]): CoverageMatrix {
  const done = docs.filter(isDone);
  const byId = new Map(vars.map((v) => [v.id, v]));
  const variables: { id: string; label: string }[] = [];
  for (const id of ids) {
    const v = byId.get(id);
    if (v) variables.push({ id: v.id, label: v.label });
  }
  const cells: CoverageCell[] = [];
  for (const d of done) {
    for (const v of variables) {
      const c = byId.get(v.id)?.citations.find((x) => x.docId === d.id);
      cells.push(
        c
          ? { docId: d.id, variable: v.id, found: true, page: c.page, row: c.row, quote: c.quote }
          : { docId: d.id, variable: v.id, found: false },
      );
    }
  }
  return { docs: done.map((d) => ({ id: d.id, name: d.name })), variables, cells };
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function paperRelevance(docs: UploadedDoc[], vars: ExtractedVariable[], purpose: string, scenario?: Scenario): PaperRelevance[] {
  const done = docs.filter(isDone);
  const purposeTokens = new Set(tokens(purpose));
  const matching = vars.filter(
    (v) => v.citations.length > 0 && tokens(v.label).some((t) => purposeTokens.has(t)),
  );
  const top = scoreVariables(done, vars, purpose).slice(0, 10);
  const byId = new Map(vars.map((v) => [v.id, v]));
  const active = scenario ? scenario.active.map((id) => byId.get(id)).filter((v): v is ExtractedVariable => !!v) : [];

  const out: PaperRelevance[] = done.map((d) => {
    const cites = (v: ExtractedVariable): boolean => v.citations.some((c) => c.docId === d.id);
    const matchHit = matching.filter(cites);
    const topHit = top.filter((s) => s.citations.some((c) => c.docId === d.id));
    const reasons: string[] = [];
    const shared = new Set<string>();

    const fMatch = matching.length ? matchHit.length / matching.length : 0;
    if (matchHit.length) {
      reasons.push(`cites ${matchHit.length} of ${matching.length} variables named in the purpose`);
      matchHit.forEach((v) => shared.add(v.label));
    }
    const fTop = top.length ? topHit.length / top.length : 0;
    if (topHit.length) {
      reasons.push(`cites ${topHit.length} of the ${top.length} highest-scored variables`);
      topHit.forEach((s) => shared.add(s.label));
    }

    let fThird = 0;
    if (scenario) {
      const hit = active.filter(cites);
      fThird = active.length ? hit.length / active.length : 0;
      if (hit.length) {
        reasons.push(`cites ${hit.length} of ${active.length} variables in the case`);
        hit.forEach((v) => shared.add(v.label));
      }
    } else if (purposeTokens.size) {
      const page1 = d.paper?.pages?.find((p) => p.page === 1)?.text ?? d.paper?.pages?.[0]?.text ?? "";
      const docTokens = new Set(tokens(`${d.paper?.title ?? ""} ${d.name} ${page1}`));
      const overlap = [...purposeTokens].filter((t) => docTokens.has(t));
      fThird = overlap.length / purposeTokens.size;
      if (overlap.length) reasons.push(`title or first page mentions ${overlap.join(", ")}`);
    }

    const score = Math.round((0.5 * fMatch + 0.3 * fTop + 0.2 * fThird) * 1000) / 1000;
    return {
      docId: d.id,
      name: d.name,
      title: d.paper?.title,
      doi: d.paper?.doi,
      year: d.paper?.year,
      score,
      shared: [...shared],
      reasons,
    };
  });
  out.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function docSummaries(docs: UploadedDoc[], vars: ExtractedVariable[]): DocSummary[] {
  return docs.filter(isDone).map((d) => {
    const cited = vars
      .map((v) => {
        const c = v.citations.find((x) => x.docId === d.id);
        return c ? { v, c } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const variables = cited.map(({ v, c }) => ({ id: v.id, label: v.label, page: c.page, row: c.row }));
    const withUnit = (v: ExtractedVariable): string => (v.unit ? `${v.label} (${v.unit})` : v.label);
    const base = { docId: d.id, name: d.name, kind: d.kind, variables };

    if (d.kind === "table") {
      const columns = d.table?.columns.length ?? 0;
      const rows = d.rowCount ?? d.table?.rows.length ?? 0;
      const names = (d.table?.columns ?? []).slice(0, 5).map((c) => c.label || c.name);
      const text = `Table with ${rows} ${plural(rows, "row", "rows")} and ${columns} ${plural(columns, "column", "columns")}${
        names.length ? `, including ${joinList(names)}` : ""
      }.`;
      return { ...base, kind: "table" as const, rows, text, mode: "template" as const };
    }
    const pages = d.paper?.pageCount ?? d.pageCount ?? d.paper?.pages.length ?? 0;
    const year = d.paper?.year;
    const shown = cited.slice(0, 4).map(({ v, c }) => `${withUnit(v)}${c.page ? ` on p. ${c.page}` : ""}`);
    const text = `${pages}-page paper${year ? ` (${year})` : ""}${shown.length ? ` reporting ${joinList(shown)}` : " with no extracted variables"}.`;
    return {
      ...base,
      kind: "paper" as const,
      title: d.paper?.title,
      doi: d.paper?.doi,
      year,
      pages,
      text,
      mode: "template" as const,
    };
  });
}

interface Measured {
  id: string;
  study: string;
  lo: number;
  hi: number;
  mid: number;
}

/** Records that give a numeric value for the variable, with the ends and the midpoint of the tested range. */
function measured(pack: Pack, variable: string): Measured[] {
  const out: Measured[] = [];
  for (const r of pack.records) {
    const v = numRange(r, variable);
    if (!v) continue;
    const lo = Number(v[0]);
    const hi = Number(v[1]);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    out.push({ id: r.id, study: r.study, lo, hi, mid: (lo + hi) / 2 });
  }
  return out;
}

function labelOf(pack: Pack, variable: string): string {
  return pack.schema.variables.find((x) => x.id === variable)?.label ?? variable;
}

function isNumeric(pack: Pack, variable: string): boolean {
  return pack.schema.variables.find((x) => x.id === variable)?.type === "num";
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Quantile of sorted values by linear interpolation between the two nearest ranks. */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)) * 1e6) / 1e6;
}

/** Lowest and highest tested value of each variable, with the record that holds it. */
export function keyFigures(pack: Pack, ids: string[]): KeyFigures {
  const total = pack.records.length;
  const figures: KeyFigure[] = [];
  for (const id of ids) {
    if (!isNumeric(pack, id)) continue;
    const base = { variable: id, label: labelOf(pack, id), unit: unitOf(pack, id), total };
    const m = measured(pack, id);
    if (m.length === 0) {
      figures.push({ ...base, n: 0, min: null, max: null, minRecord: null, maxRecord: null });
      continue;
    }
    let lo = m[0];
    let hi = m[0];
    for (const x of m) {
      if (x.lo < lo.lo) lo = x;
      if (x.hi > hi.hi) hi = x;
    }
    figures.push({ ...base, n: m.length, min: lo.lo, max: hi.hi, minRecord: lo.id, maxRecord: hi.id });
  }
  return { records: total, groups: pack.studies.length, figures };
}

/** Records per category of a categorical variable; the most frequent `limit` categories are listed. */
export function categoryCounts(pack: Pack, variable: string, limit = 12): CategoryCounts {
  const by = new Map<string, string[]>();
  let n = 0;
  for (const r of pack.records) {
    const v = r.values[variable];
    if (typeof v !== "string" || !v) continue;
    n++;
    const list = by.get(v);
    if (list) list.push(r.id);
    else by.set(v, [r.id]);
  }
  const all: CategoryCount[] = [...by].map(([category, records]) => ({ category, count: records.length, records }));
  all.sort((a, b) => b.count - a.count || byText(a.category, b.category));
  const top = all.slice(0, Math.max(1, Math.floor(limit)));
  const rest = all.slice(top.length);
  return {
    variable,
    n,
    total: pack.records.length,
    categories: top,
    other: { categories: rest.length, count: rest.reduce((s, c) => s + c.count, 0) },
  };
}

/**
 * Tested range and median of a numeric variable inside each group. A group is a source document,
 * or a category of `by` when it is given. The `limit` groups with most records are kept.
 */
export function groupRanges(pack: Pack, variable: string, by?: string, limit = 12): GroupRanges | null {
  const m = measured(pack, variable);
  if (m.length === 0) return null;
  const recordById = by ? new Map(pack.records.map((r) => [r.id, r])) : null;
  const short = new Map(pack.studies.map((s) => [s.id, s.short]));
  const groups = new Map<string, Measured[]>();
  for (const x of m) {
    let key: string | null = x.study;
    if (by && recordById) {
      const c = recordById.get(x.id)?.values[by];
      key = typeof c === "string" && c ? c : null;
    }
    if (key === null) continue;
    const list = groups.get(key);
    if (list) list.push(x);
    else groups.set(key, [x]);
  }
  const all: GroupRange[] = [...groups].map(([key, list]) => {
    let lo = list[0];
    let hi = list[0];
    for (const x of list) {
      if (x.lo < lo.lo) lo = x;
      if (x.hi > hi.hi) hi = x;
    }
    const mids = list.map((x) => x.mid).sort((a, b) => a - b);
    return {
      key,
      label: by ? key : (short.get(key) ?? key),
      n: list.length,
      min: lo.lo,
      median: quantile(mids, 0.5),
      max: hi.hi,
      minRecord: lo.id,
      maxRecord: hi.id,
    };
  });
  if (all.length === 0) return null;
  all.sort((a, b) => b.n - a.n || byText(a.label, b.label));
  const kept = all.slice(0, Math.max(1, Math.floor(limit)));
  kept.sort((a, b) => b.median - a.median || byText(a.label, b.label));
  return {
    variable,
    unit: unitOf(pack, variable),
    by: by ?? null,
    n: kept.reduce((s, g) => s + g.n, 0),
    min: Math.min(...kept.map((g) => g.min)),
    max: Math.max(...kept.map((g) => g.max)),
    groups: kept,
    omitted: all.length - kept.length,
  };
}

/** Five-number summary of the midpoints of the tested ranges of each numeric variable. */
export function boxSummary(pack: Pack, ids: string[]): BoxSummary {
  const rows: BoxRow[] = [];
  const empty: BoxSummary["empty"] = [];
  for (const id of ids) {
    if (!isNumeric(pack, id)) continue;
    const m = measured(pack, id);
    if (m.length === 0) {
      empty.push({ variable: id, label: labelOf(pack, id) });
      continue;
    }
    // The first record in pack order holds each end, so ties resolve the same way on every run.
    let lo = m[0];
    let hi = m[0];
    for (const x of m) {
      if (x.mid < lo.mid) lo = x;
      if (x.mid > hi.mid) hi = x;
    }
    const mids = m.map((x) => x.mid).sort((a, b) => a - b);
    rows.push({
      variable: id,
      label: labelOf(pack, id),
      unit: unitOf(pack, id),
      n: m.length,
      min: lo.mid,
      q1: quantile(mids, 0.25),
      median: quantile(mids, 0.5),
      q3: quantile(mids, 0.75),
      max: hi.mid,
      minRecord: lo.id,
      maxRecord: hi.id,
    });
  }
  return { rows, empty };
}

type AxisIndex = (r: DataRecord) => number | null;

/** Axis of a cross table: the most frequent categories, or cells between quantiles of a numeric variable. */
function crossAxis(pack: Pack, variable: string, records: DataRecord[], maxCategories: number, cells: number): { axis: CrossAxis; index: AxisIndex; size: number } {
  const base = { variable, label: labelOf(pack, variable), unit: unitOf(pack, variable) };
  if (isNumeric(pack, variable)) {
    const mids: number[] = [];
    for (const r of records) {
      const x = numericValue(r, variable);
      if (x !== null) mids.push(x);
    }
    const edges = quantileEdges(mids, cells);
    const last = edges.length - 2;
    const index: AxisIndex = (r) => {
      const x = numericValue(r, variable);
      if (x === null || edges.length < 2 || x < edges[0] || x > edges[edges.length - 1]) return null;
      for (let i = 0; i < last; i++) if (x < edges[i + 1]) return i;
      return last;
    };
    return { axis: { ...base, kind: "num", edges }, index, size: Math.max(0, edges.length - 1) };
  }
  const counts = new Map<string, number>();
  for (const r of records) {
    const v = r.values[variable];
    if (typeof v === "string" && v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const categories = [...counts]
    .sort((a, b) => b[1] - a[1] || byText(a[0], b[0]))
    .slice(0, maxCategories)
    .map(([c]) => c);
  const at = new Map(categories.map((c, i) => [c, i]));
  const index: AxisIndex = (r) => {
    const v = r.values[variable];
    return typeof v === "string" ? (at.get(v) ?? null) : null;
  };
  return { axis: { ...base, kind: "cat", categories }, index, size: categories.length };
}

/**
 * Number of records in each combination of two variables. A cell counts the records that give both values.
 * The axes are built from every record that gives the variable, so a category that never comes with the other
 * variable keeps its row of zeros, and `rowMissing` / `columnMissing` say how many records lack the other value.
 */
export function crossTab(pack: Pack, row: string, column: string, maxCategories = 8, cells = 4): CrossTab {
  const has = (r: DataRecord, id: string): boolean => {
    const v = r.values[id];
    return Array.isArray(v) ? numericValue(r, id) !== null : typeof v === "string" && v !== "";
  };
  const rows = crossAxis(pack, row, pack.records, maxCategories, cells);
  const cols = crossAxis(pack, column, pack.records, maxCategories, cells);
  const out: CrossCell[] = [];
  for (let i = 0; i < rows.size; i++) for (let j = 0; j < cols.size; j++) out.push({ row: i, column: j, count: 0, records: [] });
  const rowMissing = Array.from({ length: rows.size }, () => 0);
  const columnMissing = Array.from({ length: cols.size }, () => 0);
  let n = 0;
  let omitted = 0;
  for (const r of pack.records) {
    const hasRow = has(r, row);
    const hasColumn = has(r, column);
    if (!hasRow && !hasColumn) continue;
    const i = hasRow ? rows.index(r) : null;
    const j = hasColumn ? cols.index(r) : null;
    if (i !== null && j !== null) {
      const cell = out[i * cols.size + j];
      cell.count++;
      cell.records.push(r.id);
      n++;
    } else if (hasRow && hasColumn) omitted++;
    else if (i !== null) rowMissing[i]++;
    else if (j !== null) columnMissing[j]++;
  }
  return { row: rows.axis, column: cols.axis, cells: out, n, max: out.reduce((m, c) => Math.max(m, c.count), 0), rowMissing, columnMissing, omitted };
}

/** Share of the records, and number of source documents, that give a value for each variable. */
export function completeness(pack: Pack, ids: string[]): CompletenessRow[] {
  const total = pack.records.length;
  const groupsTotal = pack.studies.length;
  const known = new Set(pack.schema.variables.map((v) => v.id));
  return ids.filter((id) => known.has(id)).map((id) => {
    let n = 0;
    const groups = new Set<string>();
    for (const r of pack.records) {
      const v = r.values[id];
      if (v === undefined || v === null || v === "") continue;
      n++;
      groups.add(r.study);
    }
    return { variable: id, label: labelOf(pack, id), n, total, share: total ? Math.round((n / total) * 1000) / 1000 : 0, groups: groups.size, groupsTotal };
  });
}

/** The records at one end of a numeric variable, with the values they give for other variables. */
export function recordsTable(pack: Pack, sort: string, order: "asc" | "desc", columns: string[], limit = 8): RecordsTable {
  const ids = [sort, ...columns.filter((c) => c !== sort)].filter((id, i, a) => a.indexOf(id) === i && pack.schema.variables.some((v) => v.id === id));
  const m = measured(pack, sort);
  m.sort((a, b) => (order === "desc" ? b.hi - a.hi : a.lo - b.lo) || byText(a.id, b.id));
  const recordById = new Map(pack.records.map((r) => [r.id, r]));
  const short = new Map(pack.studies.map((s) => [s.id, s.short]));
  const rows = m.slice(0, Math.max(1, Math.floor(limit))).map((x) => {
    const r = recordById.get(x.id)!;
    return {
      record: r.id,
      group: short.get(r.study) ?? r.study,
      label: r.label,
      values: ids.map((id) => {
        const v = r.values[id];
        if (Array.isArray(v)) return [Number(v[0]), Number(v[1])] as [number, number];
        return typeof v === "string" && v ? v : null;
      }),
    };
  });
  return {
    sort,
    order,
    columns: ids.map((id) => ({ id, label: labelOf(pack, id), unit: unitOf(pack, id) })),
    rows,
    n: m.length,
  };
}

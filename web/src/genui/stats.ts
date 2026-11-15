/** Deterministic statistics for dashboard modules. Pure: only reads the pack, documents and variables. */
import type { DataRecord, Pack, Scenario } from "../engine";
import type { ExtractedVariable, UploadedDoc } from "../ingest/types";
import { scoreVariables, tokens } from "./score";
import type { CoverageCell, CoverageMatrix, DocSummary, Histogram, PaperRelevance, ScatterPoint } from "./types";

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

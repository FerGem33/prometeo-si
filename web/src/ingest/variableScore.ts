/**
 * Deterministic, explainable relevance score for candidate variables (spec §3.2).
 * Weights and their rationale: docs/PUNTUACION_VARIABLES.md. The AI may add candidates (/propose),
 * but it never sets a score.
 */
import type { Pack } from "../engine/types";
import type { ExtractedVariable, UploadedDoc } from "./types";

export const SCORE_WEIGHTS = { coverage: 0.3, purpose: 0.25, frequency: 0.2, measurability: 0.15, position: 0.1 } as const;

export interface ScoreParts {
  coverage: number;
  purpose: number;
  frequency: number;
  measurability: number;
  position: number;
}

const STOP = new Set(
  "the a an of in on at to for and or with about from by as is are be into over under regarding respect make made informed informing decisions decision take taking using use our my their this that these those what which how when where who whose de la el los las un una y o en con sobre para por del al respecto tomar informadas informados decisiones decision que se su sus".split(" "),
);

/** Lower-case words without accents, stop words removed. */
export function words(text: string): string[] {
  return [...new Set((text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9₀-₉]+/g) ?? []).filter((w) => w.length > 1 && !STOP.has(w)))];
}

/** Word stems (first 5 letters). */
export function terms(text: string): string[] {
  return [...new Set(words(text).map((w) => w.slice(0, 5)))];
}

/** A variable word matches the purpose by stem, or when a purpose word contains it ("microgravity" ⊃ "gravity"). */
const matchesWord = (w: string, purpose: string[]) => purpose.some((p) => p.slice(0, 5) === w.slice(0, 5) || (w.length >= 5 && p.includes(w)));

function countMentions(hay: string, needle: string): number {
  if (needle.length < 3) return 0;
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

interface Stats {
  docs: number;
  headers: number;
  findings: number;
  mentions: number;
  prominent: number;
}

/** Text of a paper in three zones: everything, and title + abstract + conclusions. */
function zones(d: UploadedDoc): { all: string; prominent: string } {
  const pages = d.paper?.pages ?? [];
  const all = pages.map((p) => p.text).join("\n").toLowerCase();
  const head = `${d.paper?.title ?? ""}\n${(pages[0]?.text ?? "").slice(0, 2500)}`.toLowerCase();
  const c = all.search(/\n\s*(\d+\.?\s*)?(conclusions?|concluding remarks|summary)\b/);
  return { all, prominent: `${head}\n${c >= 0 ? all.slice(c, c + 4000) : ""}\n${d.name.toLowerCase()}` };
}

function statsFromDocs(vars: ExtractedVariable[], docs: UploadedDoc[]): Map<string, Stats> {
  const ready = docs.filter((d) => d.status === "done");
  const z = new Map(ready.map((d) => [d.id, zones(d)]));
  const out = new Map<string, Stats>();
  for (const v of vars) {
    const docIds = new Set(v.citations.map((c) => c.docId));
    const needle = v.label.toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").trim();
    let mentions = 0;
    let prominent = 0;
    for (const d of ready) {
      const zz = z.get(d.id)!;
      const m = d.kind === "paper" ? countMentions(zz.all, needle) : 0;
      if (m > 0) docIds.add(d.id);
      mentions += m;
      if (countMentions(zz.prominent, needle) > 0) prominent++;
    }
    out.set(v.id, {
      docs: docIds.size,
      headers: v.citations.filter((c) => c.kind === "table").length,
      findings: v.citations.filter((c) => c.kind === "paper").length,
      mentions,
      prominent,
    });
  }
  return out;
}

/** Same statistics for a pack without uploaded documents: studies stand for documents, source tables for headers. */
function statsFromPack(vars: ExtractedVariable[], pack: Pack): Map<string, Stats> {
  const out = new Map<string, Stats>();
  for (const v of vars) {
    const recs = pack.records.filter((r) => r.values[v.id] !== undefined && r.values[v.id] !== "");
    const studies = new Set(recs.map((r) => r.study));
    const needle = v.label.toLowerCase();
    out.set(v.id, {
      docs: studies.size,
      headers: new Set(recs.map((r) => r.source.id)).size,
      findings: 0,
      mentions: recs.length,
      prominent: pack.studies.filter((s) => countMentions(`${s.title} ${s.summary?.objective ?? ""}`.toLowerCase(), needle) > 0).length,
    });
  }
  return out;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Scores and orders variables. Variables without provenance (no citation) are dropped.
 * Ties keep the input order, so the result is stable.
 */
export function scoreVariables(
  vars: ExtractedVariable[],
  opts: { docs: UploadedDoc[]; purpose: string; pack?: Pack; longLabels?: Record<string, string> },
): (ExtractedVariable & { score: number; reasons: string[]; parts: ScoreParts })[] {
  const sourced = vars.filter((v) => v.citations.length > 0);
  const usePack = opts.docs.filter((d) => d.status === "done").length === 0 && !!opts.pack;
  const stats = usePack ? statsFromPack(sourced, opts.pack!) : statsFromDocs(sourced, opts.docs);
  const totalDocs = Math.max(1, usePack ? opts.pack!.studies.length : opts.docs.filter((d) => d.status === "done").length);
  const weighted = (s: Stats) => 3 * s.headers + s.findings + 0.5 * s.mentions;
  const maxW = Math.max(1, ...[...stats.values()].map(weighted));
  const purposeWords = words(opts.purpose);

  return sourced
    .map((v, i) => {
      const s = stats.get(v.id)!;
      const own = words(`${v.label} ${v.id.replace(/_/g, " ")} ${opts.longLabels?.[v.id] ?? ""}`);
      const hits = own.filter((w) => matchesWord(w, purposeWords));
      const parts: ScoreParts = {
        coverage: round2(Math.min(1, s.docs / totalDocs)),
        purpose: round2(own.length ? hits.length / own.length : 0),
        frequency: round2(Math.log2(1 + weighted(s)) / Math.log2(1 + maxW)),
        measurability: v.type === "numeric" ? (v.unit ? 1 : 0.7) : (v.categories?.length ?? 0) >= 2 ? 0.4 : 0.1,
        position: round2(s.docs ? Math.min(1, s.prominent / s.docs) : 0),
      };
      const score = Math.round(100 * (Object.keys(SCORE_WEIGHTS) as (keyof ScoreParts)[]).reduce((n, k) => n + SCORE_WEIGHTS[k] * parts[k], 0));
      const reasons = [
        `appears in ${s.docs} of ${totalDocs} ${usePack ? "studies" : "documents"}`,
        ...(s.headers ? [`in ${s.headers} table ${usePack ? "source" : "header"}${s.headers === 1 ? "" : "s"}`] : []),
        ...(s.findings ? [`${s.findings} value${s.findings === 1 ? "" : "s"} quoted from PDFs`] : []),
        ...(!usePack && s.mentions ? [`${s.mentions} mention${s.mentions === 1 ? "" : "s"} in PDF text`] : []),
        ...(s.prominent ? [`in a title, abstract or conclusion (${s.prominent})`] : []),
        ...(hits.length ? [`matches the purpose: ${hits.join(", ")}`] : []),
        v.type === "numeric" ? (v.unit ? `numeric, unit ${v.unit}` : "numeric, no unit") : "categorical",
      ];
      return { ...v, score, reasons, parts, i };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ i: _i, ...v }) => v);
}

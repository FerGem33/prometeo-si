/** Deterministic relevance score of extracted variables (spec §4). Pure: no DOM, no network. */
import { isOutcomeColumn } from "../ingest/buildPack";
import type { ExtractedVariable, UploadedDoc } from "../ingest/types";
import { DEFAULT_CASE_VARIABLES, SCORE_WEIGHTS } from "./types";
import type { ScoreParts, VariableScore } from "./types";

const STOPWORDS = new Set(
  (
    "a an and are as at be by for from has have in into is it its of on or that the this to was were with which " +
    "than then these those their there not no but if so such can may per via over under between among about " +
    "al ante con contra cual cuando de del desde donde el ella ellos en entre es esta este esto la las le les lo los " +
    "mas me mi muy no nos o para pero por que se si sin sobre su sus un una uno unos y ya"
  ).split(" "),
);

const MAX_TEXT_MENTIONS_PER_DOC = 50;

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function singular(token: string): string {
  if (/(ses|xes|zes|ches|shes)$/.test(token) && token.length > 4) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !/(ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
}

/** Lowercase, no accents, no EN/ES stopwords, no plural suffix, no 1-char tokens. */
export function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of stripAccents(text.toLowerCase()).split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    const tok = singular(raw);
    if (tok.length >= 2) out.push(tok);
  }
  return out;
}

function norm(text: string): string {
  return stripAccents(text.toLowerCase());
}

const isWordChar = (c: string | undefined): boolean => c !== undefined && /[a-z0-9]/.test(c);

/** Whole-word occurrences of `needle` in `hay` (both already normalized), capped. */
function countWord(hay: string, needle: string, cap: number): number {
  if (!needle) return 0;
  let n = 0;
  let from = 0;
  while (n < cap) {
    const i = hay.indexOf(needle, from);
    if (i < 0) break;
    const before = i > 0 ? hay[i - 1] : undefined;
    const after = hay[i + needle.length];
    if (!isWordChar(before) && !isWordChar(after)) n++;
    from = i + needle.length;
  }
  return n;
}

function hasWord(hay: string, needle: string): boolean {
  return countWord(hay, needle, 1) > 0;
}

/** Label without a trailing "(unit)" / "[unit]", normalized for text matching. */
function matchLabel(label: string): string {
  return norm(label.replace(/\([^)]*\)|\[[^\]]*\]/g, " "))
    .replace(/[_\s]+/g, " ")
    .trim();
}

interface DocText {
  title: string;
  first: string;
  last: string;
  all: string;
  conclusions: string;
  pages: number;
}

function docText(doc: UploadedDoc): DocText | null {
  const paper = doc.paper;
  if (doc.kind !== "paper" || !paper || !paper.pages?.length) return null;
  const pages = paper.pages;
  const texts = pages.map((p) => norm(p.text).replace(/[_\s]+/g, " "));
  const conclusions: string[] = [];
  for (const t of texts) {
    const m = /conclusions?|conclusiones?/.exec(t);
    if (m) conclusions.push(t.slice(m.index, m.index + 1500));
  }
  return {
    title: norm(paper.title ?? ""),
    first: texts[0] ?? "",
    last: texts[texts.length - 1] ?? "",
    all: texts.join("\n"),
    conclusions: conclusions.join("\n"),
    pages: pages.length,
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export function scoreVariables(docs: UploadedDoc[], vars: ExtractedVariable[], purpose: string): VariableScore[] {
  const parsed = docs.filter((d) => d.status === "done" || d.table || d.paper);
  const totalDocs = Math.max(parsed.length, 1);
  const texts = new Map<string, DocText | null>();
  for (const d of parsed) texts.set(d.id, docText(d));
  const purposeTokens = new Set(tokens(purpose));

  interface Raw {
    v: ExtractedVariable;
    docCount: number;
    header: number;
    finding: number;
    text: number;
    m: number;
    positionDocs: number;
    position: number;
    purposeHits: string[];
    labelTokens: number;
  }
  const raws: Raw[] = [];

  for (const v of vars) {
    if (!v.citations || v.citations.length === 0) continue;
    if (isOutcomeColumn(v.id) || isOutcomeColumn(v.label)) continue;
    const docIds = new Set(v.citations.map((c) => c.docId));
    const header = v.citations.filter((c) => c.kind === "table").length;
    const finding = v.citations.filter((c) => c.kind === "paper").length;

    const needle = matchLabel(v.label);
    let text = 0;
    let position = 0;
    let positionDocs = 0;
    for (const d of parsed) {
      const dt = texts.get(d.id);
      let docPos = 0;
      if (dt && needle) {
        text += countWord(dt.all, needle, MAX_TEXT_MENTIONS_PER_DOC);
        if (hasWord(dt.title, needle) || hasWord(dt.first, needle)) docPos = 1;
        else if (hasWord(dt.last, needle) || hasWord(dt.conclusions, needle)) docPos = 0.5;
      }
      if (docIds.has(d.id) && docPos < 1 && v.citations.some((c) => c.docId === d.id && c.kind === "paper" && c.page === 1)) docPos = 1;
      if (docPos === 1) positionDocs++;
      position = Math.max(position, docPos);
    }

    const labelTokens = tokens(v.label);
    const hits = [...new Set(labelTokens)].filter((t) => purposeTokens.has(t));
    raws.push({
      v,
      docCount: docIds.size,
      header,
      finding,
      text,
      m: 3 * header + 2 * finding + text,
      positionDocs,
      position,
      purposeHits: hits,
      labelTokens: new Set(labelTokens).size,
    });
  }

  const logMax = Math.log(1 + Math.max(1, ...raws.map((r) => r.m)));

  const scores: VariableScore[] = raws.map((r) => {
    const { v } = r;
    const hasValues = v.min !== undefined || v.max !== undefined || v.median !== undefined;
    let measurability = 0;
    if (v.type === "numeric") measurability = v.unit && hasValues ? 1 : 0.6;
    else if ((v.categories?.length ?? 0) >= 2) measurability = 0.3;

    const parts: ScoreParts = {
      coverage: Math.min(1, r.docCount / totalDocs),
      frequency: logMax > 0 ? Math.log(1 + r.m) / logMax : 0,
      position: r.position,
      purpose: purposeTokens.size && r.labelTokens ? r.purposeHits.length / r.labelTokens : 0,
      measurability,
    };
    const score = round3(
      parts.coverage * SCORE_WEIGHTS.coverage +
        parts.frequency * SCORE_WEIGHTS.frequency +
        parts.position * SCORE_WEIGHTS.position +
        parts.purpose * SCORE_WEIGHTS.purpose +
        parts.measurability * SCORE_WEIGHTS.measurability,
    );

    const reasons: string[] = [];
    if (parts.coverage > 0) reasons.push(`appears in ${r.docCount} of ${totalDocs} documents`);
    if (parts.frequency > 0) {
      const bits: string[] = [];
      if (r.header) bits.push(`${r.header} table ${r.header === 1 ? "header" : "headers"}`);
      if (r.finding) bits.push(`${r.finding} numeric ${r.finding === 1 ? "finding" : "findings"}`);
      if (r.text) bits.push(`${r.text} text ${r.text === 1 ? "mention" : "mentions"}`);
      if (bits.length) reasons.push(bits.join(" · "));
    }
    if (parts.position > 0) {
      reasons.push(
        r.positionDocs > 0
          ? `on page 1 of ${r.positionDocs} ${r.positionDocs === 1 ? "document" : "documents"}`
          : "in the last page or conclusions",
      );
    }
    if (parts.purpose > 0) reasons.push(`matches the purpose: ${r.purposeHits.join(", ")}`);
    if (parts.measurability > 0) {
      reasons.push(
        v.type === "numeric"
          ? v.unit
            ? `numeric with unit (${v.unit})`
            : "numeric without unit"
          : `categorical with ${v.categories?.length ?? 0} categories`,
      );
    }

    return {
      id: v.id,
      label: v.label,
      unit: v.unit ?? null,
      type: v.type,
      score,
      parts,
      docCount: r.docCount,
      mentions: { header: r.header, finding: r.finding, text: r.text },
      reasons,
      citations: v.citations,
    };
  });

  scores.sort(
    (a, b) =>
      b.score - a.score ||
      b.docCount - a.docCount ||
      (a.label < b.label ? -1 : a.label > b.label ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return scores;
}

export function defaultSelection(scores: VariableScore[], n: number = DEFAULT_CASE_VARIABLES): string[] {
  return scores.slice(0, n).map((s) => s.id);
}

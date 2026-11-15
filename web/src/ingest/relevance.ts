import type { Pack } from "../engine";
import type { ExtractedVariable, UploadedDoc, VariableCitation } from "./types";

export const RELEVANCE_WEIGHTS = { frequency: 0.25, coverage: 0.25, position: 0.15, purpose: 0.25, measurability: 0.10 } as const;
const normalize = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => normalize(s).match(/[\p{L}\p{N}]+/gu) ?? [];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const compact = (s: string) => normalize(s).replace(/\s+/g, " ");
const has = (text: string, term: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(normalize(term))}(?=$|[^\\p{L}\\p{N}])`, "u").test(normalize(text));
const rounded = (n: number) => Math.round(n * 1000) / 1000;

/** Only actual source rows/pages can support a proposal. Labels alone are not evidence. */
export function verifiedVariableCitation(c: VariableCitation, docs: UploadedDoc[], pack?: Pack): boolean {
  if (!c.quote.trim()) return false;
  if (c.basis === "approved_pack") {
    const record = pack?.records.find(r => r.id === c.recordId);
    return !!record && !!c.variableId && record.values[c.variableId] !== undefined &&
      record.source.id === c.docId && record.source.row === c.row && record.source.page === c.page &&
      c.quote === JSON.stringify(record.values[c.variableId]);
  }
  const doc = docs.find(d => d.id === c.docId && d.status === "done");
  if (doc) {
    if (c.kind === "paper") {
      const page = doc.paper?.pages.find(p => p.page === c.page);
      return !!page && compact(page.text).includes(compact(c.quote));
    }
    const row = doc.table?.rows.find(r => r.row === c.row);
    if (!row) return false;
    if (c.column) {
      const index = doc.table!.headers.indexOf(c.column);
      const raw = row.values[index];
      return index >= 0 && !!raw?.trim() && compact(c.quote).includes(compact(raw));
    }
    return compact(row.values.join(" ")).includes(compact(c.quote));
  }
  return !!pack?.records.some(r => r.source.id === c.docId &&
    (c.kind === "paper" ? r.source.page === c.page && !!r.quote && compact(r.quote).includes(compact(c.quote)) :
      r.source.row === c.row && Object.values(r.orig ?? {}).some(o => (o.column ?? undefined) === c.column && o.text === c.quote)));
}

/** Reference corpus proposals use original row citations, never a synthetic "pack" citation. */
export function variablesFromPack(pack: Pack): ExtractedVariable[] {
  return pack.schema.variables.filter(v => !(v.type === "cat" && v.role === "partition")).map(v => {
    const records = pack.records.filter(r => r.values[v.id] !== undefined);
    const citations: VariableCitation[] = [];
    const seen = new Set<string>();
    for (const r of records) {
      const source = pack.sources.find(s => s.id === r.source.id);
      const original = r.orig?.[v.id];
      const literal = r.confidence === "paper" ? r.quote : original?.text;
      const quote = literal || JSON.stringify(r.values[v.id]);
      if (!source || !quote || (r.source.row === undefined && r.source.page === undefined)) continue;
      const key = `${source.id}:${r.source.row ?? r.source.page}:${original?.column}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const study = pack.studies.find(s => s.id === r.study);
      citations.push({ docId: source.id, docName: source.name, kind: r.confidence === "paper" ? "paper" : "table",
        row: r.source.row, page: r.source.page, column: original?.column ?? undefined, quote,
        doi: study?.publications?.find(p => p.doi)?.doi ?? study?.links.find(l => l.kind === "doi")?.url,
        ...(!literal ? { basis: "approved_pack" as const, recordId: r.id, variableId: v.id } : {}) });
    }
    const categories = [...new Set(records.map(r => r.values[v.id]).filter((x): x is string => typeof x === "string"))].sort();
    return { id: v.id, label: v.long ?? v.label, type: v.type === "num" ? "numeric" : "categorical",
      unit: v.type === "num" ? v.unit : null, min: v.type === "num" ? v.range[0] : undefined,
      max: v.type === "num" ? v.range[1] : undefined, sigma: v.type === "num" ? v.sigma : undefined,
      categories, include: true, citations };
  });
}

/** Stable lexical ranking, independent of AI. The score is prioritization, never evidence strength. */
export function scoreVariables(vars: ExtractedVariable[], docs: UploadedDoc[], purpose: string, pack?: Pack): ExtractedVariable[] {
  const ready = docs.filter(d => d.status === "done");
  const sourceIds = new Set([...ready.map(d => d.id), ...(pack?.sources.map(s => s.id) ?? [])]);
  const eligible = vars.map(v => ({ ...v, citations: v.citations
    .filter(c => (!c.variableId || c.variableId === v.id) && verifiedVariableCitation(c, ready, pack))
    .map(c => ({ ...c, doi: c.doi ?? ready.find(d => d.id === c.docId)?.paper?.doi })) }))
    .filter(v => v.citations.length > 0);
  const purposeTerms = new Set(tokens(purpose));
  const measured = eligible.map(v => {
    const ids = new Set(v.citations.map(c => c.docId));
    const aliases = [...new Set([v.label, v.id, ...v.citations.map(c => c.column ?? "")].filter(x => x.trim()))];
    const mentions = (text: string) => aliases.some(a => has(text, a));
    let headers = 0, texts = 0, positions = 0;
    for (const id of ids) {
      const doc = ready.find(d => d.id === id);
      if (doc?.table) headers += doc.table.headers.filter(mentions).length;
      else if (!doc) headers += new Set(v.citations.filter(c => c.docId === id && c.kind === "table" && c.column).map(c => c.column)).size;
      if (doc?.paper) {
        texts += Math.min(20, doc.paper.pages.reduce((n, p) => n + p.text.split(/[.!?\n]/).filter(mentions).length, 0));
        positions += Number(!!doc.paper.title && mentions(doc.paper.title));
        for (const section of [/\babstract\b|\bresumen\b/i, /\bconclusions?\b|\bconclusiones?\b/i]) {
          const page = doc.paper.pages.find(p => section.test(p.text));
          const match = page && section.exec(page.text);
          if (page && match && mentions(page.text.slice(match.index, match.index + 1500))) positions++;
        }
      }
    }
    const terms = [...new Set(tokens(`${v.id} ${v.label}`))];
    const relevance = terms.length ? terms.filter(t => purposeTerms.has(t)).length / terms.length : 0;
    return { v, headers, texts, positions, docs: ids.size, frequency: 3 * headers + texts,
      purpose: relevance, measurable: Number(!!v.unit) / 2 + Number(v.type === "numeric" && Number.isFinite(v.min) && Number.isFinite(v.max)) / 2 };
  });
  const maxFrequency = Math.max(1, ...measured.map(m => Math.log1p(m.frequency)));
  return measured.map(m => {
    const scoreComponents = { frequency: rounded(Math.log1p(m.frequency) / maxFrequency),
      coverage: rounded(m.docs / Math.max(1, sourceIds.size)), position: rounded(Math.min(1, m.positions / (3 * m.docs))),
      purpose: rounded(m.purpose), measurability: m.measurable };
    const score = rounded(100 * Object.entries(RELEVANCE_WEIGHTS).reduce((sum, [key, weight]) =>
      sum + scoreComponents[key as keyof typeof scoreComponents] * weight, 0));
    return { ...m.v, score, scoreComponents, reasons: [
      `Appears in ${m.docs} of ${sourceIds.size} source documents; ${m.headers} table headers and ${m.texts} bounded text mentions.`,
      `Title/abstract/conclusion matches: ${m.positions} (section-window heuristic).`,
      `Purpose term overlap: ${rounded(m.purpose * 100)}%; unit/numeric measurability: ${rounded(m.measurable * 100)}%.`,
    ] };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, "en"));
}

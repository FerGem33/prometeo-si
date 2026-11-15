/** Chat router: guard -> case command -> local stat -> search -> /chat (owner: S4). Pure apart from the injected `post`. */
import type { Pack, Scenario } from "../engine";
import type { UploadedDoc } from "../ingest/types";
import { answerLocalQuery, interpretLocalQuestion } from "../ingest/localAsk";
import type { LocalAnswer } from "../ingest/localAsk";
import { parseAsk } from "../report/api";
import { originalPack } from "../i18n/localize";
import { t, tx } from "../i18n";
import { num } from "../report/format";
import { chunkDocs, retrieve } from "./retrieve";
import type { ChatCitation, ChatTurn, Snippet } from "./types";

export interface ChatContext {
  pack: Pack;
  docs: UploadedDoc[];
  scenario: Scenario | null;
  history: ChatTurn[];
  isCustomCorpus: boolean;
  /** Injected network call (report/api.ts postApi); undefined when no API is configured. */
  post?: (path: string, body: unknown, signal: AbortSignal) => Promise<unknown>;
  signal: AbortSignal;
}

const SET_COMMAND = /\b(set|change|cambia|cambiar|pon|poner|fija|establece)\b/i;
const PREDICTION = /\b(is it safe|is this safe|will (it|this|that|they)|would (it|this)|predict(s|ion|ed)?|forecast|es seguro|va a|ir[aá] a|arder[aá]|se quemar[aá]|ser[aá] seguro)\b|\bpredic[ei]r?\b/i;
const TIMEOUT_MS = 20000;
const SEND_SNIPPETS = 8;
const SHOWN_LOCAL = 3;
const MAX_VARIABLES = 30;

const OP_TEXT: Record<string, string> = { "<": tx("below"), ">": tx("above"), "<=": tx("at or below"), ">=": tx("at or above"), between: tx("between") };
const STAT_TEXT: Record<string, string> = { max: tx("Maximum"), min: tx("Minimum"), mean: tx("Mean of the tested midpoints"), count: tx("Records with a value") };

let counter = 0;
const nextId = () => `a-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function isPredictionQuestion(q: string): boolean {
  return PREDICTION.test(q);
}

function statText(answer: LocalAnswer, pack: Pack): string {
  const v = pack.schema.variables.find((x) => x.id === answer.variable);
  const label = v?.label ?? answer.variable;
  const unit = answer.unit ? ` ${answer.unit}` : "";
  const study = (id: string) => pack.studies.find((s) => s.id === id)?.short ?? id;
  if (answer.kind === "stat") {
    if (answer.n === 0) return t("No record gives a value for {0}.", label);
    if (answer.stat === "count") return t("{0} of {1}: {2}.", t(STAT_TEXT.count), label, answer.value);
    return t("{0} of {1}: {2}{3}, over {4} records with a value.", t(STAT_TEXT[answer.stat]), label, num(answer.value), unit, answer.n);
  }
  const bounds = answer.bounds.map((b) => num(b)).join(t(" and "));
  if (answer.studies.length === 0) return t("No study records {0} {1} {2}{3}.", label, t(OP_TEXT[answer.op]), bounds, unit);
  return t("{0} studies record {1} {2} {3}{4}: {5}.", answer.studies.length, label, t(OP_TEXT[answer.op]), bounds, unit, answer.studies.map(study).join(", "));
}

const toCitation = (s: Snippet): ChatCitation => ({
  docId: s.docId, docName: s.docName, ...(s.page !== undefined ? { page: s.page } : {}), ...(s.row !== undefined ? { row: s.row } : {}), quote: s.text,
});

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Strict check of the /chat answer: every kept sentence has at least one citation whose quote appears in a snippet that was sent. */
function validateAi(x: unknown, sent: Snippet[]): { text: string; citations: ChatCitation[] } | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (o.mode !== "ai" || !Array.isArray(o.sentences) || o.sentences.length > 12) return null;
  const texts: string[] = [];
  const citations: ChatCitation[] = [];
  for (const s of o.sentences) {
    if (typeof s !== "object" || s === null) continue;
    const { text, cites } = s as { text?: unknown; cites?: unknown };
    if (typeof text !== "string" || !text.trim() || text.length > 2000 || !Array.isArray(cites) || !cites.length) continue;
    const ok: ChatCitation[] = [];
    for (const c of cites) {
      if (typeof c !== "object" || c === null) continue;
      const { docId, page, row, quote } = c as { docId?: unknown; page?: unknown; row?: unknown; quote?: unknown };
      if (typeof docId !== "string" || typeof quote !== "string" || squash(quote).length < 3) continue;
      if (page !== undefined && typeof page !== "number") continue;
      if (row !== undefined && typeof row !== "number") continue;
      const q = squash(quote);
      const hit = sent.find((sn) => sn.docId === docId && squash(sn.text).includes(q) && (page === undefined || sn.page === page) && (row === undefined || sn.row === row));
      if (hit) ok.push({ docId, docName: hit.docName, ...(hit.page !== undefined ? { page: hit.page } : {}), ...(hit.row !== undefined ? { row: hit.row } : {}), quote: q });
    }
    if (!ok.length) continue;
    texts.push(text.trim());
    for (const c of ok) if (!citations.some((d) => d.docId === c.docId && d.page === c.page && d.row === c.row && d.quote === c.quote)) citations.push(c);
  }
  return texts.length ? { text: texts.join(" "), citations } : null;
}

async function withTimeout<T>(signal: AbortSignal, run: (s: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  if (signal.aborted) ctl.abort(); else signal.addEventListener("abort", onAbort, { once: true });
  try { return await run(ctl.signal); } finally { clearTimeout(timer); signal.removeEventListener("abort", onAbort); }
}

async function evidenceTurn(q: string, ctx: ChatContext): Promise<ChatTurn> {
  const { pack } = ctx;
  const stat = answerLocalQuery(q, pack);
  if (!("unsupported" in stat)) return { id: nextId(), role: "assistant", text: statText(stat, pack), mode: "local_stat", records: stat.records };
  const found = retrieve(q, chunkDocs(ctx.docs, pack), SEND_SNIPPETS);
  if (!found.length) return { id: nextId(), role: "assistant", text: t("No passage of the documents matches the question."), mode: "local_search" };
  const local = (): ChatTurn => ({
    id: nextId(), role: "assistant", mode: "local_search",
    text: t("Closest passages in your documents (local search · not AI)"),
    citations: found.slice(0, SHOWN_LOCAL).map(toCitation),
  });
  const post = ctx.post;
  if (!post || ctx.signal.aborted) return local();
  const variables = pack.schema.variables.flatMap((v) => (v.type === "num" ? [{ id: v.id, label: v.label, unit: v.unit ?? null, min: v.range[0], max: v.range[1] }] : []))
    .slice(0, MAX_VARIABLES);
  const body = {
    question: q,
    history: ctx.history.slice(-6).map((h) => ({ role: h.role, text: h.text })),
    snippets: found.map((s) => ({ docId: s.docId, docName: s.docName, ...(s.page !== undefined ? { page: s.page } : {}), ...(s.row !== undefined ? { row: s.row } : {}), text: s.text })),
    variables,
  };
  try {
    const res = await withTimeout(ctx.signal, (s) => post("chat", body, s));
    const valid = validateAi(res, found);
    if (valid) return { id: nextId(), role: "assistant", mode: "ai", text: valid.text, citations: valid.citations };
  } catch { /* falls back to the local search below */ }
  return local();
}

export async function routeQuestion(q: string, ctx: ChatContext): Promise<ChatTurn> {
  const question = q.trim();
  if (isPredictionQuestion(question)) {
    const e = await evidenceTurn(question, ctx);
    const guard = t("Prometeo compares conditions with the evidence; it does not predict outcomes. Here is what the documents cover:");
    return { ...e, mode: "guard", text: e.mode === "ai" || e.mode === "local_stat" ? `${guard} ${e.text}` : guard };
  }
  if (SET_COMMAND.test(question)) {
    const unavailable = (): ChatTurn => ({ id: nextId(), role: "assistant", mode: "error", text: t("The question service is unavailable. Use the scenario controls above.") });
    try {
      let next: Scenario | { unsupported: string };
      if (ctx.isCustomCorpus) next = interpretLocalQuestion(question, ctx.pack);
      else if (ctx.post) {
        const post = ctx.post;
        next = parseAsk(await withTimeout(ctx.signal, (s) => post("ask", { question, schema: originalPack(ctx.pack).schema }, s)), ctx.pack);
      } else return unavailable();
      if ("unsupported" in next) return { id: nextId(), role: "assistant", mode: "error", text: t(next.unsupported) };
      return { id: nextId(), role: "assistant", mode: "case_change", text: t("Proposed change to the case. It is not applied until you confirm it."), proposal: next };
    } catch {
      return unavailable();
    }
  }
  return evidenceTurn(question, ctx);
}

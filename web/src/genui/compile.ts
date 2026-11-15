/** Purpose -> dashboard modules, deterministic. The local compiler always runs; a remote layout only replaces it when valid. */
import type { Pack } from "../engine";
import { aliasesOf, parseQueryParts } from "../ingest/localAsk";
import { MAX_MODULES } from "./types";
import type { DashboardSpec, ModuleSpec, VariableScore } from "./types";
import { moduleCaption, moduleTitle, validateModules } from "./validate";
import type { ModuleCore } from "./validate";

const INTENT = {
  distribution: /\b(distribution|range|spread|histogram)\b|distribuci[oó]n|rango/i,
  scatter: /\b(relation|relationship|correlat\w*|vs|versus|compare|comparison|relate)\b|relaci[oó]n|comparar|correlaci[oó]n/i,
  coverage: /\b(gaps?|coverage|missing|not studied|scarce)\b|huecos|brechas|cobertura|faltan?/i,
  papers: /\b(papers?|studies|study|sources?|relevant|articles?)\b|estudios|art[ií]culos|clave/i,
  summary: /\b(summary|summaries|summari[sz]e|overview)\b|resumen|resumir/i,
};

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Known {
  id: string;
  label: string;
  numeric: boolean;
  score: number;
  rank: number;
}

/** Scored variables that exist in the pack, in score order. The pack decides the type. */
function knownVariables(pack: Pack, scores: VariableScore[]): Known[] {
  const byId = new Map((pack.schema?.variables ?? []).map((v) => [v.id, v]));
  const out: Known[] = [];
  for (const s of scores) {
    const v = byId.get(s.id);
    if (!v) continue;
    out.push({ id: v.id, label: v.label || s.label, numeric: v.type === "num", score: s.score, rank: out.length });
  }
  return out;
}

/** Variables the purpose names by label, id or alias, in score order. */
function mentionedVariables(purpose: string, pack: Pack, known: Known[]): Known[] {
  const plain = stripAccents(purpose);
  const hit = (a: string) => {
    if (a.length < 2) return false;
    const re = new RegExp(`(?:^|[^\\p{L}\\d_])${escapeRegex(a)}(?=$|[^\\p{L}\\d_])`, "iu");
    return re.test(purpose) || re.test(plain);
  };
  const byId = new Map((pack.schema?.variables ?? []).map((v) => [v.id, v]));
  return known.filter((k) => {
    const v = byId.get(k.id);
    if (!v) return false;
    const tokens = stripAccents(k.label.toLowerCase()).split(/[^\p{L}\d]+/u).filter((t) => t.length >= 4);
    return aliasesOf(v).some(hit) || tokens.some(hit);
  });
}

function titleFrom(purpose: string): string {
  const first = purpose.trim().split(/(?<=[.!?])\s+/)[0]?.replace(/\s+/g, " ") ?? "";
  if (!first) return "Overview of the uploaded documents";
  return first.length <= 90 ? first : `${first.slice(0, 87).trimEnd()}...`;
}

function suggestedQuestions(known: Known[]): string[] {
  const nums = known.filter((k) => k.numeric);
  const a = nums[0] ?? known[0];
  if (!a) return [];
  const b = nums[1] ?? nums.find((k) => k.id !== a.id) ?? known.find((k) => k.id !== a.id);
  const c = known.find((k) => k.id !== a.id && k.id !== b?.id) ?? b ?? a;
  const qs = [`What is the maximum ${a.label}?`, `Which documents report ${c.label}?`, `Where are the gaps for ${(b ?? a).label}?`];
  if (b) qs.push(`How does ${a.label} relate to ${b.label}?`);
  return qs;
}

function coreKey(m: ModuleCore): string {
  return JSON.stringify(m);
}

function localCores(purpose: string, pack: Pack, known: Known[]): ModuleCore[] {
  const nums = known.filter((k) => k.numeric);
  const mentioned = mentionedVariables(purpose, pack, known);
  const mentionedNums = mentioned.filter((k) => k.numeric);
  const answers: ModuleCore[] = [];
  const rest: ModuleCore[] = [];

  const parts = parseQueryParts(purpose, pack);
  if (parts && known.some((k) => k.id === parts.variable)) {
    answers.push("stat" in parts
      ? { type: "answer_stat", variable: parts.variable, stat: parts.stat }
      : { type: "answer_filter", variable: parts.variable, op: parts.op, bounds: parts.bounds });
  }
  if (INTENT.distribution.test(purpose)) {
    for (const k of (mentionedNums.length ? mentionedNums : nums).slice(0, 2)) rest.push({ type: "distribution", variable: k.id });
  }
  if (INTENT.scatter.test(purpose)) {
    const pair = [...mentionedNums, ...nums.filter((k) => !mentionedNums.some((m) => m.id === k.id))].slice(0, 2);
    if (pair.length === 2) rest.push({ type: "scatter", x: pair[0].id, y: pair[1].id });
  }
  if (INTENT.coverage.test(purpose) && known.length) {
    const ids = [...mentioned, ...known.filter((k) => !mentioned.some((m) => m.id === k.id))].slice(0, 8).map((k) => k.id);
    rest.push({ type: "coverage_matrix", variables: ids });
  }
  if (INTENT.papers.test(purpose)) rest.push({ type: "key_papers", limit: 5 });
  if (INTENT.summary.test(purpose)) rest.push({ type: "doc_summaries" });

  if (!answers.length && !rest.length) {
    rest.push({ type: "key_papers", limit: 5 });
    if (known.length) rest.push({ type: "coverage_matrix", variables: known.slice(0, 8).map((k) => k.id) });
    if (nums[0]) rest.push({ type: "distribution", variable: nums[0].id });
  }
  const seen = new Set<string>();
  return [...answers, ...rest].filter((m) => {
    const k = coreKey(m);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function finalize(cores: ModuleCore[], pack: Pack, origin: "local" | "ai"): ModuleSpec[] {
  const withScores = [...cores.filter((m) => m.type !== "variable_scores").slice(0, MAX_MODULES - 1), { type: "variable_scores", limit: 20 } as ModuleCore];
  return withScores.map((m, i) => ({ ...m, id: `m${i + 1}`, title: moduleTitle(m, pack), caption: moduleCaption(m, pack), origin }) as ModuleSpec);
}

/**
 * Builds the dashboard that answers the purpose. Local and deterministic; `remote` (the reply of /design v2)
 * is used only when at least one of its modules passes validation. Values are never taken from the reply.
 */
export function compileDashboard(purpose: string, pack: Pack, scores: VariableScore[], remote?: unknown): DashboardSpec {
  const known = knownVariables(pack, scores);
  const base = { purpose, title: titleFrom(purpose), suggestedQuestions: suggestedQuestions(known) };
  let dropped: DashboardSpec["dropped"] = [];

  const rawModules = remote && typeof remote === "object" && !Array.isArray(remote) ? (remote as { modules?: unknown }).modules : undefined;
  if (Array.isArray(rawModules)) {
    const v = validateModules(rawModules, pack);
    dropped = v.dropped;
    if (v.modules.length) {
      const kept = v.modules.map((m) => m as ModuleSpec);
      const scoresModule = kept.find((m) => m.type === "variable_scores");
      const ordered = [...kept.filter((m) => m.type !== "variable_scores").slice(0, MAX_MODULES - 1), scoresModule ?? ({ type: "variable_scores", limit: 20 } as unknown as ModuleSpec)];
      const modules = ordered.map((m, i) => {
        const core = m as unknown as ModuleCore;
        const isNew = m === ordered[ordered.length - 1] && !scoresModule;
        return { ...m, id: `m${i + 1}`, title: isNew ? moduleTitle(core, pack) : m.title, caption: isNew ? moduleCaption(core, pack) : m.caption, origin: isNew ? "local" : "ai" } as ModuleSpec;
      });
      return { ...base, modules, dropped, origin: "ai" };
    }
  }
  return { ...base, modules: finalize(localCores(purpose, pack, known), pack, "local"), dropped, origin: "local" };
}

/** Four purposes the user can pick, built from the labels of the highest-scored variables. */
export function suggestPurposes(scores: VariableScore[]): string[] {
  const a = scores[0]?.label;
  const b = scores.find((s) => s.label !== a)?.label;
  if (!a) return ["Give an overview of what each document reports"];
  if (!b) return [`What is the maximum ${a} reported, and which documents report it?`, `Show the distribution of ${a} and where evidence is missing`];
  return [
    `Compare the documents on ${a} and ${b} and show where evidence is missing`,
    `What is the maximum ${a} reported, and which documents report it?`,
    `Show the distribution of ${a} and how it relates to ${b}`,
    `Which documents are most relevant to ${b}, and what does each one report?`,
  ];
}


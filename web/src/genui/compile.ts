/** Purpose -> dashboard modules, deterministic. The local compiler always runs; a remote layout only replaces it when valid. */
import type { Pack } from "../engine";
import { aliasesOf, parseQueryParts } from "../ingest/localAsk";
import { askedBlocks, blockOrder, sectionOf, spanOf } from "./layout";
import { MAX_MODULES } from "./types";
import type { BlockId, DashboardSpec, ModuleSpec, VariableScore } from "./types";
import { moduleCaption, moduleTitle, validateModules } from "./validate";
import type { ModuleCore } from "./validate";

const INTENT = {
  distribution: /\b(distribution|range|spread|histogram|quartiles?|median)\b|distribuci[oó]n|rango|cuartil(es)?|mediana/i,
  scatter: /\b(relation|relationship|correlat\w*|vs|versus|compare|comparison|relate)\b|relaci[oó]n|comparar|correlaci[oó]n/i,
  breakdown: /\b(breakdown|categor(y|ies)|split|grouped|per group|by group)\b|desglose|categor[ií]as?|agrupad[oa]s?/i,
  coverage: /\b(gaps?|coverage|missing|not studied|scarce|completeness|incomplete)\b|huecos|brechas|cobertura|faltan?|completitud/i,
  papers: /\b(papers?|studies|study|sources?|relevant|articles?)\b|estudios|art[ií]culos|clave/i,
  summary: /\b(summary|summaries|summari[sz]e|overview)\b|resumen|resumir/i,
  list: /\b(list|top|rank(ed|ing)?|extremes?)\b|\blistar?\b|extremos/i,
  lowest: /\b(lowest|smallest|least|bottom)\b|m[aá]s baj[oa]s?|menores/i,
  case: /\b(my|our) (case|scenario|conditions?|design|setup)\b|\bwhat if\b|\bmi (caso|escenario|dise[ñn]o)\b|\bnuestro (caso|escenario)\b/i,
};

/** Block that each intent of the purpose asks for. The first mention of a block decides its place on the page. */
const BLOCK_OF_INTENT: [keyof typeof INTENT, BlockId][] = [
  ["distribution", "patterns"],
  ["scatter", "patterns"],
  ["breakdown", "patterns"],
  ["coverage", "coverage"],
  ["papers", "sources"],
  ["summary", "sources"],
  ["case", "case"],
];

/** Blocks the purpose asks for, in the order it names them. */
function askedByPurpose(purpose: string): BlockId[] {
  const positions: Partial<Record<BlockId, number>> = {};
  for (const [intent, block] of BLOCK_OF_INTENT) {
    const at = INTENT[intent].exec(purpose)?.index;
    if (at !== undefined && (positions[block] === undefined || at < positions[block]!)) positions[block] = at;
  }
  return askedBlocks(positions);
}

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

const PLACEMENT = new Set(["id", "title", "caption", "origin", "section", "span"]);

/** The fields that make two modules the same, whoever built them and wherever they are placed. */
function coreKey(m: object): string {
  return JSON.stringify(Object.entries(m).filter(([k]) => !PLACEMENT.has(k)).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Items of `first`, then the items of `rest` that are not in it. */
function merge(first: Known[], rest: Known[]): Known[] {
  return [...first, ...rest.filter((k) => !first.some((m) => m.id === k.id))];
}

/** Numeric variables the key figures show: the ones the purpose names, or else the highest scored. */
function figureVariables(purpose: string, pack: Pack, known: Known[]): string[] {
  const nums = known.filter((k) => k.numeric);
  const named = mentionedVariables(purpose, pack, known).filter((k) => k.numeric);
  return (named.length ? named : nums).slice(0, 4).map((k) => k.id);
}

interface Planned {
  core: ModuleCore;
  tier: 0 | 1;
}

/**
 * Modules the purpose asks for. Every intent gives one main form (tier 0) and may add a second form of the same
 * evidence (tier 1). `asked` is empty when the purpose names no intent; `fallback` is the overview shown then.
 */
function localPlan(purpose: string, pack: Pack, known: Known[]): { figures: ModuleCore | null; asked: Planned[]; fallback: ModuleCore[] } {
  const nums = known.filter((k) => k.numeric);
  const cats = known.filter((k) => !k.numeric);
  const mentioned = mentionedVariables(purpose, pack, known);
  const mentionedNums = mentioned.filter((k) => k.numeric);
  const mentionedCats = mentioned.filter((k) => !k.numeric);
  const plan: Planned[] = [];
  const add = (core: ModuleCore, tier: 0 | 1 = 0) => {
    const key = coreKey(core);
    if (!plan.some((p) => coreKey(p.core) === key)) plan.push({ core, tier });
  };
  const columnsFor = (sort: string) => merge(mentioned, known).filter((k) => k.id !== sort).slice(0, 3).map((k) => k.id);

  const parts = parseQueryParts(purpose, pack);
  if (parts && known.some((k) => k.id === parts.variable)) {
    if ("stat" in parts) {
      add({ type: "answer_stat", variable: parts.variable, stat: parts.stat });
      if (parts.stat === "max" || parts.stat === "min") {
        add({ type: "records_table", sort: parts.variable, order: parts.stat === "max" ? "desc" : "asc", columns: columnsFor(parts.variable), limit: 8 }, 1);
      }
    } else {
      add({ type: "answer_filter", variable: parts.variable, op: parts.op, bounds: parts.bounds });
    }
  }
  if (INTENT.list.test(purpose)) {
    const v = mentionedNums[0] ?? nums[0];
    if (v && !plan.some((p) => p.core.type === "records_table")) {
      add({ type: "records_table", sort: v.id, order: INTENT.lowest.test(purpose) ? "asc" : "desc", columns: columnsFor(v.id), limit: 8 });
    }
  }
  if (INTENT.distribution.test(purpose)) {
    (mentionedNums.length ? mentionedNums : nums).slice(0, 2).forEach((k, i) => add({ type: "distribution", variable: k.id }, i === 0 ? 0 : 1));
    const box = merge(mentionedNums, nums).slice(0, 6);
    if (box.length >= 2) add({ type: "box_summary", variables: box.map((k) => k.id) }, 1);
  }
  if (INTENT.scatter.test(purpose)) {
    const pair = merge(mentionedNums, nums).slice(0, 2);
    if (pair.length === 2) add({ type: "scatter", x: pair[0].id, y: pair[1].id });
    if (pair[0]) {
      const by = mentionedCats[0]?.id;
      add(by ? { type: "group_ranges", variable: pair[0].id, by } : { type: "group_ranges", variable: pair[0].id }, pair.length === 2 ? 1 : 0);
    }
  }
  const split = mentionedCats.length ? mentionedCats : INTENT.breakdown.test(purpose) ? cats : [];
  if (split.length) {
    add({ type: "category_bars", variable: split[0].id });
    const other = split[1] ?? mentionedNums[0] ?? (INTENT.breakdown.test(purpose) ? nums[0] : undefined);
    if (other) add({ type: "cross_tab", row: split[0].id, column: other.id }, 1);
  }
  if (INTENT.coverage.test(purpose) && known.length) {
    const ids = merge(mentioned, known).slice(0, 8).map((k) => k.id);
    // One source document makes a one-row matrix: there the share of records is the main form and goes first.
    const matrix: ModuleCore = { type: "coverage_matrix", variables: ids };
    const shares: ModuleCore = { type: "completeness", variables: ids };
    const [main, second] = pack.studies.length < 2 ? [shares, matrix] : [matrix, shares];
    add(main);
    add(second, 1);
  }
  if (INTENT.papers.test(purpose)) add({ type: "key_papers", limit: 5 });
  if (INTENT.summary.test(purpose)) add({ type: "doc_summaries" });

  const fallback: ModuleCore[] = [];
  if (nums[0]) fallback.push({ type: "distribution", variable: nums[0].id });
  if (cats[0]) fallback.push({ type: "category_bars", variable: cats[0].id });
  if (known.length) fallback.push({ type: "coverage_matrix", variables: known.slice(0, 8).map((k) => k.id) });
  fallback.push({ type: "key_papers", limit: 5 });

  const figures = figureVariables(purpose, pack, known);
  return { figures: figures.length ? { type: "key_figures", variables: figures } : null, asked: plan, fallback };
}

/** The planned modules that fit in `room`, in their planned order. The second forms are dropped first. */
function fit(plan: Planned[], room: number): ModuleCore[] {
  if (plan.length <= room) return plan.map((p) => p.core);
  const keep = new Set([...plan].sort((a, b) => a.tier - b.tier).slice(0, Math.max(0, room)));
  return plan.filter((p) => keep.has(p)).map((p) => p.core);
}

/** A module built by the local rules, with the template title and caption and the layout defaults of its type. */
function localModule(core: ModuleCore, pack: Pack): Omit<ModuleSpec, "id"> {
  return { ...core, title: moduleTitle(core, pack), caption: moduleCaption(core, pack), origin: "local", section: sectionOf(core), span: spanOf(core) } as Omit<ModuleSpec, "id">;
}

const SCORES: ModuleCore = { type: "variable_scores", limit: 20 };

/** Types that summarise a list of variables or of documents: a second one on the page repeats the first. */
const ONCE: ReadonlySet<ModuleSpec["type"]> = new Set<ModuleSpec["type"]>(["coverage_matrix", "completeness", "box_summary", "key_papers", "doc_summaries"]);

const number = (modules: Omit<ModuleSpec, "id">[]): ModuleSpec[] => modules.map((m, i) => ({ ...m, id: `m${i + 1}` }) as ModuleSpec);

/**
 * Builds the dashboard that answers the purpose. Local and deterministic; `remote` (the reply of /design v2)
 * is used only when at least one of its modules passes validation. Values are never taken from the reply.
 * The page keeps a base structure in both cases: key figures first, the modules the rules derive from the purpose
 * (after the ones of the reply, without repeating them), and the ranking of variables last.
 */
export function compileDashboard(purpose: string, pack: Pack, scores: VariableScore[], remote?: unknown): DashboardSpec {
  const known = knownVariables(pack, scores);
  const base = { purpose, title: titleFrom(purpose), suggestedQuestions: suggestedQuestions(known) };
  const plan = localPlan(purpose, pack, known);
  const figures = plan.figures ? [localModule(plan.figures, pack)] : [];
  let dropped: DashboardSpec["dropped"] = [];

  const reply = remote && typeof remote === "object" && !Array.isArray(remote) ? (remote as { modules?: unknown; sections?: unknown }) : undefined;
  if (Array.isArray(reply?.modules)) {
    const v = validateModules(reply.modules, pack);
    dropped = v.dropped;
    if (v.modules.length) {
      const scoresModule = v.modules.find((m) => m.type === "variable_scores");
      const chosen: Omit<ModuleSpec, "id">[] = v.modules.filter((m) => m.type !== "variable_scores").slice(0, MAX_MODULES - 2);
      const head = chosen.some((m) => m.type === "key_figures") ? [] : figures;
      const taken = new Set(chosen.map(coreKey));
      const types = new Set(chosen.map((m) => m.type));
      const missing = plan.asked.filter((p) => !taken.has(coreKey(p.core)) && !(ONCE.has(p.core.type) && types.has(p.core.type)));
      const rules = fit(missing, MAX_MODULES - 1 - head.length - chosen.length).map((core) => localModule(core, pack));
      const order = Array.isArray(reply.sections) && reply.sections.length ? blockOrder(reply.sections) : blockOrder(askedByPurpose(purpose));
      return { ...base, modules: number([...head, ...chosen, ...rules, scoresModule ?? localModule(SCORES, pack)]), dropped, origin: "ai", order };
    }
  }
  const cores = plan.asked.length ? fit(plan.asked, MAX_MODULES - 1 - figures.length) : plan.fallback;
  const modules = number([...figures, ...cores.map((core) => localModule(core, pack)), localModule(SCORES, pack)]);
  return { ...base, modules, dropped, origin: "local", order: blockOrder(askedByPurpose(purpose)) };
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


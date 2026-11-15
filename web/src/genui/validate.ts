/** Validation of module specs from any generator, local or AI. Pure: no DOM, no network. */
import type { NumVariable, Pack } from "../engine";
import { MODULE_TYPES } from "./types";
import type { DashboardSpec, ModuleSpec, ModuleType } from "./types";

const MAX_TEXT = 160;

/** A module without the fields every module shares (id, title, caption, origin). */
export type ModuleCore = ModuleSpec extends infer M ? (M extends ModuleSpec ? Omit<M, "id" | "title" | "caption" | "origin"> : never) : never;

function varOf(pack: Pack, id: string) {
  return (pack.schema?.variables ?? []).find((v) => v.id === id);
}

function labelOf(pack: Pack, id: string): string {
  return varOf(pack, id)?.label ?? id;
}

function unitOf(pack: Pack, id: string): string | null {
  const v = varOf(pack, id);
  return v && v.type === "num" ? ((v as NumVariable).unit ?? null) : null;
}

/** Number of records of the pack that report a value for the variable. */
export function recordCount(pack: Pack, id: string): number {
  return pack.records.filter((r) => r.values[id] !== undefined).length;
}

const STAT_WORD = { max: "Maximum", min: "Minimum", mean: "Mean" } as const;
const OP_WORD = { "<": "below", ">": "above", "<=": "at most", ">=": "at least", between: "between" } as const;

/** English title template with real labels and units. */
export function moduleTitle(m: ModuleCore, pack: Pack): string {
  switch (m.type) {
    case "answer_stat":
      return m.stat === "count" ? `Count of records for ${labelOf(pack, m.variable)}` : `${STAT_WORD[m.stat]} of ${labelOf(pack, m.variable)}`;
    case "answer_filter": {
      const u = unitOf(pack, m.variable);
      const b = m.op === "between" ? `${m.bounds[0]} and ${m.bounds[1]}` : `${m.bounds[0]}`;
      return `Records with ${labelOf(pack, m.variable)} ${OP_WORD[m.op]} ${b}${u ? ` ${u}` : ""}`;
    }
    case "distribution": {
      const u = unitOf(pack, m.variable);
      return `Distribution of ${labelOf(pack, m.variable)}${u ? ` (${u})` : ""}`;
    }
    case "scatter":
      return `${labelOf(pack, m.y)} against ${labelOf(pack, m.x)}`;
    case "coverage_matrix":
      return `Coverage of the ${m.variables.length} most relevant variables across documents`;
    case "key_papers":
      return "Most relevant documents for the purpose";
    case "doc_summaries":
      return "What each document reports";
    case "variable_scores":
      return "Variables ranked by relevance";
  }
}

/** English caption template that says how the values are computed. */
export function moduleCaption(m: ModuleCore, pack: Pack): string {
  switch (m.type) {
    case "answer_stat":
    case "answer_filter":
      return `Computed from ${recordCount(pack, m.variable)} records of the uploaded documents`;
    case "distribution":
      return `Counts of the ${recordCount(pack, m.variable)} records of the uploaded documents that report ${labelOf(pack, m.variable)}`;
    case "scatter":
      return "Each point is a record of the uploaded documents that reports both variables";
    case "coverage_matrix":
      return "A cell is marked when the document cites the variable, with the page or row; computed from the uploaded documents";
    case "key_papers":
      return "Documents ranked by the variables they share with the purpose; computed locally from the uploaded documents";
    case "doc_summaries":
      return "Template summary built from the text and the detected variables of each document";
    case "variable_scores":
      return "Score is a weighted sum of coverage, frequency, position, purpose match and measurability";
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string";

/** Text of a title or caption: the fallback when missing, undefined when invalid. */
function text(x: unknown, fallback: string): string | undefined {
  if (x === undefined || x === null || x === "") return fallback;
  if (!isStr(x)) return undefined;
  const s = x.trim();
  if (!s) return fallback;
  return s.length > MAX_TEXT ? undefined : s;
}

/** Returns the core of a valid module or the reason it is invalid. */
function checkCore(r: Record<string, unknown>, pack: Pack): ModuleCore | string {
  const type = r.type;
  if (!isStr(type) || !(MODULE_TYPES as string[]).includes(type)) return `unknown module type "${String(type).slice(0, 40)}"`;
  const num = (id: unknown): string | null => {
    if (!isStr(id)) return "variable is missing";
    const v = varOf(pack, id);
    if (!v) return `variable "${id.slice(0, 40)}" is not in the pack`;
    if (v.type !== "num") return `variable "${id}" is not numeric`;
    return null;
  };
  const known = (id: unknown): string | null => {
    if (!isStr(id)) return "variable is missing";
    return varOf(pack, id) ? null : `variable "${id.slice(0, 40)}" is not in the pack`;
  };
  switch (type as ModuleType) {
    case "answer_stat": {
      const e = num(r.variable);
      if (e) return e;
      if (!["max", "min", "mean", "count"].includes(r.stat as string)) return "stat must be max, min, mean or count";
      return { type: "answer_stat", variable: r.variable as string, stat: r.stat as "max" };
    }
    case "answer_filter": {
      const e = num(r.variable);
      if (e) return e;
      if (!["<", ">", "<=", ">=", "between"].includes(r.op as string)) return "invalid comparison operator";
      const b = r.bounds;
      if (!Array.isArray(b) || !b.every((x) => typeof x === "number" && Number.isFinite(x))) return "bounds must be finite numbers";
      if (r.op === "between") {
        if (b.length !== 2 || b[0] > b[1]) return "between needs two ordered bounds";
      } else if (b.length !== 1) return "this operator needs exactly one bound";
      return { type: "answer_filter", variable: r.variable as string, op: r.op as "<", bounds: b as number[] };
    }
    case "distribution": {
      const e = num(r.variable);
      return e ?? { type: "distribution", variable: r.variable as string };
    }
    case "scatter": {
      const e = num(r.x) ?? num(r.y);
      if (e) return e;
      if (r.x === r.y) return "scatter needs two different variables";
      return { type: "scatter", x: r.x as string, y: r.y as string };
    }
    case "coverage_matrix": {
      const vs = r.variables;
      if (!Array.isArray(vs) || vs.length === 0) return "coverage_matrix needs at least one variable";
      for (const id of vs) {
        const e = known(id);
        if (e) return e;
      }
      return { type: "coverage_matrix", variables: [...new Set(vs as string[])] };
    }
    case "key_papers":
    case "variable_scores": {
      const l = r.limit;
      if (typeof l !== "number" || !Number.isInteger(l) || l < 1 || l > 20) return "limit must be an integer from 1 to 20";
      return { type, limit: l } as ModuleCore;
    }
    case "doc_summaries":
      return { type: "doc_summaries" };
  }
}

/**
 * Validates module specs from any generator. Invalid modules never throw: they go to `dropped`
 * with their reason and a console warning. Accepts an array or an object with a `modules` array.
 */
export function validateModules(raw: unknown, pack: Pack): { modules: ModuleSpec[]; dropped: DashboardSpec["dropped"] } {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.modules) ? raw.modules : null;
  const modules: ModuleSpec[] = [];
  const dropped: DashboardSpec["dropped"] = [];
  const drop = (module: unknown, reason: string) => {
    dropped.push({ module, reason });
    console.warn(`[genui] module dropped: ${reason}`);
  };
  if (!list) {
    drop(raw, "modules is not an array");
    return { modules, dropped };
  }
  const seen = new Set<string>();
  list.forEach((m, i) => {
    if (!isObj(m)) return drop(m, "module is not an object");
    const core = checkCore(m, pack);
    if (typeof core === "string") return drop(m, core);
    const id = isStr(m.id) && m.id.trim() ? m.id.trim() : `m${i + 1}`;
    if (seen.has(id)) return drop(m, `duplicate id "${id.slice(0, 40)}"`);
    const title = text(m.title, moduleTitle(core, pack));
    if (title === undefined) return drop(m, `title must be text of at most ${MAX_TEXT} characters`);
    const caption = text(m.caption, moduleCaption(core, pack));
    if (caption === undefined) return drop(m, `caption must be text of at most ${MAX_TEXT} characters`);
    seen.add(id);
    modules.push({ ...core, id, title, caption, origin: "ai" } as ModuleSpec);
  });
  return { modules, dropped };
}

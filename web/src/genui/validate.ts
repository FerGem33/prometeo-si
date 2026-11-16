/** Validation of module specs from any generator, local or AI. Pure: no DOM, no network. */
import type { NumVariable, Pack } from "../engine";
import { isSection, sectionOf, spanOf } from "./layout";
import { MODULE_TYPES } from "./types";
import type { DashboardSpec, ModuleSpec, ModuleType } from "./types";

const MAX_TEXT = 160;
const MAX_KEY_FIGURES = 4;
const MAX_BOX_VARIABLES = 8;
const MAX_COMPLETENESS_VARIABLES = 12;
const MAX_TABLE_COLUMNS = 4;

/** A module without the fields every module shares (id, title, caption, origin, section, span). */
export type ModuleCore = ModuleSpec extends infer M ? (M extends ModuleSpec ? Omit<M, "id" | "title" | "caption" | "origin" | "section" | "span"> : never) : never;

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
    case "key_figures":
      return "Key figures of the uploaded documents";
    case "category_bars":
      return `Records by ${labelOf(pack, m.variable)}`;
    case "group_ranges": {
      const u = unitOf(pack, m.variable);
      return `${labelOf(pack, m.variable)}${u ? ` (${u})` : ""} by ${m.by ? labelOf(pack, m.by) : "document"}`;
    }
    case "box_summary":
      return `Quartiles of ${m.variables.length === 1 ? labelOf(pack, m.variables[0]) : `${m.variables.length} numeric variables`}`;
    case "cross_tab":
      return `Records by ${labelOf(pack, m.row)} and ${labelOf(pack, m.column)}`;
    case "completeness":
      return `Share of the records that report each of ${m.variables.length} variables`;
    case "records_table": {
      const u = unitOf(pack, m.sort);
      return `Records with the ${m.order === "desc" ? "highest" : "lowest"} ${labelOf(pack, m.sort)}${u ? ` (${u})` : ""}`;
    }
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
    case "key_figures":
      return "Lowest and highest tested value of each variable over the records of the uploaded documents; each value opens its record";
    case "category_bars":
      return `Counts of the ${recordCount(pack, m.variable)} records of the uploaded documents that report ${labelOf(pack, m.variable)}`;
    case "group_ranges":
      return `Line: lowest to highest tested value in the group; mark: median of the records. Computed from ${recordCount(pack, m.variable)} records`;
    case "box_summary":
      return "Minimum, quartiles and maximum of the record midpoints; each row has its own scale";
    case "cross_tab":
      return "Number of records in each combination of the two variables; the last column and row count the records that report only one";
    case "completeness":
      return `Records that give a value for the variable, out of the ${pack.records.length} records of the uploaded documents`;
    case "records_table":
      return `The ${m.limit} records at that end of the ${recordCount(pack, m.sort)} that report the variable; each row opens its source`;
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
  const cat = (id: unknown): string | null => {
    const e = known(id);
    if (e) return e;
    return varOf(pack, id as string)?.type === "cat" ? null : `variable "${id as string}" is not categorical`;
  };
  /** A list of distinct variable ids that all pass `check`, cut to `max`; or the reason it is invalid. */
  const list = (xs: unknown, check: (id: unknown) => string | null, max: number, allowEmpty = false): string[] | string => {
    if (!Array.isArray(xs) || (!allowEmpty && xs.length === 0)) return "the module needs at least one variable";
    for (const id of xs) {
      const e = check(id);
      if (e) return e;
    }
    return [...new Set(xs as string[])].slice(0, max);
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
    case "key_figures": {
      const vs = list(r.variables, num, MAX_KEY_FIGURES);
      return typeof vs === "string" ? vs : { type: "key_figures", variables: vs };
    }
    case "category_bars": {
      const e = cat(r.variable);
      return e ?? { type: "category_bars", variable: r.variable as string };
    }
    case "group_ranges": {
      const e = num(r.variable);
      if (e) return e;
      if (r.by === undefined || r.by === null || r.by === "") return { type: "group_ranges", variable: r.variable as string };
      const eb = cat(r.by);
      return eb ?? { type: "group_ranges", variable: r.variable as string, by: r.by as string };
    }
    case "box_summary": {
      const vs = list(r.variables, num, MAX_BOX_VARIABLES);
      return typeof vs === "string" ? vs : { type: "box_summary", variables: vs };
    }
    case "cross_tab": {
      const e = known(r.row) ?? known(r.column);
      if (e) return e;
      if (r.row === r.column) return "cross_tab needs two different variables";
      return { type: "cross_tab", row: r.row as string, column: r.column as string };
    }
    case "completeness": {
      const vs = list(r.variables, known, MAX_COMPLETENESS_VARIABLES);
      return typeof vs === "string" ? vs : { type: "completeness", variables: vs };
    }
    case "records_table": {
      const e = num(r.sort);
      if (e) return e;
      if (r.order !== "asc" && r.order !== "desc") return "order must be asc or desc";
      const l = r.limit;
      if (typeof l !== "number" || !Number.isInteger(l) || l < 1 || l > 20) return "limit must be an integer from 1 to 20";
      const cols = list(r.columns ?? [], known, MAX_TABLE_COLUMNS + 1, true);
      if (typeof cols === "string") return cols;
      return { type: "records_table", sort: r.sort as string, order: r.order, columns: cols.filter((c) => c !== r.sort).slice(0, MAX_TABLE_COLUMNS), limit: l };
    }
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
    // Layout hints are enumerations: an unknown section or width falls back to the default of the type.
    const section = sectionOf({ type: core.type, section: isSection(m.section) ? m.section : undefined });
    const span = spanOf({ type: core.type, span: m.span === "full" || m.span === "half" ? m.span : undefined });
    modules.push({ ...core, id, title, caption, origin: "ai", section, span } as ModuleSpec);
  });
  return { modules, dropped };
}

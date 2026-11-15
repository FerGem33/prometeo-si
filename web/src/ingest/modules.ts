/**
 * Purpose-driven interface modules (GenUI). A module is data, validated against a per-type schema;
 * the report draws it with a generic renderer registered for its type (components/modules/).
 * Adding a module type = one entry in MODULE_SCHEMAS + one renderer. The engine is not touched.
 */

export type ModuleType = "scenario_input" | "classification" | "key_papers" | "case_notes" | "free_chat";

export interface ModuleSpec {
  id: string;
  type: ModuleType;
  title: string;
  description: string;
  /** Variable ids the module works on (must exist in the evaluation). */
  variables: string[];
  /** key_papers: how many papers to list. */
  limit?: number;
}

type Check = (m: ModuleSpec) => string | null;

const needsVariables: Check = (m) => (m.variables.length ? null : "needs at least one variable");

/** One validator per type; an unknown type has no schema and is rejected. */
export const MODULE_SCHEMAS: Record<ModuleType, Check> = {
  scenario_input: needsVariables,
  classification: needsVariables,
  case_notes: needsVariables,
  key_papers: (m) => (m.limit === undefined || (Number.isInteger(m.limit) && m.limit >= 1 && m.limit <= 20) ? null : "limit must be an integer 1–20"),
  free_chat: () => null,
};

const text = (x: unknown, max: number) => (typeof x === "string" && x.trim() && x.length <= max ? x.trim() : null);

/** Validates untrusted module specs (local or /design). Invalid ones are dropped and reported, never thrown. */
export function validateModules(raw: unknown, variableIds: ReadonlySet<string>): { modules: ModuleSpec[]; rejected: string[] } {
  const modules: ModuleSpec[] = [];
  const rejected: string[] = [];
  if (!Array.isArray(raw)) return { modules, rejected: raw === undefined ? [] : ["modules is not a list"] };
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const type = o.type as ModuleType;
    const where = `module ${i + 1}${typeof o.type === "string" ? ` (${o.type})` : ""}`;
    if (!(typeof type === "string" && type in MODULE_SCHEMAS)) return void rejected.push(`${where}: unknown type`);
    const id = text(o.id, 60) ?? `${type}-${i + 1}`;
    const title = text(o.title, 120);
    const description = text(o.description, 600) ?? "";
    if (!title) return void rejected.push(`${where}: missing title`);
    if (seen.has(id)) return void rejected.push(`${where}: duplicate id`);
    const vars = Array.isArray(o.variables) ? o.variables.filter((v): v is string => typeof v === "string" && variableIds.has(v)) : [];
    const spec: ModuleSpec = { id, type, title, description, variables: [...new Set(vars)] };
    if (o.limit !== undefined) spec.limit = o.limit as number;
    const err = MODULE_SCHEMAS[type](spec);
    if (err) return void rejected.push(`${where}: ${err}`);
    seen.add(id);
    modules.push(spec);
  });
  return { modules, rejected };
}

// A purpose about one's own case (decide, assess, design…) gets the case modules; a survey-like purpose does not.
const CASE_CUES = /\b(my|our|own|decid\w*|decision\w*|assess\w*|evaluat\w*|design\w*|classif\w*|plan\w*|choos\w*|select\w*|safety|case|mi|mis|nuestr\w*|decidir|decisiones|evaluar|diseñ\w*|clasificar|caso|seguridad)\b/i;
const SURVEY_CUES = /\b(review|survey|overview|literature|state of the art|summar\w*|what is known|gaps?|revisi[oó]n|estado del arte|resum\w*|huecos?)\b/i;

/**
 * Deterministic module plan from the purpose and the selected variables (already ordered by score).
 * Texts are data of the blueprint, not of the components.
 */
export function generateModules(purpose: string, selected: { id: string; label: string }[]): ModuleSpec[] {
  const p = purpose.trim();
  const ids = selected.map((v) => v.id);
  const quoted = p ? `“${p.length > 160 ? p.slice(0, 157) + "…" : p}”` : "";
  const caseLike = !p || CASE_CUES.test(p) || !SURVEY_CUES.test(p);
  const out: ModuleSpec[] = [];
  if (caseLike && ids.length) {
    out.push({
      id: "case-input",
      type: "scenario_input",
      title: "Describe your case",
      description: `Conditions of the case behind the purpose ${quoted}. Only the variables selected in the wizard are offered; each field checks the unit and the range found in the documents.`.replace("purpose . ", "purpose. "),
      variables: ids,
    });
    out.push({
      id: "case-notes",
      type: "case_notes",
      title: "Describe the case in your own words",
      description: "Variables and values mentioned in the text are proposed for confirmation; nothing is applied until you confirm it.",
      variables: ids,
    });
    out.push({
      id: "case-class",
      type: "classification",
      title: "Classification of your case against the evidence",
      description: "Coverage of each variable by the documents, from A (studied) to D (not studied). The letter describes evidence coverage, not risk or a physical outcome.",
      variables: ids,
    });
  }
  out.push({
    id: "key-papers",
    type: "key_papers",
    title: caseLike ? "Key papers for your case" : "Key papers for the purpose",
    description: caseLike
      ? "Papers closest to the case, ordered by the engine, with the variables they share with it."
      : `Papers closest to the selected conditions for ${quoted || "the purpose"}, ordered by the engine.`,
    variables: ids,
    limit: 5,
  });
  out.push({
    id: "free-chat",
    type: "free_chat",
    title: "Ask the corpus",
    description: "Open questions about the uploaded documents and your case. Every figure comes from the records and cites its source.",
    variables: ids,
  });
  return out;
}

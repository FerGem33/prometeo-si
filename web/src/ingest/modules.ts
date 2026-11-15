import type { ExtractedVariable, ModuleSpec, ModuleType } from "./types";

/** Shared schema registry; rendering is registered separately from all engine logic. */
export const MODULE_SCHEMAS: Record<ModuleType, { title: string; description: string }> = {
  scenario_input: { title: "Describe your case", description: "Enter conditions for the selected variables. These are user inputs, not measurements from a source." },
  classification: { title: "Evidence coverage of your case", description: "Coverage describes the evidence in this corpus, never safety or a physical prediction." },
  key_papers: { title: "Relevant sources", description: "Source relevance is ordered by the comparison engine; summaries are cited templates." },
  case_notes: { title: "Case description", description: "Describe your case. Review every interpreted condition before applying it." },
  free_chat: { title: "Ask the corpus", description: "Answers use only this corpus, with source citations. Local answers are labeled explicitly." },
};

const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** Reject unknown types, fields, IDs and references. A bad module never disables the base report. */
export function validateModules(raw: unknown, variables: string[]): { modules: ModuleSpec[]; discarded: string[] } {
  const modules: ModuleSpec[] = [];
  const discarded: string[] = [];
  if (!Array.isArray(raw)) return { modules, discarded: ["Modules must be an array."] };
  const ids = new Set<string>();
  for (const [index, candidate] of raw.entries()) {
    if (!object(candidate) || Object.keys(candidate).some(k => !["id", "type", "title", "description", "variables"].includes(k)) ||
      typeof candidate.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(candidate.id) || ids.has(candidate.id) ||
      typeof candidate.type !== "string" || !Object.hasOwn(MODULE_SCHEMAS, candidate.type) ||
      typeof candidate.title !== "string" || !candidate.title.trim() || candidate.title.length > 200 ||
      typeof candidate.description !== "string" || candidate.description.length > 1000 ||
      !Array.isArray(candidate.variables) || !candidate.variables.every(v => typeof v === "string" && variables.includes(v)) ||
      (["scenario_input", "classification", "case_notes"].includes(candidate.type) && candidate.variables.length === 0) ||
      new Set(candidate.variables).size !== candidate.variables.length) {
      discarded.push(`Module ${index + 1} discarded: invalid schema, duplicate ID or unknown variable.`);
      continue;
    }
    ids.add(candidate.id);
    modules.push({ id: candidate.id, type: candidate.type as ModuleType, title: candidate.title.trim(),
      description: candidate.description, variables: candidate.variables as string[] });
  }
  return { modules, discarded };
}

/** Intent rules contain no corpus-specific variable names or scientific thresholds. */
export function compileModules(purpose: string, variables: ExtractedVariable[], compare = false): ModuleSpec[] {
  const selected = variables.filter(v => v.include).map(v => v.id);
  const caseIntent = compare || /\b(case|scenario|compar\w*|assess\w*|decis\w*|decid\w*|evalu\w*|safety|segur\w*|caso)\b/iu.test(purpose);
  const types: ModuleType[] = caseIntent && selected.length
    ? ["scenario_input", "case_notes", "classification", "key_papers", "free_chat"]
    : ["key_papers", "free_chat"];
  return types.map(type => ({ id: type, type, ...MODULE_SCHEMAS[type], variables: selected }));
}

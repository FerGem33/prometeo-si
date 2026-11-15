import { UNIT_GROUPS } from "../report/units";
import { getConversion } from "./buildPack";
import type { ExtractedVariable, UiBlueprint } from "./types";

export interface VariableGroupView {
  id: string;
  label: string;
  variables: ExtractedVariable[];
}

/** Case-insensitive match on label, id or unit. An empty query keeps everything. */
export function matchesVariable(v: ExtractedVariable, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [v.label, v.id, v.unit ?? ""].some((s) => s.toLowerCase().includes(q));
}

/**
 * Collapsible groups for step 3: the blueprint's thematic groups when the layout is "grouped",
 * otherwise one group per source document. Variables matching neither land in `otherLabel`.
 */
export function groupVariables(
  variables: ExtractedVariable[],
  blueprint: Pick<UiBlueprint, "variablesLayout" | "variableGroups">,
  query: string,
  otherLabel: string,
): VariableGroupView[] {
  const shown = variables.filter((v) => matchesVariable(v, query));
  const out: VariableGroupView[] = [];
  const placed = new Set<string>();
  if (blueprint.variablesLayout === "grouped" && blueprint.variableGroups.length > 0) {
    for (const g of blueprint.variableGroups) {
      const vs = shown.filter((v) => g.variables.includes(v.id) && !placed.has(v.id));
      vs.forEach((v) => placed.add(v.id));
      if (vs.length) out.push({ id: g.id, label: g.label, variables: vs });
    }
  } else {
    const byDoc = new Map<string, ExtractedVariable[]>();
    for (const v of shown) {
      const doc = v.citations?.[0]?.docName;
      if (!doc) continue;
      placed.add(v.id);
      byDoc.set(doc, [...(byDoc.get(doc) ?? []), v]);
    }
    for (const [doc, vs] of byDoc) out.push({ id: `doc:${doc}`, label: doc, variables: vs });
  }
  const rest = shown.filter((v) => !placed.has(v.id));
  if (rest.length) out.push({ id: "__other__", label: otherLabel, variables: rest });
  return out;
}

/** Units a value in `unit` can be shown in (display only), from the general unit list. */
export function compatibleUnits(unit: string | null): string[] {
  if (!unit) return [];
  const all = UNIT_GROUPS.flatMap((g) => g.units);
  return all.filter((u) => u !== unit && getConversion(unit, u) !== null);
}

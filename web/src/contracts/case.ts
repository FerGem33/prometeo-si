import type { Pack, Scenario } from "../engine";
import { applyConversion, getConversion } from "../ingest/buildPack";

export type CaseField = { value: string; unit?: string };
export type CaseValidation = { scenario: Scenario; errors: Record<string, string>; warnings: Record<string, string> };

/** Input validation only: evidence, classification and rankings remain owned by the engine. */
export function caseFromFields(pack: Pack, selected: string[], fields: Record<string, CaseField>): CaseValidation {
  const values: Scenario["values"] = {};
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  for (const id of selected) {
    const variable = pack.schema.variables.find(v => v.id === id);
    const field = fields[id];
    if (!variable || !field?.value.trim()) continue;
    if (variable.type === "cat") { values[id] = field.value.trim(); continue; }
    const conversion = field.unit && field.unit !== variable.unit ? getConversion(field.unit, variable.unit) : { factor: 1, offset: 0 };
    const numeric = conversion && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(field.value.trim())
      ? applyConversion(Number(field.value), conversion) : NaN;
    // A case outside the recorded range is valid input: classifying it as not covered is the point of the module.
    if (!Number.isFinite(numeric)) errors[id] = "Enter a finite number, using a compatible unit.";
    else {
      values[id] = numeric;
      if (numeric < variable.range[0] || numeric > variable.range[1]) warnings[id] = "Outside the range recorded in the corpus.";
    }
  }
  if (!Object.keys(values).length && !Object.keys(errors).length) errors.case = "Enter at least one condition for your case.";
  return { scenario: { values, active: selected.filter(id => values[id] !== undefined) }, errors, warnings };
}

/**
 * Proposes case values from a free-text description (case_notes module). Deterministic.
 * Proposals are never applied by this module: the user confirms or corrects each one.
 */
import { applyConversion, getConversion } from "./buildPack";
import { terms } from "./variableScore";

export interface CaseVariable {
  id: string;
  label: string;
  long?: string;
  type: "num" | "cat";
  unit?: string;
  categories?: string[];
}

export interface CaseFeature {
  variable: string;
  value: number | string;
  /** words of the description the value comes from */
  quote: string;
  /** unit as written, when it was converted to the unit of the variable */
  fromUnit?: string;
}

const NUMBER = /(-?\d+(?:[.,]\d+)?)\s*(%|[A-Za-z°µ][A-Za-z°µ/²³·0-9]*)?/g;
const sameUnit = (a: string, b: string) => a.replace(/\s|\./g, "").toLowerCase() === b.replace(/\s|\./g, "").toLowerCase();

export function extractCaseFeatures(text: string, vars: CaseVariable[]): CaseFeature[] {
  const out: CaseFeature[] = [];
  const taken = new Set<string>();
  const nums = vars.filter((v) => v.type === "num");
  const stems = new Map(nums.map((v) => [v.id, new Set(terms(`${v.label} ${v.long ?? ""} ${v.id}`))]));

  for (const m of text.matchAll(NUMBER)) {
    const raw = parseFloat(m[1].replace(",", "."));
    if (!Number.isFinite(raw)) continue;
    const unit = m[2]?.trim();
    const at = m.index ?? 0;
    const near = new Set(terms(text.slice(Math.max(0, at - 60), Math.min(text.length, at + m[0].length + 30))));
    const unitFits = (v: CaseVariable) => !!unit && !!v.unit && (sameUnit(unit, v.unit) || getConversion(unit, v.unit) !== null);
    // A written unit that contradicts the variable's unit rules it out; a matching unit counts more than a matching word.
    const ranked = nums
      .filter((v) => !taken.has(v.id) && !(unit && v.unit && !unitFits(v)))
      .map((v) => ({ v, named: [...stems.get(v.id)!].filter((s) => near.has(s)).length, unit: unitFits(v) ? 2 : 0 }))
      .filter((c) => c.named > 0 || c.unit > 0)
      .sort((a, b) => b.unit + b.named - (a.unit + a.named));
    const best = ranked[0];
    // A unit alone identifies a variable only when no other variable shares it.
    const v = best && (best.named > 0 || ranked.filter((c) => c.unit > 0).length === 1) ? best.v : undefined;
    if (!v) continue;
    const conv = unit && v.unit && !sameUnit(unit, v.unit) ? getConversion(unit, v.unit) : null;
    const value = Number(applyConversion(raw, conv).toPrecision(6));
    taken.add(v.id);
    out.push({ variable: v.id, value, quote: text.slice(Math.max(0, at - 40), at + m[0].length).trim(), ...(conv ? { fromUnit: unit } : {}) });
  }

  for (const v of vars) {
    if (v.type !== "cat" || taken.has(v.id)) continue;
    const hit = (v.categories ?? [])
      .filter((c) => c.length >= 3)
      .map((c) => ({ c, i: text.search(new RegExp(`(?<![A-Za-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`, "i")) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i)[0];
    if (!hit) continue;
    taken.add(v.id);
    out.push({ variable: v.id, value: hit.c, quote: text.slice(Math.max(0, hit.i - 40), hit.i + hit.c.length).trim() });
  }
  return out;
}

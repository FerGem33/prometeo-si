// Saved scenario variants and named parts. Browser-local only (report/storage.ts), one key per pack.
import type { EvidenceLevel, Finding, Lens, Pack, Scenario, VariableEvidence } from "../engine";
import { evidenceLevels, findings } from "../engine";
import { loadJson, newId, saveJson } from "./storage";
import { diffLevels, type LevelChange } from "./diff";

export type Part = { id: string; name: string; variables: string[] };
export type Variant = { id: string; name: string; scenario: Scenario; parts: Part[]; savedAt: string };

const key = (packId: string) => `variants:${packId}`;
export const DEFAULT_PART_NAME = "Scenario";

export function loadVariants(packId: string): Variant[] {
  const raw = loadJson<unknown>(key(packId), []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is Variant =>
      !!v && typeof v === "object" && typeof (v as Variant).id === "string" && typeof (v as Variant).name === "string" && !!(v as Variant).scenario && Array.isArray((v as Variant).parts),
  );
}

export function persistVariants(packId: string, list: Variant[]): boolean {
  return saveJson(key(packId), list);
}

export function defaultParts(scenario: Scenario): Part[] {
  return [{ id: "part-default", name: DEFAULT_PART_NAME, variables: [...scenario.active] }];
}

/** Every active variable ends up in exactly one part: inactive ones are dropped, new ones join the first part. */
export function reconcileParts(parts: Part[], scenario: Scenario): Part[] {
  if (!parts.length) return defaultParts(scenario);
  const seen = new Set<string>();
  const next = parts.map((p) => ({
    ...p,
    variables: p.variables.filter((v) => {
      if (!scenario.active.includes(v) || seen.has(v)) return false;
      seen.add(v);
      return true;
    }),
  }));
  const missing = scenario.active.filter((v) => !seen.has(v));
  if (missing.length) next[0] = { ...next[0], variables: [...next[0].variables, ...missing] };
  return next;
}

export function makeVariant(name: string, scenario: Scenario, parts: Part[], now = new Date()): Variant {
  return {
    id: newId("variant"),
    name: name.trim(),
    scenario: { values: { ...scenario.values }, active: [...scenario.active], ...(scenario.sigma ? { sigma: { ...scenario.sigma } } : {}) },
    parts: reconcileParts(parts, scenario).map((p) => ({ ...p, variables: [...p.variables] })),
    savedAt: now.toISOString(),
  };
}

/** Adds a variant (a same-name variant is replaced). ok=false when the browser refused the write. */
export function saveVariant(packId: string, v: Variant): { ok: boolean; list: Variant[] } {
  const list = [...loadVariants(packId).filter((x) => x.name !== v.name), v];
  return { ok: persistVariants(packId, list), list };
}

export function deleteVariant(packId: string, id: string): { ok: boolean; list: Variant[] } {
  const list = loadVariants(packId).filter((x) => x.id !== id);
  return { ok: persistVariants(packId, list), list };
}

export type PartSummary = { part: Part; levels: { variable: string; level: EvidenceLevel }[] };

/** Levels of each part's variables, in the order the engine returned them. No combined verdict is made. */
export function summarizeParts(parts: Part[], levels: VariableEvidence[]): PartSummary[] {
  return parts.map((part) => ({
    part,
    levels: levels.filter((l) => part.variables.includes(l.variable)).map((l) => ({ variable: l.variable, level: l.level })),
  }));
}

export type VariantComparison = {
  changes: LevelChange[];
  levelsA: VariableEvidence[];
  levelsB: VariableEvidence[];
  findingsA: Finding[];
  findingsB: Finding[];
};

export function compareVariants(pack: Pack, lens: Lens, a: Variant, b: Variant): VariantComparison {
  const levelsA = evidenceLevels(pack, lens, a.scenario);
  const levelsB = evidenceLevels(pack, lens, b.scenario);
  return {
    changes: diffLevels(levelsA, levelsB),
    levelsA,
    levelsB,
    findingsA: findings(pack, lens, a.scenario),
    findingsB: findings(pack, lens, b.scenario),
  };
}

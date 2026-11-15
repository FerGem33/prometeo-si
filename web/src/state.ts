import type { Lens, Pack, Scenario } from "./engine";

export type Axes = { x: string; y: string };
export type Stage = "cover" | "scenario" | "report" | "workspace";

/** #scenario and #report are explicit; a bare link that carries scenario parameters opens the report. */
export function stageFromUrl(hash: string, search: string): Stage {
  if (hash === "#scenario") return "scenario";
  if (hash === "#report") return "report";
  if (hash === "#workspace") return "workspace";
  return search.replace(/^\?/, "") ? "report" : "cover";
}

export function presetScenario(lens: Lens, id?: string): Scenario {
  const p = lens.presets.find((x) => x.id === (id ?? lens.default_preset)) ?? lens.presets[0];
  return { values: { ...p.values }, active: [...p.active] };
}

/** Scenario encoded in the query string: one parameter per variable id, e.g. ?o2=30&p=0.69&material=PMMA */
export function readUrl(pack: Pack, lens: Lens, search: string): { scenario: Scenario; axes: Axes } {
  const q = new URLSearchParams(search);
  const values: Scenario["values"] = {};
  const active: string[] = [];
  for (const v of pack.schema.variables) {
    const raw = q.get(v.id);
    if (raw === null || raw === "") continue;
    if (v.type === "num") {
      const x = Number(raw);
      if (!Number.isFinite(x)) continue;
      values[v.id] = Math.min(v.range[1], Math.max(v.range[0], x));
    } else values[v.id] = raw;
    if (v.type === "num" || v.role !== "partition") active.push(v.id);
  }
  const nums = pack.schema.variables.filter((v) => v.type === "num").map((v) => v.id);
  const ok = (id: string | null): id is string => !!id && nums.includes(id);
  const axes = {
    x: ok(q.get("x")) ? q.get("x")! : lens.default_axes[0],
    y: ok(q.get("y")) ? q.get("y")! : lens.default_axes[1],
  };
  return { scenario: active.length ? { values, active } : presetScenario(lens), axes };
}

export function writeUrl(lens: Lens, scenario: Scenario, axes: Axes): string {
  const q = new URLSearchParams();
  for (const id of scenario.active) {
    const x = scenario.values[id];
    if (x !== undefined && x !== "") q.set(id, String(x));
  }
  if (axes.x !== lens.default_axes[0]) q.set("x", axes.x);
  if (axes.y !== lens.default_axes[1]) q.set("y", axes.y);
  return "?" + q.toString();
}

export function matchingPreset(lens: Lens, s: Scenario): string {
  for (const p of lens.presets) {
    if (p.active.length !== s.active.length || !p.active.every((a) => s.active.includes(a))) continue;
    if (p.active.every((a) => p.values[a] === s.values[a])) return p.id;
  }
  return "";
}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evidenceLevels, type Lens, type Pack } from "../engine";
import { compileUiBlueprint } from "./blueprint";
import { validateModules } from "./modules";
import { interpretLocalQuestion } from "./localAsk";
import { scoreVariables, variablesFromPack } from "./relevance";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf8")) as Pack;
const lens = JSON.parse(readFileSync("public/demo/lens.json", "utf8")) as Lens;
const purpose = "Compare oxygen, pressure, material, flow and gravity for informed decisions.";

describe("purpose ranking and modules on the real PSI pack", () => {
  it("ranks stably with reasons, source rows and the known variables; drops unsourced proposals", () => {
    const variables = variablesFromPack(pack);
    const ranked = scoreVariables([...variables, { ...variables[0], id: "unsourced", citations: [] }], [], purpose, pack);
    expect(ranked.map(v => v.id)).toEqual(expect.arrayContaining(["o2", "p", "material", "flow", "g"]));
    expect(ranked.some(v => v.id === "unsourced")).toBe(false);
    expect(ranked).toEqual(scoreVariables([...variables].reverse(), [], purpose, pack));
    for (const variable of ranked) {
      expect(variable.score).toBeGreaterThanOrEqual(0);
      expect(variable.reasons?.length).toBeGreaterThan(0);
      expect(variable.citations.every(c => !!c.row || !!c.page)).toBe(true);
      expect(variable.scoreComponents).toBeDefined();
    }
  });

  it("preserves the scientific control vectors: proposing pressure is not finding pressure in solids", () => {
    const preset = lens.presets.find(p => p.id === "lunar_base")!;
    const levels = evidenceLevels(pack, lens, { values: preset.values, active: preset.active });
    expect(levels.find(l => l.variable === "p")?.level).toBe("not_studied");
    expect(levels.find(l => l.variable === "o2")?.level).toBe("near");
    const solids = pack.records.filter(r => r.kind === "test" && r.values.phase === "solid");
    expect(solids).toHaveLength(268);
    expect(solids.filter(r => r.values.p !== undefined)).toHaveLength(0);
    expect(Math.max(...solids.flatMap(r => Array.isArray(r.values.o2) ? [r.values.o2[1]] : []))).toBe(22.2);
  });

  it("compiles purpose-adapted modules and discards invalid JSON without losing the report", () => {
    const variables = variablesFromPack(pack);
    const bp = compileUiBlueprint(purpose, [], variables);
    expect(bp.purpose).toBe(purpose);
    expect(bp.modules?.map(m => m.type)).toEqual(["scenario_input", "case_notes", "classification", "key_papers", "free_chat"]);
    const summary = compileUiBlueprint("Summarize the corpus sources", [], variables);
    expect(summary.modules?.map(m => m.type)).toEqual(["key_papers", "free_chat"]);
    const invalid = { id: "bad", type: "script", title: "bad", variables: [] };
    expect(validateModules([invalid], variables.map(v => v.id)).modules).toEqual([]);
    const recovered = compileUiBlueprint(purpose, [], variables, [], { modules: [invalid] as never });
    expect(recovered.discardedModules).toHaveLength(1);
    expect(recovered.modules?.length).toBeGreaterThan(0);
    expect(recovered.sectionOrder.length).toBeGreaterThan(0);
    expect(validateModules([{ ...bp.modules![0], variables: ["unknown"] }], variables.map(v => v.id)).modules).toEqual([]);
    expect(validateModules([{ ...bp.modules![0], variables: [] }], variables.map(v => v.id)).modules).toEqual([]);
  });
  it("strict case-description parsing proposes actual preset values without clamping or applying them", () => {
    const preset = lens.presets.find(p => p.id === "lunar_base")!;
    const result = interpretLocalQuestion(`Pressure to ${preset.values.p} atm`, pack, true);
    expect("unsupported" in result).toBe(false);
    if (!("unsupported" in result)) expect(result.values.p).toBeCloseTo(Number(preset.values.p), 5);
    expect(preset.values.p).toBe(lens.presets.find(p => p.id === "lunar_base")!.values.p);
  });
  it("strict case-description parsing rejects an incompatible unit or outside-schema value", () => {
    const variable = pack.schema.variables.find(v => v.id === "p");
    if (variable?.type !== "num") throw new Error("Reference pressure schema missing");
    expect(interpretLocalQuestion(`Pressure to ${variable.range[1] + 1} atm`, pack, true)).toHaveProperty("unsupported");
    expect(interpretLocalQuestion(`Pressure to ${lens.presets[0].values.p} bananas`, pack, true)).toHaveProperty("unsupported");
  });
});

const external = process.env.PROMETEO_PUBLICATION_PATH;
describe.skipIf(!external)("purpose modules on the real reviewed second domain", () => {
  it("uses the other corpus labels and source provenance with the same compiler", () => {
    const other = JSON.parse(readFileSync(`${external}/pack.json`, "utf8")) as Pack;
    const variables = variablesFromPack(other);
    const ranked = scoreVariables(variables, [], other.meta.title, other);
    expect(ranked.length).toBeGreaterThan(0);
    expect(other.studies).toHaveLength(2);
    expect(other.records).toHaveLength(51);
    const blueprint = compileUiBlueprint(`Summarize ${other.meta.title}`, [], ranked);
    expect(blueprint.modules?.map(m => m.type)).toEqual(["key_papers", "free_chat"]);
    expect(blueprint.modules?.flatMap(m => m.variables).every(id => other.schema.variables.some(v => v.id === id))).toBe(true);
  });
});

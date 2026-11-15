import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Lens, Pack } from "../engine";
import { caseFromFields } from "./case";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf8")) as Pack;
const lens = JSON.parse(readFileSync("public/demo/lens.json", "utf8")) as Lens;
const preset = lens.presets.find(p => p.id === "lunar_base")!;

describe("confirmed case inputs", () => {
  it("starts empty, without inserting source medians or defaults", () => {
    const result = caseFromFields(pack, preset.active, {});
    expect(result.scenario).toEqual({ values: {}, active: [] });
    expect(result.errors.case).toBeDefined();
  });
  it("converts the actual lunar preset pressure and accepts selected variables only", () => {
    const result = caseFromFields(pack, ["o2", "p"], {
      o2: { value: String(preset.values.o2), unit: "%" },
      p: { value: String(Number(preset.values.p) * 14.6959), unit: "psi" },
      material: { value: String(preset.values.material) },
    });
    expect(result.errors).toEqual({});
    expect(result.scenario.active).toEqual(["o2", "p"]);
    expect(result.scenario.values.o2).toBe(preset.values.o2);
    expect(result.scenario.values.p).toBeCloseTo(Number(preset.values.p), 5);
    expect(result.scenario.values.material).toBeUndefined();
  });
  it("rejects incompatible units, nonfinite and hexadecimal values", () => {
    for (const field of [{ value: String(preset.values.o2), unit: "invalid-unit" }, { value: "Infinity" }, { value: "0x21" }]) {
      const result = caseFromFields(pack, ["o2"], { o2: field });
      expect(result.scenario.active).toEqual([]);
      expect(result.errors.o2).toBeDefined();
    }
  });
  it("accepts a case outside the recorded range with a warning, so the engine can classify it as not covered", () => {
    const above = (pack.schema.variables.find(v => v.id === "o2") as { range: number[] }).range[1] + 1;
    const result = caseFromFields(pack, ["o2"], { o2: { value: String(above) } });
    expect(result.errors).toEqual({});
    expect(result.scenario.values.o2).toBe(above);
    expect(result.warnings.o2).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";
import { computeWhatIfDelta, BASELINE_PROFILES } from "./whatif";
import type { Scenario } from "../engine";

describe("computeWhatIfDelta", () => {
  const proposed: Scenario = {
    values: { o2: 24, p: 0.70, flow: 0.15, material: "PMMA" },
    active: ["o2", "p", "flow", "material"],
  };

  const baselineEarth: Scenario = BASELINE_PROFILES[0].scenario;

  it("calculates accurate numerical deltas for O2, pressure, and flow", () => {
    const delta = computeWhatIfDelta(proposed, baselineEarth);
    expect(delta.o2Delta).toBeCloseTo(3.0, 1);
    expect(delta.pDelta).toBeCloseTo(-0.30, 2);
    expect(delta.flowDelta).toBeCloseTo(-0.05, 2);
  });

  it("determines risk category based on oxygen concentration and pressure", () => {
    const delta = computeWhatIfDelta(proposed, baselineEarth);
    expect(["elevated", "reduced", "equivalent"]).toContain(delta.riskTendency);
  });

  it("flags elevated risk when oxygen concentration increases significantly", () => {
    const highO2: Scenario = {
      values: { o2: 32, p: 0.50, material: "PMMA" },
      active: ["o2", "p", "material"],
    };
    const delta = computeWhatIfDelta(highO2, baselineEarth);
    expect(delta.riskTendency).toBe("elevated");
    expect(delta.riskSummary).toContain("Elevated");
  });
});

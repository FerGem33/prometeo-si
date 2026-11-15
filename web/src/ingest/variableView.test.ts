import { describe, expect, it } from "vitest";
import { compatibleUnits, groupVariables, matchesVariable } from "./variableView";
import type { ExtractedVariable } from "./types";

const v = (id: string, label: string, unit: string | null, docName?: string): ExtractedVariable => ({
  id,
  label,
  type: unit ? "numeric" : "categorical",
  unit,
  include: true,
  citations: docName ? [{ docId: docName, docName, kind: "table", quote: "q" }] : [],
});

const vars = [v("t", "Temperature", "K", "a.csv"), v("p", "Pressure", "kPa", "b.csv"), v("m", "Material", null)];

describe("variableView", () => {
  it("filters by label, id or unit", () => {
    expect(vars.filter((x) => matchesVariable(x, "kpa")).map((x) => x.id)).toEqual(["p"]);
    expect(vars.filter((x) => matchesVariable(x, "  ")).length).toBe(3);
  });

  it("groups by source document when the layout is not grouped", () => {
    const g = groupVariables(vars, { variablesLayout: "list", variableGroups: [] }, "", "Other");
    expect(g.map((x) => [x.label, x.variables.map((y) => y.id)])).toEqual([
      ["a.csv", ["t"]],
      ["b.csv", ["p"]],
      ["Other", ["m"]],
    ]);
  });

  it("uses thematic groups when the layout is grouped and drops empty groups after search", () => {
    const g = groupVariables(
      vars,
      { variablesLayout: "grouped", variableGroups: [{ id: "th", label: "Thermal", variables: ["t"] }, { id: "x", label: "X", variables: ["p"] }] },
      "temp",
      "Other",
    );
    expect(g.map((x) => x.id)).toEqual(["th"]);
  });

  it("offers convertible units only", () => {
    expect(compatibleUnits("K")).toEqual(expect.arrayContaining(["°C", "°F"]));
    expect(compatibleUnits("K")).not.toContain("kPa");
    expect(compatibleUnits("kPa")).toEqual(expect.arrayContaining(["atm", "psi"]));
    expect(compatibleUnits(null)).toEqual([]);
  });
});

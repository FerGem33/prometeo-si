// Vectors for the phase 2 functions, on the real pack. Expected values are derived from the vectors of
// golden.test.ts (guide 6.6 and 6.7) and were checked by hand against the source tables listed in each test.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { assess, diffAssessment, emphasis, explainRank, graph, partLevels, rank, similarity, evidenceLevels } from "./index";
import type { Lens, Pack, Scenario } from "./index";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf-8")) as Pack;
const lens = JSON.parse(readFileSync("public/demo/lens.json", "utf-8")) as Lens;
const preset = (id: string): Scenario => {
  const p = lens.presets.find((x) => x.id === id)!;
  return { values: { ...p.values }, active: [...p.active] };
};
const lunar = preset("lunar_base");

describe("graph", () => {
  const g = graph(pack, lens);
  const node = (id: string) => g.nodes.find((n) => n.id === id);
  const edgesOf = (id: string, kind: string) => g.edges.filter((e) => e.kind === kind && (e.source === id || e.target === id));
  test("one node per study; every edge joins existing nodes", () => {
    expect(g.nodes.filter((n) => n.kind === "study").length).toBe(24);
    const ids = new Set(g.nodes.map((n) => n.id));
    expect(g.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(g.nodes.length);
  });
  test("variable edges: the 6 studies with a pressure value (5 columns of guide 1.3 plus the PSI-23 table note); none is in the solid partition", () => {
    expect(edgesOf("variable:p", "variable").map((e) => e.source).sort()).toEqual(["study:PSI-10", "study:PSI-159", "study:PSI-23", "study:PSI-39", "study:PSI-68", "study:PSI-69"].sort());
    expect(node("variable:p")!.degree).toBe(6);
  });
  test("category node: PMMA links the 3 studies of the category_tested vector, with 91 records", () => {
    expect(edgesOf("category:material:PMMA", "category").map((e) => e.source).sort()).toEqual(["study:PSI-25", "study:PSI-26", "study:PSI-99"]);
    expect(node("category:material:PMMA")!.records).toBe(91);
  });
  test("a categorical value seen in one study is not a node", () => {
    expect(g.nodes.filter((n) => n.kind === "category").every((n) => n.degree >= 2)).toBe(true);
  });
  test("related edge declared by the repository record (PSI-25 ↔ PSI-26), undirected and not duplicated", () => {
    const rel = g.edges.filter((e) => e.kind === "related" && [e.source, e.target].sort().join() === "study:PSI-25,study:PSI-26");
    expect(rel.length).toBe(1);
  });
  test("attribute values are matched approximately: two spellings of one facility are one node", () => {
    expect(similarity("multi user droplet combustion appartatus", "multi user droplet combustion apparatus")).toBeGreaterThanOrEqual(0.9);
    const glovebox = g.nodes.filter((n) => n.kind === "attribute" && /glovebox/i.test(n.label));
    expect(glovebox.length).toBe(1);
    expect(edgesOf(glovebox[0].id, "attribute").map((e) => e.source)).toContain("study:PSI-25");
    expect(graph(pack).nodes.some((n) => n.kind === "attribute")).toBe(false); // no lens, no attribute edges
  });
  test("emphasis follows the ranking: the graded studies are the highlighted ones", () => {
    const em = emphasis(rank(pack, lunar));
    const lit = Object.values(em).filter((e) => e.weight > 0).map((e) => e.study).sort();
    expect(lit).toEqual(["PSI-25", "PSI-98", "PSI-99"]);
    expect(em["PSI-25"]).toMatchObject({ position: 1, grade: "C", distance: 1.56, weight: 1 });
    expect(em["PSI-69"].weight).toBe(0);
  });
});

describe("parts of the proposal", () => {
  test("lunar preset: the atmosphere is as weak as its weakest variable (pressure, never recorded); material is studied", () => {
    const parts = partLevels(lens, evidenceLevels(pack, lens, lunar));
    expect(parts.map((p) => [p.part, p.level, p.decidedBy])).toEqual([
      ["atmosphere", "not_studied", "p"],
      ["material", "studied", "material"],
    ]);
  });
  test("variables outside every part are grouped under part null", () => {
    const parts = partLevels({ ...lens, parts: [{ id: "a", label: "A", variables: ["o2"] }] }, evidenceLevels(pack, lens, lunar));
    expect(parts.map((p) => p.part)).toEqual(["a", null]);
    expect(parts[1].variables.map((v) => v.variable)).toEqual(["p", "material"]);
  });
});

describe("explainRank", () => {
  test("PSI-25 for the guide scenario: O2 contributes 7.8 / 5 = 1.56 from B1 (22.2 %); pressure and flow are not recorded", () => {
    const sc: Scenario = { values: { o2: 30, p: 0.69, flow: 5, material: "PMMA" }, active: ["o2", "p", "flow", "material"] };
    const x = explainRank(pack, sc, "PSI-25")!;
    expect(x.distance).toBe(1.56);
    expect(pack.records.find((r) => r.id === x.nearest)!.label).toBe("B1");
    expect(x.terms).toEqual([
      { variable: "o2", type: "num", value: 30, recordValue: [22.2, 22.2], status: "outside", gap: 7.8, contribution: 1.56, tested: [13.6, 22.2] },
      { variable: "p", type: "num", value: 0.69, recordValue: null, status: "not_recorded", contribution: 0, tested: undefined },
      { variable: "flow", type: "num", value: 5, recordValue: null, status: "not_recorded", contribution: 0, tested: undefined },
      { variable: "material", type: "cat", value: "PMMA", recordValue: "PMMA", status: "same", contribution: 0 },
    ]);
  });
  test("PSI-98: 1.66 (O2) and 1.5 (flow) combine to 2.24, plus the categorical penalty 2 = 4.24", () => {
    const sc: Scenario = { values: { o2: 30, p: 0.69, flow: 5, material: "PMMA" }, active: ["o2", "p", "flow", "material"] };
    const x = explainRank(pack, sc, "PSI-98")!;
    const c = Object.fromEntries(x.terms.map((t) => [t.variable, t.contribution]));
    expect(c).toEqual({ o2: 1.66, p: 0, flow: 1.5, material: 2 });
    expect(x.distance).toBe(4.24);
  });
  test("a study without comparable records has no nearest record; an unknown study is null", () => {
    expect(explainRank(pack, lunar, "PSI-69")).toMatchObject({ grade: "D", nearest: null, distance: null });
    expect(explainRank(pack, lunar, "nope")).toBeNull();
  });
});

describe("diffAssessment", () => {
  const a = assess(pack, lens, lunar);
  test("an assessment compared with itself is unchanged", () => {
    expect(diffAssessment(a, a).unchanged).toBe(true);
  });
  test("lowering O2 from 30 % to 21 %: the level goes up to studied, BASS-II goes from C to B, the above_tested finding disappears", () => {
    const b = assess(pack, lens, { ...lunar, values: { ...lunar.values, o2: 21 } });
    const d = diffAssessment(a, b);
    expect(d.values).toEqual([{ variable: "o2", from: 30, to: 21 }]);
    expect(d.levels).toEqual([{ variable: "o2", from: "near", to: "studied", direction: "up" }]);
    expect(d.parts).toEqual([]); // atmosphere stays not_studied: pressure still decides
    expect(d.grades.find((g) => g.study === "PSI-25")).toMatchObject({ from: "C", to: "B", direction: "up", distanceFrom: 1.56, distanceTo: 0 });
    expect(d.findings.removed.map((f) => f.id)).toContain("above_tested:o2");
    expect(d.findings.added.map((f) => f.id)).toContain("within_tested:o2");
  });
  test("dropping a variable is reported as removed, in both directions", () => {
    const b = assess(pack, lens, { values: { o2: 30, material: "PMMA" }, active: ["o2", "material"] });
    expect(diffAssessment(a, b).levels).toContainEqual({ variable: "p", from: "not_studied", to: null, direction: "removed" });
    expect(diffAssessment(b, a).levels).toContainEqual({ variable: "p", from: null, to: "not_studied", direction: "added" });
  });
});

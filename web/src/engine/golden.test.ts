// Golden vectors. The demo pack is the team's full reviewed corpus (pipeline/legacy), so the expected
// values are the ones fixed in PROMETEO_GUIA_DE_DESARROLLO.md sections 6.6 and 6.7 (computed by the
// earlier prototype on the same source tables) plus the known findings of AGENTS.md section 5.
// If a vector fails, the engine is wrong or the pack changed: investigate before touching the vector.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  closeness,
  corpusSummary,
  coverage,
  evidence,
  evidenceLevels,
  findings,
  gaps,
  partitionOf,
  pool,
  quantileEdges,
  rank,
} from "./index";
import type { Lens, Pack, Scenario } from "./index";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf-8")) as Pack;
const lens = JSON.parse(readFileSync("public/demo/lens.json", "utf-8")) as Lens;
const rec = (id: string) => pack.records.find((r) => r.id === id)!;

// Guide 6.6: active variables o2, p, flow, material (no g), default sigmas.
const sc: Scenario = { values: { o2: 30, p: 0.69, flow: 5, material: "PMMA" }, active: ["o2", "p", "flow", "material"] };

describe("pack (guide 1.3)", () => {
  test("size of the corpus", () => {
    expect(pack.studies.length).toBe(24);
    expect(pack.records.length).toBe(1986);
    expect(pack.records.filter((r) => r.kind === "test").length).toBe(1889);
    expect(pack.records.filter((r) => r.flags.length > 0).length).toBe(147);
  });
  test("comparable pool is the 268 individual tests of the scenario partition", () => {
    expect(partitionOf(pack, sc)).toEqual({ variable: "phase", value: "solid", via: "material" });
    expect(pool(pack, sc).length).toBe(268);
  });
});

describe("rank (guide 6.6)", () => {
  const r = rank(pack, sc);
  const by = (id: string) => r.find((x) => x.study === id)!;
  test("grades: A 0, B 0, C 4, D 20", () => {
    expect(evidence(pack, sc).counts).toEqual({ A: 0, B: 0, C: 4, D: 20 });
  });
  test("order of the four C", () => {
    expect(r.slice(0, 4).map((x) => x.study)).toEqual(["PSI-99", "PSI-98", "PSI-25", "PSI-100"]);
  });
  test("PSI-99: d = 2.18, both numeric variables outside the tested range", () => {
    expect(by("PSI-99").distance).toBe(2.18);
    expect(by("PSI-99").why).toContainEqual({ code: "out_of_range", variable: "o2", value: 30, tested: [21.5, 22.1] });
    expect(by("PSI-99").why).toContainEqual({ code: "out_of_range", variable: "flow", value: 5, tested: [20, 20] });
  });
  test("PSI-98: d = 4.24, category not tested", () => {
    expect(by("PSI-98").distance).toBe(4.24);
    expect(by("PSI-98").why).toContainEqual({ code: "category_untested", variable: "material", value: "PMMA" });
  });
  test("PSI-25: d = 1.56, nearest record B1 at row 2, two variables missing", () => {
    const x = by("PSI-25");
    expect(x.distance).toBe(1.56);
    expect(x.why).toContainEqual({ code: "out_of_range", variable: "o2", value: 30, tested: [13.6, 22.2] });
    expect(rec(x.nearest!).label).toBe("B1");
    expect(rec(x.nearest!).source.row).toBe(2);
    expect(x.missing).toEqual(["p", "flow"]);
  });
  test("full coverage: 0 tests", () => {
    expect(coverage(pack, sc).full).toBe(0);
  });
  test("best closeness of the corpus: 48, 0, 50, 100", () => {
    expect(corpusSummary(pack, sc).map((x) => x.best)).toEqual([48, 0, 50, 100]);
    expect(closeness(pack, sc)["PSI-25"].o2.score).toBe(48);
  });
  test("gap map of the scenario partition: no test has both axes", () => {
    const g = gaps(pack, { x: "o2", y: "p", partition: "solid", scenario: sc });
    expect([g.both, g.no_y, g.no_x, g.total]).toEqual([0, 268, 128, 268]);
    expect(g.nearestCell).toBeNull();
  });
});

describe("findings (guide 6.7)", () => {
  const f = findings(pack, lens, sc);
  const get = (id: string) => f.find((x) => x.id === id)!;
  test("overall evidence level", () => {
    expect(evidence(pack, sc).level).toBe("scarce");
  });
  test("above_tested: 7.8 points over the maximum of the pool (22.2), record B1 row 2", () => {
    const x = get("above_tested:o2");
    expect(x.level).toBe("attention");
    expect(x.params).toMatchObject({ delta: 7.8, max: 22.2, study: "BASS-II", record: "B1", row: 2 });
    expect(x.note?.source).toBeTruthy();
  });
  test("never_measured: 0 of 268 tests record the variable", () => {
    const x = get("never_measured:p");
    expect(x.level).toBe("attention");
    expect(x.metric.value).toBe("0 / 268");
  });
  test("below_tested: 15 under the minimum of the pool (20)", () => {
    const x = get("below_tested:flow");
    expect(x.level).toBe("caution");
    expect(x.params).toMatchObject({ delta: 15, min: 20, study: "SAFFIRE-I" });
  });
  test("tested_elsewhere: 36, 107 and 11 tests in other partitions", () => {
    expect(get("tested_elsewhere:o2").params.n).toBe(36);
    expect(get("tested_elsewhere:p").params.n).toBe(107);
    expect(get("tested_elsewhere:flow").params.n).toBe(11);
  });
  test("category_tested: 91 tests in 3 studies", () => {
    expect(get("category_tested:material").params).toMatchObject({ n: 91, studies: 3, names: "BASS-II, BASS, SAFFIRE-II" });
  });
  test("attention findings come first", () => {
    expect(f[0].level).toBe("attention");
    expect(f[f.length - 1].level).toBe("support");
  });
});

describe("evidence levels per variable (plan section 2, acceptance 2)", () => {
  // Preset of the lens: values come from the challenge statement, not from this test.
  const preset = lens.presets.find((p) => p.id === lens.default_preset)!;
  const lv = evidenceLevels(pack, lens, { values: preset.values, active: preset.active });
  const get = (id: string) => lv.find((x) => x.variable === id)!;
  test("o2 = 30: near, not covered; 7.8 above the tested maximum, backed by B1 row 2", () => {
    expect(get("o2")).toMatchObject({ level: "near", tested: [13.6, 22.2], gap: 7.8, recorded: 140, pool: 268 });
    expect(rec(get("o2").source!).label).toBe("B1");
  });
  test("pressure: not studied, 0 of 268 tests record it", () => {
    expect(get("p")).toMatchObject({ level: "not_studied", reason: "never_recorded", recorded: 0, pool: 268 });
  });
  test("material: studied, in 3 studies", () => {
    expect(get("material")).toMatchObject({ level: "studied", covering: 91 });
    expect(get("material").studies.length).toBe(3);
  });
  test("far outside the reach is not studied; a value seen in one study is scarce", () => {
    const far = evidenceLevels(pack, lens, { values: { o2: 100, material: "PMMA" }, active: ["o2", "material"] });
    expect(far[0]).toMatchObject({ level: "not_studied", reason: "outside_far" });
    const one = evidenceLevels(pack, lens, { values: { o2: 14, material: "PMMA" }, active: ["o2", "material"] });
    expect(one[0]).toMatchObject({ level: "scarce", reason: "few_studies" });
  });
});

describe("engine is generic", () => {
  test("a synthetic pack with other variables works", () => {
    const tiny: Pack = {
      contract: "prometeo.pack/1",
      meta: { id: "t", title: "t", created_at: "", source_note: "", stats: {} },
      schema: {
        variables: [
          { id: "dose", label: "Dose", unit: "mg", type: "num", sigma: 10, range: [0, 100] },
          { id: "group", label: "Group", type: "cat", role: "partition" },
        ],
        thresholds: { grade_a: 1, tolerance: 0.25, closeness_reach: 3 },
      },
      sources: [{ id: "s1", kind: "table", name: "a.csv", study: "S1" }],
      studies: ["S1", "S2"].map((id) => ({
        id,
        short: id,
        title: id,
        summary: { objective: null, subjects: [], conditions: null, variables: [], instruments: null },
        attributes: {},
        related: [],
        links: [],
        counts: { records: 1, publications: 0 },
      })),
      records: [
        { id: "a", study: "S1", label: "a", values: { dose: [10, 20], group: "x" }, kind: "test", source: { id: "s1", row: 2 }, confidence: "table", quote: null, flags: [] },
        { id: "b", study: "S2", label: "b", values: { dose: [15, 15], group: "x" }, kind: "test", source: { id: "s1", row: 3 }, confidence: "table", quote: null, flags: [] },
      ],
      claims: [],
    };
    const s: Scenario = { values: { dose: 15, group: "x" }, active: ["dose"] };
    expect(rank(tiny, s).map((x) => x.grade)).toEqual(["A", "A"]);
    expect(evidenceLevels(tiny, { ...lens, known_gaps: [] }, s)[0].level).toBe("studied");
    expect(quantileEdges([1, 2, 3, 4, 5, 6, 7, 8, 9]).length).toBeGreaterThan(2);
  });
});

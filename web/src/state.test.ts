import { describe, expect, it } from "vitest";
import { cleanExtras, readUrl, stageFromUrl, writeUrl } from "./state";
import type { Lens, Pack, Scenario } from "./engine";

describe("state URL encoding and restoration", () => {
  const minimalLens: Lens = {
    title: "Test Lens",
    presets: [],
    default_axes: [],
    evidence: { min_studies: 1 },
  };

  const minimalPack: Pack = {
    contract: "prometeo.pack/1",
    meta: {
      id: "test",
      title: "Test Pack",
      created_at: "2026-11-15",
      source_note: "Test",
      stats: {},
    },
    schema: {
      variables: [
        { id: "o2", label: "Oxygen", type: "num", unit: "%", sigma: 1, range: [0, 100] },
      ],
      thresholds: { grade_a: 1, tolerance: 0.1, closeness_reach: 3 },
    },
    sources: [],
    studies: [],
    records: [],
    claims: [],
  };

  it("writeUrl safely omits empty axes when default_axes is empty (e.g. < 2 numeric variables)", () => {
    const scenario: Scenario = {
      values: { o2: 30 },
      active: ["o2"],
    };
    const emptyAxes = { x: "", y: "" };

    const url = writeUrl(minimalLens, scenario, emptyAxes);
    expect(url).toBe("?o2=30");
    expect(url).not.toContain("x=");
    expect(url).not.toContain("y=");
  });

  it("writeUrl handles single numeric axis without writing undefined or empty y axis", () => {
    const singleAxisLens: Lens = {
      ...minimalLens,
      default_axes: ["o2"],
    };
    const scenario: Scenario = {
      values: { o2: 25 },
      active: ["o2"],
    };
    const axes = { x: "o2", y: "" };

    const url = writeUrl(singleAxisLens, scenario, axes);
    // Since x matches default_axes[0] and y is empty, neither axis is written
    expect(url).toBe("?o2=25");
    expect(url).not.toContain("x=");
    expect(url).not.toContain("y=");
  });

  it("readUrl parses query string variables against pack schema", () => {
    const res = readUrl(minimalPack, minimalLens, "?o2=42");
    expect(res.scenario.values.o2).toBe(42);
    expect(res.scenario.active).toEqual(["o2"]);
  });

  it("stageFromUrl maps hashes and fallback search params correctly", () => {
    expect(stageFromUrl("#scenario", "")).toBe("scenario");
    expect(stageFromUrl("#processing", "")).toBe("processing");
    expect(stageFromUrl("#report", "")).toBe("report");
    expect(stageFromUrl("#workspace", "")).toBe("workspace");
    expect(stageFromUrl("", "?o2=21")).toBe("report");
    expect(stageFromUrl("", "")).toBe("cover");
  });

  it("cleanExtras filters malformed objects", () => {
    const dirty = [
      null,
      "string",
      { id: "e1", name: "Extra 1", unit: "kg", value: "5" },
      { id: "e2" }, // missing name
      { id: 123, name: "Invalid ID" },
    ];
    const cleaned = cleanExtras(dirty);
    expect(cleaned).toEqual([
      { id: "e1", name: "Extra 1", unit: "kg", value: "5" },
    ]);
  });
});

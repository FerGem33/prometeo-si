// Boundary fixtures for criteria, not published scientific measurements.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { assessDataset } from "./dataset";
import type { DataRecord, Pack } from "./types";
import thresholds from "../contracts/ml-thresholds.json";
const realPack = JSON.parse(readFileSync("public/demo/pack.json", "utf8")) as Pack;
const candidate = { id: "boundary-fixture", inputs: ["input"],
  outcome: { type: "cat" as const, columns: { source: "target" } } };
function fixture(n: number, studies = 3): Pack {
  const records: DataRecord[] = Array.from({ length: n }, (_, i) => ({
    id: `fixture-${i}`, label: "Unit test fixture", study: `fixture-study-${i % studies}`,
    kind: "test", source: { id: "source", row: i+2 }, values: { input: [i, i] },
    confidence: "table", quote: null, flags: [], outcomes: { target: i % 2 ? "a" : "b" },
  }));
  return { ...realPack, schema: { ...realPack.schema, variables: [
    { id: "input", label: "Fixture input", type: "num", unit: "fixture", sigma: 1, range: [0, n] },
  ] }, records };
}
test("D4 boundary and study independence: many files do not replace studies", () => {
  expect(assessDataset(fixture(200), candidate, thresholds).verdict).toBe("ready_to_train");
  expect(assessDataset(fixture(199), candidate, thresholds).verdict).toBe("usable_with_cleaning");
  expect(assessDataset(fixture(50, 2), candidate, thresholds).verdict).toBe("usable_with_cleaning");
  expect(assessDataset(fixture(49, 2), candidate, thresholds).verdict).toBe("insufficient");
  expect(assessDataset(fixture(500, 1), candidate, thresholds).failed_criteria.cleaning).toContain("studies");
  expect(assessDataset(fixture(0), candidate, thresholds).verdict).toBe("external_reference_only");
});
test("missing inputs, unconverted units and minority classes block ready status", () => {
  const pack = fixture(200);
  pack.records[0].flags = ["unit_unconverted"];
  expect(assessDataset(pack, candidate, thresholds).failed_criteria.ready).toContain("unconverted");
  for (const r of pack.records.slice(0, 100)) r.values = {};
  expect(assessDataset(pack, candidate, thresholds).failed_criteria.cleaning).toContain("input_presence");
  for (const r of pack.records) r.outcomes = { target: "one class" };
  expect(assessDataset(pack, candidate, thresholds).failed_criteria.cleaning).toContain("classes");
});

test("exact cross-file candidates and invalid edited thresholds cannot yield a ready verdict", () => {
  const pack = fixture(200);
  pack.records.push(...pack.records.slice(0, 20).map(r => ({ ...r, id: r.id+"-duplicate", source: { id: "other", row: r.source.row } })));
  const selection = { ...candidate, outcome: { ...candidate.outcome, columns: { source: "target", other: "target" } } };
  const result = assessDataset(pack, selection, thresholds);
  expect(result.duplicate_candidates).toBe(40);
  expect(result.failed_criteria.cleaning).toContain("duplicates");
  expect(() => assessDataset(pack, selection, { ...thresholds, ready: { ...thresholds.ready, records: NaN } })).toThrow("criteria");
});

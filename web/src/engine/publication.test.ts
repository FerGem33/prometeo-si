// Optional local integration with a generated bundle kept outside Git.
// Unit-test fixtures are covered separately by pipeline/test_publish_bundle.py.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { evidence, evidenceLevels, findings, pool, rank } from "./index";
import type { Lens, Pack, Scenario } from "./index";

const folder = process.env.PROMETEO_PUBLICATION_PATH;
describe.skipIf(!folder)("reviewed local publication bundle", () => {
  test("runs the unchanged engine on sourced records and presets", () => {
    const pack = JSON.parse(readFileSync(join(folder!, "pack.json"), "utf-8")) as Pack;
    const lens = JSON.parse(readFileSync(join(folder!, "lens.json"), "utf-8")) as Lens;
    const preset = lens.presets[0];
    const scenario: Scenario = { values: preset.values, active: preset.active };
    expect(pack.records.length).toBeGreaterThan(0);
    expect(pool(pack, scenario).length).toBeGreaterThan(0);
    const ranking = rank(pack, scenario);
    expect(ranking).toHaveLength(pack.studies.length);
    expect(ranking.every(r => r.distance === null || Number.isFinite(r.distance))).toBe(true);
    expect(evidenceLevels(pack, lens, scenario)).toHaveLength(scenario.active.length);
    expect(evidence(pack, scenario).level).toBeTruthy();
    const validSources = new Set([...pack.records.map(r => r.id), ...pack.studies.map(s => s.id)]);
    expect(findings(pack, lens, scenario).every(f => f.sources.every(id => validSources.has(id)))).toBe(true);
  });
});

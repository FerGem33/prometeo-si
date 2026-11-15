import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { DataRecord, Lens, Pack } from "../engine";
import type { Mapping } from "../components/ctx";
import type { RecordDraft } from "../contracts/backend";
import { datasetCsv, datasetExport, exportableRecords } from "./dataset-export";

const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf-8"));
const pack = read("public/demo/pack.json") as Pack;
const mapping = read("public/demo/mapping.json") as Mapping;
const lens = read("public/demo/lens.json") as Lens;

describe("dataset export on the real published pack", () => {
  test("exports units, DOI and study groups, with versions identified honestly", async () => {
    const output = await datasetExport(pack, mapping, lens);
    expect(output.csv).toContain("p_min [atm]");
    expect(output.csv).toContain("group_id,doi");
    expect(output.datacard.records).toBe(pack.records.length);
    expect(output.datacard.sources).toHaveLength(pack.sources.length);
    expect(output.datacard.sources.every(s => s.doi.startsWith("10.") && s.license === null)).toBe(true);
    expect(output.datacard.versions).toEqual({ pack: null, mapping: null, lens: null });
    expect(output.datacard.identity.csv_sha256).toBe(createHash("sha256").update(output.csv, "utf8").digest("hex"));
    expect(output.datacard.assessment).toContain("not_assessed");
    expect(output.datacard.rejected_columns.length).toBeGreaterThan(0);
    expect(output.csv).toContain("outcome:");
  });

  test("correction originals and raw text stay separate; excluded and unverified records are omitted", () => {
    const base = pack.records.find(r => Array.isArray(r.values.o2))!;
    const changed: DataRecord & { corrections: NonNullable<RecordDraft["corrections"]> } = {
      ...base, values: { ...base.values, o2: [25, 25] }, corrections: { o2: { from: base.values.o2,
        by: "unit-test reviewer", at: "2026-11-15", reason: "Unit-test fixture; no real correction" } },
    };
    const excluded = { ...base, id: "excluded-fixture", excluded: true };
    const unverified = { ...base, id: "unverified-fixture", citations: { o2: { kind: "paper" as const,
      doc_id: "fixture", page: 1, quote: "Unit test", verified: false } } };
    const subset: Pack = { ...pack, records: [changed, excluded, unverified] };
    expect(exportableRecords(subset).map(r => r.id)).toEqual([base.id]);
    const csv = datasetCsv(subset);
    expect(csv).toContain("o2_original_min [%]");
    expect(csv).toContain("Unit-test fixture; no real correction");
    expect(csv).not.toContain("excluded-fixture");
    expect(csv).not.toContain("unverified-fixture");
    expect(changed.corrections.o2.from).toEqual(base.values.o2);
    // Selection is by published ID: callers cannot smuggle altered values in its argument.
    expect(datasetCsv(pack, [changed])).toBe(datasetCsv(pack, [base]));
  });

  test("never invents a DOI or evaluates an unapproved outcome", async () => {
    const broken = { ...pack, studies: pack.studies.map(s => ({ ...s, links: [] })) };
    expect(() => datasetCsv(broken)).toThrow("DOI");
    await expect(datasetExport(pack, mapping, lens, pack.records, [{ id: "unreviewed",
      inputs: ["o2"], outcome: { type: "cat", columns: { missing: "unapproved" } } }])).rejects.toThrow("approved outcome");
  });
});

const folder = process.env.PROMETEO_PUBLICATION_PATH;
describe.skipIf(!folder)("same export code on the second-domain bundle", () => {
  test("keeps study groups, explicit versions and unknown source licenses", async () => {
    const otherPack = read(join(folder!, "pack.json")) as Pack;
    const otherMapping = read(join(folder!, "mapping.json")) as Mapping;
    const otherLens = read(join(folder!, "lens.json")) as Lens;
    const output = await datasetExport(otherPack, otherMapping, otherLens);
    expect(output.datacard.records).toBe(otherPack.records.length);
    expect(output.datacard.versions.pack).toBe(1);
    expect(output.datacard.sources.every(s => s.license === null)).toBe(true);
    expect(output.csv).toContain("heat_flux_min [W/cm²]");
    for (const study of otherPack.studies) expect(output.csv).toContain(`,${study.id},${study.id},10.`);
  });
});

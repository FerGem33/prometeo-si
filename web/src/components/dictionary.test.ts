import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Pack } from "../engine";
import { dataDictionary, dataDictionaryMd, harmonizedCsv, harmonizedJson } from "./DossierModal";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf-8")) as Pack;

describe("data dictionary (real pack)", () => {
  const d = dataDictionary(pack);
  const header = harmonizedCsv(pack).replace(/^﻿/, "").split("\n")[0].split(",");

  it("describes every variable and only columns the CSV really has", () => {
    expect(d.variables.map((v) => v.id)).toEqual(pack.schema.variables.map((v) => v.id));
    for (const v of d.variables) for (const c of v.csv_columns) expect(header).toContain(c);
  });

  it("counts records per variable without exceeding the corpus", () => {
    expect(d.records).toBe(pack.records.length);
    for (const v of d.variables) expect(v.records_with_value).toBeLessThanOrEqual(d.records);
    // Known finding: no solid-fuel test records pressure, but other partitions do, so the count is positive and partial.
    const p = d.variables.find((v) => v.id === "p")!;
    expect(p.records_with_value).toBeGreaterThan(0);
    expect(p.records_with_value).toBeLessThan(d.records);
  });

  it("writes a Markdown table with one row per variable", () => {
    const md = dataDictionaryMd(pack);
    for (const v of d.variables) expect(md).toContain(`\`${v.csv_columns[0]}`);
  });

  it("exports the same records as JSON with their source file", () => {
    const j = JSON.parse(harmonizedJson(pack));
    expect(j.records).toHaveLength(pack.records.length);
    expect(j.records[0].source_file).toBeTruthy();
  });
});

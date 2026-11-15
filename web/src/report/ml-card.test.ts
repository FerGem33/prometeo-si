import { describe, expect, it } from "vitest";
import type { DataRecord } from "../engine/types";
import type { Mapping } from "../components/ctx";
import { summarizeOutcomes } from "./ml-card";

const record = (id: string, source: string, row: number, result?: string, input = "air"): DataRecord => ({
  id, study: "study-a", label: id, kind: "test", source: { id: source, row },
  confidence: "table", quote: null, flags: [], values: { input },
  outcomes: result === undefined ? {} : { "Result raw": result },
});

const mapping: Mapping = {
  tables: [
    { source: "file-a", constants: {}, columns: [
      { column: "Input", variable: "input", unit: "%", status: "approved" },
      { column: "Result raw", variable: null, unit: "s", role: "outcome", status: "approved" },
    ] },
    { source: "file-b", constants: {}, columns: [
      { column: "Result raw", variable: null, role: "outcome", status: "approved" },
      { column: "Ignored", variable: null, role: "outcome", status: "rejected" },
    ] },
  ], synonyms: {}, approved_by: "human", approved_at: "today",
};

describe("summarizeOutcomes", () => {
  it("keeps sources and outcome columns separate and counts missing values against all source rows", () => {
    const summaries = summarizeOutcomes([
      record("a1", "file-a", 2, "Yes"), record("a2", "file-a", 3),
      record("b1", "file-b", 2, "1"),
    ], mapping);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({ sourceId: "file-a", column: "Result raw", unit: "s", denominator: 2, missing: 1 });
    expect(summaries[0].values).toEqual([{ value: "Yes", records: [expect.objectContaining({ id: "a1" })] }]);
    expect(summaries[1]).toMatchObject({ sourceId: "file-b", denominator: 1, unit: null });
  });

  it("flags exact cross-source candidates without deleting records and counts mapped input completeness", () => {
    const summaries = summarizeOutcomes([
      record("a1", "file-a", 2, "Yes"), record("b1", "file-b", 8, "Yes"),
    ], mapping);
    expect(summaries.every((summary) => summary.duplicateCandidates.map((item) => item.id).includes("a1") || summary.duplicateCandidates.map((item) => item.id).includes("b1"))).toBe(true);
    expect(summaries[0].inputComplete).toBe(1);
    expect(summaries[0].inputTotal).toBe(1);
    expect(summaries[0].unitsSpecified).toBe(1);
  });

  it("does not report rejected outcomes or merge test and campaign records", () => {
    const campaign = { ...record("c1", "file-a", 4, "Yes"), kind: "campaign" as const };
    const summaries = summarizeOutcomes([record("a1", "file-a", 2, "Yes"), campaign], mapping);
    expect(summaries.map((summary) => summary.kind).sort()).toEqual(["campaign", "test"]);
    expect(summaries.every((summary) => summary.column !== "Ignored")).toBe(true);
  });
});

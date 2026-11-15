import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Pack } from "../engine";
import type { UploadedDoc } from "../ingest/types";
import { chunkDocs, retrieve } from "./retrieve";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf8")) as Pack;

describe("retrieve", () => {
  it("builds chunks from the pack studies and sources when there are no documents", () => {
    const chunks = chunkDocs([], pack);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.docId && c.docName && c.text)).toBe(true);
  });
  it("is deterministic and ranks relevant passages first", () => {
    const chunks = chunkDocs([], pack);
    const a = retrieve("soot inception limits", chunks, 5);
    const b = retrieve("soot inception limits", chunks, 5);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a[0].text.toLowerCase()).toContain("soot");
    expect(a.every((s) => s.score > 0)).toBe(true);
    for (let i = 1; i < a.length; i++) expect(a[i - 1].score).toBeGreaterThanOrEqual(a[i].score);
  });
  it("returns nothing when no term matches", () => {
    expect(retrieve("zzzzqqq", chunkDocs([], pack))).toEqual([]);
  });
  it("chunks papers with pages and tables with rows", () => {
    const doc = {
      id: "d1", name: "paper.pdf", kind: "paper", status: "done",
      paper: { pageCount: 2, pages: [{ page: 1, text: "First sentence here. Second sentence here." }, { page: 2, text: "Other page text." }], findings: [] },
    } as unknown as UploadedDoc;
    const tab = {
      id: "d2", name: "t.csv", kind: "table", status: "done",
      table: { headers: ["a", "b"], rows: [{ row: 2, values: ["1", "x"] }], columns: [] },
    } as unknown as UploadedDoc;
    const chunks = chunkDocs([doc, tab], pack);
    expect(chunks.filter((c) => c.docId === "d1").map((c) => c.page)).toEqual([1, 2]);
    expect(chunks.find((c) => c.docId === "d2")).toMatchObject({ row: 2, text: "a: 1; b: x" });
  });
});

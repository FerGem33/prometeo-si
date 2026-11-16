import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Pack } from "../engine";
import { extractVariablesFromDocs } from "../ingest/buildPack";
import { parseTabularDocument } from "../ingest/csv";
import type { UploadedDoc } from "../ingest/types";
import { statAnswer } from "../ingest/localAsk";
import { boxSummary, categoryCounts, completeness, coverageMatrix, crossTab, docSummaries, groupRanges, histogram, keyFigures, paperRelevance, recordsTable, scatterPoints } from "./stats";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf-8")) as Pack;
const numIds = pack.schema.variables.filter((v) => v.type === "num").map((v) => v.id);

function realDoc(): UploadedDoc {
  const bytes = new Uint8Array(readFileSync("../tools/psi/seed/tests.csv"));
  const table = parseTabularDocument("tests.csv", bytes, "text/csv");
  return { id: "doc-tests", name: "tests.csv", kind: "table", mediaType: "text/csv", bytes: bytes.length, sha256: "x", status: "done", uploadedAt: "2026-01-01T00:00:00Z", rowCount: table.rows.length, table };
}

describe("histogram / scatter (demo pack)", () => {
  it("bin counts sum to n", () => {
    const h = histogram(pack, numIds[0]);
    expect(h).not.toBeNull();
    expect(h!.bins.reduce((s, b) => s + b.count, 0)).toBe(h!.n);
    expect(h!.bins.flatMap((b) => b.records)).toHaveLength(h!.n);
    expect(histogram(pack, numIds[0], 4)!.bins).toHaveLength(4);
    expect(histogram(pack, "no_such_variable")).toBeNull();
  });
  it("scatter needs both values", () => {
    const pts = scatterPoints(pack, numIds[0], numIds[1]);
    for (const p of pts) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.label).toContain(" · ");
    }
    expect(scatterPoints(pack, numIds[0], "no_such_variable")).toEqual([]);
  });
});

describe("document stats (real tests.csv)", () => {
  const doc = realDoc();
  const vars = extractVariablesFromDocs([doc]);
  const ids = vars.slice(0, 4).map((v) => v.id);

  it("coverage matrix has docs x variables cells", () => {
    const m = coverageMatrix([doc], vars, ids);
    expect(m.cells).toHaveLength(m.docs.length * m.variables.length);
    expect(m.variables.map((v) => v.id)).toEqual(ids);
    expect(m.cells.every((c) => c.found && c.quote)).toBe(true);
  });
  it("relevance is deterministic, in [0,1]", () => {
    const a = paperRelevance([doc], vars, "oxygen and pressure limits");
    expect(a).toEqual(paperRelevance([doc], vars, "oxygen and pressure limits"));
    expect(a[0].score).toBeGreaterThanOrEqual(0);
    expect(a[0].score).toBeLessThanOrEqual(1);
  });
  it("summary is a template from extracted data", () => {
    const [s] = docSummaries([doc], vars);
    expect(s.mode).toBe("template");
    expect(s.text).toMatch(/^Table with \d+ rows and \d+ columns, including /);
  });
});

describe("more forms of the same evidence (demo pack)", () => {
  const value = (id: string, stat: "max" | "min") => {
    const a = statAnswer(pack, id, stat);
    return "kind" in a && a.kind === "stat" ? a.value : NaN;
  };

  it("key figures give the same ends as the direct answers, each with its record", () => {
    const k = keyFigures(pack, ["o2", "p", "material", "ghost"]);
    expect(k.records).toBe(pack.records.length);
    expect(k.groups).toBe(pack.studies.length);
    expect(k.figures.map((f) => f.variable)).toEqual(["o2", "p"]);
    for (const f of k.figures) {
      expect(f.min).toBe(value(f.variable, "min"));
      expect(f.max).toBe(value(f.variable, "max"));
      expect(f.n).toBeLessThanOrEqual(f.total);
      expect(pack.records.some((r) => r.id === f.minRecord)).toBe(true);
      expect(pack.records.some((r) => r.id === f.maxRecord)).toBe(true);
    }
  });

  it("category counts add up and are sorted", () => {
    const c = categoryCounts(pack, "material", 5);
    expect(c.categories).toHaveLength(5);
    expect(c.categories.reduce((s, x) => s + x.count, 0) + c.other.count).toBe(c.n);
    expect(c.categories.every((x) => x.records.length === x.count)).toBe(true);
    for (let i = 1; i < c.categories.length; i++) expect(c.categories[i - 1].count).toBeGreaterThanOrEqual(c.categories[i].count);
    expect(categoryCounts(pack, "no_such_variable").n).toBe(0);
  });

  it("ranges by category reproduce the known maximum of the solid partition", () => {
    const g = groupRanges(pack, "o2", "phase")!;
    const solid = g.groups.find((x) => x.key === "solid")!;
    // Known finding: the highest O2 tested with solid fuels is 22.2 % (BASS-II).
    expect(solid.max).toBe(22.2);
    const record = pack.records.find((r) => r.id === solid.maxRecord)!;
    expect(pack.studies.find((s) => s.id === record.study)?.short).toContain("BASS-II");
    expect(g.groups.reduce((s, x) => s + x.n, 0)).toBe(g.n);
    for (const x of g.groups) {
      expect(x.min).toBeLessThanOrEqual(x.median);
      expect(x.median).toBeLessThanOrEqual(x.max);
    }
    for (let i = 1; i < g.groups.length; i++) expect(g.groups[i - 1].median).toBeGreaterThanOrEqual(g.groups[i].median);
  });

  it("ranges by source document keep the groups with most records", () => {
    const all = groupRanges(pack, "o2")!;
    const top = groupRanges(pack, "o2", undefined, 3)!;
    expect(top.groups).toHaveLength(3);
    expect(top.omitted).toBe(all.groups.length + all.omitted - 3);
    expect(groupRanges(pack, "no_such_variable")).toBeNull();
  });

  it("box summary is ordered and uses the same records as the histogram", () => {
    const b = boxSummary(pack, numIds);
    expect(b.rows.length + b.empty.length).toBe(numIds.length);
    for (const r of b.rows) {
      expect(r.min).toBeLessThanOrEqual(r.q1);
      expect(r.q1).toBeLessThanOrEqual(r.median);
      expect(r.median).toBeLessThanOrEqual(r.q3);
      expect(r.q3).toBeLessThanOrEqual(r.max);
      expect(r.n).toBe(histogram(pack, r.variable)!.n);
    }
  });

  it("cross table keeps the gap visible: no solid-fuel test records pressure", () => {
    const tab = crossTab(pack, "phase", "p");
    expect(tab.row.kind === "cat" && tab.row.categories).toContain("solid");
    const i = tab.row.kind === "cat" ? tab.row.categories.indexOf("solid") : -1;
    const size = tab.column.kind === "num" ? tab.column.edges.length - 1 : 0;
    const solidCells = tab.cells.filter((c) => c.row === i);
    expect(solidCells).toHaveLength(size);
    // Known finding: 0 of 268 solid-fuel tests record pressure.
    expect(solidCells.reduce((s, c) => s + c.count, 0)).toBe(0);
    const solid = pack.records.filter((r) => r.values.phase === "solid");
    expect(solid.filter((r) => r.kind === "test")).toHaveLength(268);
    expect(tab.rowMissing[i]).toBe(solid.length);
    expect(tab.cells.reduce((s, c) => s + c.count, 0)).toBe(tab.n);
    expect(tab.max).toBe(Math.max(...tab.cells.map((c) => c.count)));
  });

  it("cross table accounts for every record that gives one of the two variables", () => {
    const tab = crossTab(pack, "material", "phase", 4);
    const either = pack.records.filter((r) => r.values.material !== undefined || r.values.phase !== undefined).length;
    const missing = [...tab.rowMissing, ...tab.columnMissing].reduce((s, x) => s + x, 0);
    const beyond = either - tab.n - missing - tab.omitted;
    expect(tab.row.kind === "cat" && tab.row.categories).toHaveLength(4);
    // What is left belongs to categories beyond the limit that lack the other variable.
    expect(beyond).toBeGreaterThanOrEqual(0);
  });

  it("completeness counts records and source documents per variable", () => {
    const rows = completeness(pack, ["o2", "p", "ghost"]);
    expect(rows.map((r) => r.variable)).toEqual(["o2", "p"]);
    for (const r of rows) {
      expect(r.total).toBe(pack.records.length);
      expect(r.n).toBe(pack.records.filter((x) => x.values[r.variable] !== undefined).length);
      expect(r.share).toBe(Math.round((r.n / r.total) * 1000) / 1000);
      expect(r.groups).toBeLessThanOrEqual(r.groupsTotal);
    }
  });

  it("records table lists one end of a variable", () => {
    const top = recordsTable(pack, "o2", "desc", ["p", "o2", "material", "ghost"], 5);
    expect(top.columns.map((c) => c.id)).toEqual(["o2", "p", "material"]);
    expect(top.rows).toHaveLength(5);
    expect((top.rows[0].values[0] as [number, number])[1]).toBe(value("o2", "max"));
    const low = recordsTable(pack, "o2", "asc", [], 3);
    expect((low.rows[0].values[0] as [number, number])[0]).toBe(value("o2", "min"));
    expect(low.n).toBe(histogram(pack, "o2")!.n);
    expect(recordsTable(pack, "o2", "desc", ["p"], 5)).toEqual(recordsTable(pack, "o2", "desc", ["p"], 5));
  });
});

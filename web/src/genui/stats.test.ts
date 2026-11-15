import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Pack } from "../engine";
import { extractVariablesFromDocs } from "../ingest/buildPack";
import { parseTabularDocument } from "../ingest/csv";
import type { UploadedDoc } from "../ingest/types";
import { coverageMatrix, docSummaries, histogram, paperRelevance, scatterPoints } from "./stats";

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

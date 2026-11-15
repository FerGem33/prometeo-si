import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractVariablesFromDocs } from "../ingest/buildPack";
import { parseTabularDocument } from "../ingest/csv";
import type { UploadedDoc } from "../ingest/types";
import { defaultSelection, scoreVariables, tokens } from "./score";
import { SCORE_WEIGHTS } from "./types";

function realDoc(): UploadedDoc {
  const bytes = new Uint8Array(readFileSync("../tools/psi/seed/tests.csv"));
  const table = parseTabularDocument("tests.csv", bytes, "text/csv");
  return {
    id: "doc-tests",
    name: "tests.csv",
    kind: "table",
    mediaType: "text/csv",
    bytes: bytes.length,
    sha256: "x",
    status: "done",
    uploadedAt: "2026-01-01T00:00:00Z",
    rowCount: table.rows.length,
    table,
  };
}

describe("tokens", () => {
  it("lowercases, strips accents, stopwords and plurals", () => {
    expect(tokens("The Presión and pressures of a Limits")).toEqual(["presion", "pressure", "limit"]);
  });
});

describe("scoreVariables (real tests.csv)", () => {
  const doc = realDoc();
  const vars = extractVariablesFromDocs([doc]);

  it("is deterministic and complete", () => {
    const a = scoreVariables([doc], vars, "oxygen and pressure limits");
    const b = scoreVariables([doc], vars, "oxygen and pressure limits");
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    for (const s of a) {
      expect(s.reasons.length).toBeGreaterThan(0);
      expect(s.citations.length).toBeGreaterThanOrEqual(1);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < a.length; i++) expect(a[i - 1].score).toBeGreaterThanOrEqual(a[i].score);
    expect(Object.values(SCORE_WEIGHTS).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 9);
  });

  it("puts oxygen and pressure variables in the top 5", () => {
    const top = scoreVariables([doc], vars, "oxygen and pressure limits").slice(0, 5).map((s) => s.id);
    expect(top.some((id) => id.startsWith("o2"))).toBe(true);
    expect(top.some((id) => id.startsWith("p_"))).toBe(true);
    expect(defaultSelection(scoreVariables([doc], vars, ""), 3)).toHaveLength(3);
  });

  it("excludes outcome columns and uncited variables", () => {
    const ids = scoreVariables([doc], [...vars, { id: "ghost", label: "Ghost", type: "numeric", unit: null, include: true, citations: [] }], "").map((s) => s.id);
    expect(ids).not.toContain("ghost");
    expect(ids).not.toContain("outcome");
  });
});

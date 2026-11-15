/**
 * End-to-end check of the purpose-driven flow without a browser, on real data:
 * upload (CSV from tools/psi/seed) -> deterministic variable ranking -> purpose -> dashboard modules
 * -> case with at most 10 variables -> engine results only once a value exists.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseTabularDocument } from "../ingest/csv";
import { buildPackFromDocs, extractVariablesFromDocs } from "../ingest/buildPack";
import type { UploadedDoc } from "../ingest/types";
import { evidenceLevels, rank } from "../engine";
import type { Lens } from "../engine";
import { scoreVariables, defaultSelection } from "./score";
import { compileDashboard } from "./compile";
import { validateModules } from "./validate";
import { caseToScenario, setValue, toggleVariable } from "./case";
import { MAX_CASE_VARIABLES, MAX_MODULES } from "./types";
import type { CaseState } from "./types";

const CSV = path.resolve(__dirname, "../../../tools/psi/seed/tests.csv");

function csvDoc(): UploadedDoc {
  const bytes = new Uint8Array(fs.readFileSync(CSV));
  const table = parseTabularDocument("tests.csv", bytes, "text/csv");
  return {
    id: "doc-seed-tests",
    name: "tests.csv",
    kind: "table",
    mediaType: "text/csv",
    bytes: bytes.byteLength,
    sha256: "seed",
    status: "done",
    uploadedAt: "2026-11-15T00:00:00.000Z",
    rowCount: table.rows.length,
    table,
  };
}

describe.skipIf(!fs.existsSync(CSV))("purpose-driven flow on the seed CSV", () => {
  const docs = [csvDoc()];
  const vars = extractVariablesFromDocs(docs).map((v) => ({ ...v, include: true }));
  const purpose = "What is the maximum oxygen tested and where are the gaps in pressure?";
  const built = buildPackFromDocs(docs, vars, { scope: "uploaded", title: "Seed" });
  const pack = built.pack;
  const packIds = new Set(pack.schema.variables.map((v) => v.id));
  const scores = scoreVariables(docs, vars, purpose).filter((s) => packIds.has(s.id));

  it("ranks variables deterministically with reasons and citations", () => {
    expect(scores.length).toBeGreaterThan(0);
    expect(scoreVariables(docs, vars, purpose).map((s) => s.id)).toEqual(scoreVariables(docs, vars, purpose).map((s) => s.id));
    for (const s of scores) {
      expect(s.reasons.length).toBeGreaterThan(0);
      expect(s.citations.length).toBeGreaterThan(0);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it("compiles a dashboard that answers the purpose and validates its own modules", () => {
    const dash = compileDashboard(purpose, pack, scores);
    expect(dash.modules.length).toBeGreaterThan(0);
    expect(dash.modules.length).toBeLessThanOrEqual(MAX_MODULES);
    const types = dash.modules.map((m) => m.type);
    expect(types).toContain("variable_scores");
    expect(types.some((t) => t === "answer_stat" || t === "coverage_matrix")).toBe(true);
    expect(validateModules(dash.modules, pack).dropped).toEqual([]);
  });

  it("limits the case to 10 variables and computes engine results only with a value", () => {
    let c: CaseState = { selected: defaultSelection(scores), values: {} };
    expect(caseToScenario(c)).toBeNull();
    const numeric = pack.schema.variables.filter((v) => v.type === "num");
    for (const v of pack.schema.variables) {
      const r = toggleVariable(c, v.id);
      if (c.selected.includes(v.id)) continue;
      if (c.selected.length >= MAX_CASE_VARIABLES) expect(r.error).toBe("limit");
      else c = r.next;
    }
    expect(c.selected.length).toBeLessThanOrEqual(MAX_CASE_VARIABLES);
    const first = numeric.find((v) => c.selected.includes(v.id));
    expect(first).toBeTruthy();
    if (!first || first.type !== "num") return;
    c = setValue(c, first.id, first.range[0]);
    const scenario = caseToScenario(c);
    expect(scenario?.active).toEqual([first.id]);
    const lens = { default_axes: [], evidence: { min_studies: 2 } } as unknown as Lens;
    expect(rank(pack, scenario!).length).toBeGreaterThan(0);
    expect(evidenceLevels(pack, lens, scenario!).length).toBeGreaterThan(0);
  });
});

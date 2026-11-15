import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Pack } from "../engine";
import { compileDashboard, suggestPurposes } from "./compile";
import { MAX_MODULES } from "./types";
import type { VariableScore } from "./types";

const pack = JSON.parse(readFileSync(new URL("../../public/demo/pack.json", import.meta.url), "utf8")) as Pack;

const scores: VariableScore[] = pack.schema.variables.map((v, i) => ({
  id: v.id,
  label: v.label,
  unit: v.type === "num" ? (v.unit ?? null) : null,
  type: v.type === "num" ? "numeric" : "categorical",
  score: Math.round((1 - i * 0.1) * 1000) / 1000,
  parts: { coverage: 1, frequency: 1, position: 0, purpose: 0, measurability: 1 },
  docCount: 1,
  mentions: { header: 1, finding: 0, text: 0 },
  reasons: [],
  citations: [{ docId: "d1", docName: "d1.csv", quote: "x" }] as unknown as VariableScore["citations"],
}));

const o2 = pack.schema.variables.find((v) => v.id === "o2")!;
const types = (d: ReturnType<typeof compileDashboard>) => d.modules.map((m) => m.type);

describe("compileDashboard", () => {
  it("maximum of a variable becomes answer_stat first", () => {
    const d = compileDashboard(`What is the maximum ${o2.label}?`, pack, scores);
    expect(d.modules[0]).toMatchObject({ type: "answer_stat", variable: "o2", stat: "max", origin: "local" });
    expect(d.modules[0].title).toBe(`Maximum of ${o2.label}`);
    expect(d.modules[0].caption).toMatch(/^Computed from \d+ records of the uploaded documents$/);
    expect(d.modules.at(-1)).toMatchObject({ type: "variable_scores", limit: 20 });
    expect(d.origin).toBe("local");
  });

  it("a threshold question becomes answer_filter", () => {
    const d = compileDashboard(`Which tests are above 21 % ${o2.label}?`, pack, scores);
    expect(d.modules[0]).toMatchObject({ type: "answer_filter", variable: "o2", op: ">", bounds: [21] });
  });

  it("gaps and coverage keywords give coverage_matrix, in English and Spanish", () => {
    for (const q of ["Where are the gaps?", "Donde estan los huecos y la cobertura?"]) {
      expect(types(compileDashboard(q, pack, scores))).toContain("coverage_matrix");
    }
    const cov = compileDashboard("Where are the gaps?", pack, scores).modules.find((m) => m.type === "coverage_matrix");
    expect(cov && cov.type === "coverage_matrix" && cov.variables.length).toBe(pack.schema.variables.length);
  });

  it("uses a default set without intent", () => {
    const d = compileDashboard("hello", pack, scores);
    expect(types(d)).toEqual(["key_papers", "coverage_matrix", "distribution", "variable_scores"]);
    expect(d.modules.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("ignores scored variables that are not in the pack", () => {
    const extra = [{ ...scores[0], id: "ghost", label: "Ghost" }, ...scores];
    const d = compileDashboard("hello", pack, extra);
    expect(JSON.stringify(d)).not.toContain("ghost");
  });

  it("caps modules at MAX_MODULES and still ends with variable_scores", () => {
    const q = "maximum o2, distribution, compare, gaps, studies, summary of Pressure and Flow";
    const d = compileDashboard(q, pack, scores);
    expect(d.modules.length).toBeLessThanOrEqual(MAX_MODULES);
    expect(d.modules.at(-1)?.type).toBe("variable_scores");
    expect(new Set(d.modules.map((m) => m.id)).size).toBe(d.modules.length);
  });

  it("builds title and suggested questions from real labels", () => {
    const d = compileDashboard("Compare things. Second sentence.", pack, scores);
    expect(d.title).toBe("Compare things.");
    expect(d.suggestedQuestions).toHaveLength(4);
    expect(d.suggestedQuestions[0]).toBe(`What is the maximum ${o2.label}?`);
    expect(compileDashboard("x".repeat(200), pack, scores).title.length).toBeLessThanOrEqual(90);
  });

  it("is deterministic", () => {
    const q = "Compare o2 and pressure and show the gaps";
    expect(compileDashboard(q, pack, scores)).toEqual(compileDashboard(q, pack, scores));
  });

  it("uses valid remote modules as ai, drops invalid ones with reasons, appends variable_scores", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const remote = { modules: [
      { type: "distribution", variable: "o2" },
      { type: "distribution", variable: "material" },
      { type: "nope" },
    ] };
    const d = compileDashboard("anything", pack, scores, remote);
    expect(d.origin).toBe("ai");
    expect(types(d)).toEqual(["distribution", "variable_scores"]);
    expect(d.modules[0].origin).toBe("ai");
    expect(d.dropped).toHaveLength(2);
    expect(d.dropped.every((x) => x.reason.length > 0)).toBe(true);
    warn.mockRestore();
  });

  it("falls back to local when no remote module is valid", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = compileDashboard("hello", pack, scores, { modules: [{ type: "scatter", x: "o2", y: "ghost" }] });
    expect(d.origin).toBe("local");
    expect(d.dropped).toHaveLength(1);
    expect(types(d)).toContain("key_papers");
    warn.mockRestore();
  });
});

describe("suggestPurposes", () => {
  it("builds four purposes from the top labels", () => {
    const s = suggestPurposes(scores);
    expect(s).toHaveLength(4);
    expect(s[0]).toBe(`Compare the documents on ${scores[0].label} and ${scores[1].label} and show where evidence is missing`);
  });
  it("handles empty scores", () => {
    expect(suggestPurposes([]).length).toBeGreaterThan(0);
  });
});

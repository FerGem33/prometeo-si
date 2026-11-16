import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Pack } from "../engine";
import { compileDashboard, suggestPurposes } from "./compile";
import { arrange } from "./layout";
import { validateModules } from "./validate";
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
  it("maximum of a variable becomes answer_stat, right after the key figures", () => {
    const d = compileDashboard(`What is the maximum ${o2.label}?`, pack, scores);
    expect(d.modules[0]).toMatchObject({ type: "key_figures", section: "highlights", origin: "local" });
    expect(d.modules[1]).toMatchObject({ type: "answer_stat", variable: "o2", stat: "max", origin: "local", section: "answers" });
    expect(d.modules[1].title).toBe(`Maximum of ${o2.label}`);
    expect(d.modules[1].caption).toMatch(/^Computed from \d+ records of the uploaded documents$/);
    expect(d.modules[2]).toMatchObject({ type: "records_table", sort: "o2", order: "desc" });
    expect(d.modules.at(-1)).toMatchObject({ type: "variable_scores", limit: 20 });
    expect(d.origin).toBe("local");
  });

  it("a threshold question becomes answer_filter", () => {
    const d = compileDashboard(`Which tests are above 21 % ${o2.label}?`, pack, scores);
    expect(d.modules.find((m) => m.section === "answers")).toMatchObject({ type: "answer_filter", variable: "o2", op: ">", bounds: [21] });
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
    expect(types(d)).toEqual(["key_figures", "distribution", "category_bars", "coverage_matrix", "key_papers", "variable_scores"]);
    expect(d.modules.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
    expect(d.order).toEqual(["highlights", "answers", "patterns", "coverage", "sources", "case"]);
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
    expect(types(d)).toEqual(["key_figures", "distribution", "variable_scores"]);
    expect(d.modules.map((m) => m.origin)).toEqual(["local", "ai", "local"]);
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

describe("adaptive layout", () => {
  const sections = (d: ReturnType<typeof compileDashboard>) => arrange(d).map((b) => (b.kind === "case" ? "case" : b.id));

  it("puts the blocks in the order the purpose names them", () => {
    expect(sections(compileDashboard("Where are the gaps? Then compare O₂ and pressure", pack, scores))).toEqual(["highlights", "coverage", "patterns", "case"]);
    expect(sections(compileDashboard("Compare O₂ and pressure, then show the gaps", pack, scores))).toEqual(["highlights", "patterns", "coverage", "case"]);
    expect(sections(compileDashboard("Which studies are relevant? Show the distribution of O₂", pack, scores))).toEqual(["highlights", "sources", "patterns", "case"]);
  });

  it("moves the case ahead only when the purpose is about a case, and never before the answers", () => {
    const d = compileDashboard("For my case, what is the maximum O₂ and where are the gaps?", pack, scores);
    expect(sections(d)).toEqual(["highlights", "answers", "case", "coverage"]);
    expect(sections(compileDashboard("What is the maximum O₂ and where are the gaps?", pack, scores)).at(-1)).toBe("case");
  });

  it("shows the same evidence in more than one form", () => {
    expect(types(compileDashboard("Where are the gaps?", pack, scores))).toEqual(expect.arrayContaining(["coverage_matrix", "completeness"]));
    expect(types(compileDashboard("Compare O₂ and pressure", pack, scores))).toEqual(expect.arrayContaining(["scatter", "group_ranges"]));
    expect(types(compileDashboard("Distribution of O₂ and pressure", pack, scores))).toEqual(expect.arrayContaining(["distribution", "box_summary"]));
    const split = compileDashboard("Records of O₂ by material", pack, scores);
    expect(split.modules.find((m) => m.type === "category_bars")).toMatchObject({ variable: "material", span: "half" });
    expect(split.modules.find((m) => m.type === "cross_tab")).toMatchObject({ row: "material", column: "o2" });
  });

  it("leads the coverage section with the form that fits the number of source documents", () => {
    const coverage = (p: Pack) => types(compileDashboard("Where are the gaps?", p, scores)).filter((t) => t === "coverage_matrix" || t === "completeness");
    expect(coverage(pack)).toEqual(["coverage_matrix", "completeness"]);
    expect(coverage({ ...pack, studies: pack.studies.slice(0, 1) })).toEqual(["completeness", "coverage_matrix"]);
  });

  it("drops the second forms first when the page is full", () => {
    const d = compileDashboard("maximum o2, distribution, compare, gaps, studies, summary of Pressure and Flow", pack, scores);
    expect(d.modules).toHaveLength(MAX_MODULES);
    expect(types(d)).toEqual(expect.arrayContaining(["key_figures", "answer_stat", "distribution", "scatter", "coverage_matrix", "key_papers", "doc_summaries"]));
  });

  it("every local module passes the validator and keeps its section", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const q of ["hello", "Records of O₂ by material", "maximum o2, distribution, compare, gaps, studies, summary of Pressure and Flow", "list the lowest flow"]) {
      const d = compileDashboard(q, pack, scores);
      const v = validateModules(d.modules, pack);
      expect(v.dropped).toEqual([]);
      expect(v.modules.map((m) => [m.type, m.section, m.span])).toEqual(d.modules.map((m) => [m.type, m.section, m.span]));
    }
    warn.mockRestore();
  });

  it("keeps the modules the rules derive from the purpose next to an AI layout, without repeating them", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const purpose = "Where are the gaps? Then compare O₂ and pressure";
    const local = compileDashboard(purpose, pack, scores);
    const remote = { modules: [{ type: "distribution", variable: "p", title: "Spread of the second variable" }, { type: "scatter", x: "o2", y: "p", title: "Own scatter" }] };
    const d = compileDashboard(purpose, pack, scores, remote);
    expect(d.origin).toBe("ai");
    expect(d.modules.length).toBeLessThanOrEqual(MAX_MODULES);
    // Everything the rules show is still there, the scatter only once and with the title of the reply.
    expect(types(d).filter((t) => t === "scatter")).toHaveLength(1);
    expect(d.modules.find((m) => m.type === "scatter")).toMatchObject({ origin: "ai", title: "Own scatter" });
    for (const t of types(local)) expect(types(d)).toContain(t);
    expect(d.modules.find((m) => m.type === "distribution")).toMatchObject({ origin: "ai", variable: "p" });
    expect(d.modules.find((m) => m.type === "coverage_matrix")?.origin).toBe("local");
    // Inside a section the modules of the reply come first.
    const patterns = arrange(d).find((b) => b.kind === "section" && b.id === "patterns");
    expect(patterns?.kind === "section" && patterns.rows.flat().map((m) => m.origin)).toEqual(["ai", "ai", "local"]);
    expect(sections(d)).toEqual(["highlights", "coverage", "patterns", "case"]);
    warn.mockRestore();
  });

  it("does not repeat a summary the AI layout already gives with other variables", () => {
    const d = compileDashboard("Where are the gaps?", pack, scores, { modules: [{ type: "completeness", variables: ["o2"] }] });
    expect(types(d).filter((t) => t === "completeness")).toHaveLength(1);
    expect(types(d)).toContain("coverage_matrix");
  });

  it("does not add the overview set to an AI layout when the purpose names no intent", () => {
    const d = compileDashboard("anything", pack, scores, { modules: [{ type: "doc_summaries" }] });
    expect(types(d)).toEqual(["key_figures", "doc_summaries", "variable_scores"]);
  });

  it("an AI layout may order the sections; unknown names are ignored and the base structure stays", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const remote = {
      sections: ["sources", "bogus", "coverage", "sources"],
      modules: [
        { type: "key_papers", limit: 3 },
        { type: "completeness", variables: ["o2", "p"], section: "nowhere", span: "wide" },
        { type: "category_bars", variable: "material", section: "sources", span: "full" },
      ],
    };
    const d = compileDashboard("anything", pack, scores, remote);
    expect(d.origin).toBe("ai");
    expect(d.order).toEqual(["highlights", "answers", "sources", "coverage", "patterns", "case"]);
    expect(sections(d)).toEqual(["highlights", "sources", "coverage", "case"]);
    expect(d.modules.find((m) => m.type === "completeness")).toMatchObject({ section: "coverage", span: "half" });
    expect(d.modules.find((m) => m.type === "category_bars")).toMatchObject({ section: "sources", span: "full" });
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

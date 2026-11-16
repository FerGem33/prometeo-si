import { describe, expect, it } from "vitest";
import { arrange, askedBlocks, blockOrder, sectionOf, spanOf } from "./layout";
import type { ModuleSpec } from "./types";

const base = { title: "t", caption: "c", origin: "local" as const };
const mod = (id: string, rest: Record<string, unknown>): ModuleSpec => ({ ...base, id, ...rest }) as unknown as ModuleSpec;

describe("blockOrder", () => {
  it("keeps the base order when nothing is asked for", () => {
    expect(blockOrder()).toEqual(["highlights", "answers", "patterns", "coverage", "sources", "case"]);
  });

  it("moves the blocks asked for ahead, after the key figures and the answers", () => {
    expect(blockOrder(["coverage", "case"])).toEqual(["highlights", "answers", "coverage", "case", "patterns", "sources"]);
    expect(blockOrder(["answers", "highlights", "sources"])).toEqual(["highlights", "answers", "sources", "patterns", "coverage", "case"]);
  });

  it("ignores unknown and repeated names and always returns every block once", () => {
    const order = blockOrder(["sources", "nope", 7, null, "sources", "coverage"]);
    expect(order).toEqual(["highlights", "answers", "sources", "coverage", "patterns", "case"]);
    expect(new Set(order).size).toBe(6);
  });

  it("orders the blocks by where the purpose first names them", () => {
    expect(askedBlocks({ sources: 30, coverage: 4 })).toEqual(["coverage", "sources"]);
    expect(askedBlocks({ patterns: 5, coverage: 5 })).toEqual(["patterns", "coverage"]);
    expect(askedBlocks({})).toEqual([]);
  });
});

describe("arrange", () => {
  it("groups modules by section, leaves empty sections out and shows the case once", () => {
    const blocks = arrange({
      modules: [
        mod("m1", { type: "scatter", x: "a", y: "b" }),
        mod("m2", { type: "key_figures", variables: ["a"] }),
        mod("m3", { type: "variable_scores", limit: 20 }),
      ],
    });
    expect(blocks.map((b) => (b.kind === "case" ? "case" : b.id))).toEqual(["highlights", "patterns", "case"]);
  });

  it("pairs two consecutive half-width modules and leaves a single one alone", () => {
    const blocks = arrange({
      modules: [
        mod("m1", { type: "category_bars", variable: "c" }),
        mod("m2", { type: "category_bars", variable: "d" }),
        mod("m3", { type: "category_bars", variable: "e" }),
        mod("m4", { type: "scatter", x: "a", y: "b" }),
        mod("m5", { type: "category_bars", variable: "f", span: "full" }),
      ],
    });
    const patterns = blocks.find((b) => b.kind === "section" && b.id === "patterns");
    expect(patterns?.kind === "section" && patterns.rows.map((r) => r.map((m) => m.id))).toEqual([["m1", "m2"], ["m3"], ["m4"], ["m5"]]);
  });

  it("follows the order of the spec and an explicit section of a module", () => {
    const blocks = arrange({
      order: ["sources", "coverage"],
      modules: [mod("m1", { type: "completeness", variables: ["a"] }), mod("m2", { type: "key_papers", limit: 3 }), mod("m3", { type: "category_bars", variable: "c", section: "sources" })],
    });
    expect(blocks.map((b) => (b.kind === "case" ? "case" : b.id))).toEqual(["sources", "coverage", "case"]);
    expect(blocks[0].kind === "section" && blocks[0].rows.map((r) => r.map((m) => m.id))).toEqual([["m2"], ["m3"]]);
  });

  it("lays out a spec saved before sections existed", () => {
    const blocks = arrange({ modules: [mod("m1", { type: "answer_stat", variable: "a", stat: "max" }), mod("m2", { type: "key_papers", limit: 5 }), mod("m3", { type: "variable_scores", limit: 20 })] });
    expect(blocks.map((b) => (b.kind === "case" ? "case" : b.id))).toEqual(["answers", "sources", "case"]);
  });
});

describe("defaults by type", () => {
  it("never narrows a module that needs the whole column", () => {
    expect(spanOf({ type: "scatter", span: "half" })).toBe("full");
    expect(spanOf({ type: "completeness" })).toBe("half");
    expect(spanOf({ type: "completeness", span: "full" })).toBe("full");
  });

  it("falls back to the section of the type", () => {
    expect(sectionOf({ type: "cross_tab" })).toBe("patterns");
    expect(sectionOf({ type: "cross_tab", section: "coverage" })).toBe("coverage");
    expect(sectionOf({ type: "cross_tab", section: "nope" as never })).toBe("patterns");
  });
});

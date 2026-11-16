import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Pack } from "../engine";
import { validateModules } from "./validate";

const pack = JSON.parse(readFileSync(new URL("../../public/demo/pack.json", import.meta.url), "utf8")) as Pack;

function run(raw: unknown) {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const r = validateModules(raw, pack);
  const warned = warn.mock.calls.length;
  warn.mockRestore();
  return { ...r, warned };
}

describe("validateModules", () => {
  it("keeps valid modules as ai with template title and caption fallbacks", () => {
    const { modules, dropped } = run({ modules: [
      { type: "answer_stat", variable: "o2", stat: "max" },
      { type: "answer_filter", variable: "p", op: "between", bounds: [0.5, 2], title: "Own title" },
      { type: "scatter", x: "o2", y: "p" },
      { type: "coverage_matrix", variables: ["o2", "material"] },
      { type: "key_papers", limit: 5 },
      { type: "doc_summaries" },
      { type: "variable_scores", limit: 20 },
    ] });
    expect(dropped).toEqual([]);
    expect(modules).toHaveLength(7);
    expect(modules.every((m) => m.origin === "ai" && m.title && m.caption)).toBe(true);
    expect(modules[0].title).toBe("Maximum of O₂");
    expect(modules[1].title).toBe("Own title");
    expect(modules[2].title).toBe("Pressure against O₂");
  });

  it.each([
    [{ type: "bogus" }, /unknown module type/],
    [{ type: "distribution", variable: "ghost" }, /not in the pack/],
    [{ type: "distribution", variable: "material" }, /not numeric/],
    [{ type: "scatter", x: "o2", y: "phase" }, /not numeric/],
    [{ type: "answer_stat", variable: "o2", stat: "median" }, /stat/],
    [{ type: "answer_filter", variable: "o2", op: ">", bounds: [Infinity] }, /finite/],
    [{ type: "answer_filter", variable: "o2", op: ">", bounds: ["21"] }, /finite/],
    [{ type: "answer_filter", variable: "o2", op: "between", bounds: [5, 1] }, /ordered/],
    [{ type: "answer_filter", variable: "o2", op: "between", bounds: [5] }, /ordered/],
    [{ type: "key_papers", limit: 0 }, /limit/],
    [{ type: "key_papers", limit: 21 }, /limit/],
    [{ type: "variable_scores", limit: 2.5 }, /limit/],
    [{ type: "coverage_matrix", variables: ["o2", "ghost"] }, /not in the pack/],
    [{ type: "distribution", variable: "o2", title: "x".repeat(161) }, /title/],
    [{ type: "distribution", variable: "o2", caption: "x".repeat(161) }, /caption/],
    ["text", /not an object/],
  ])("drops %j", (m, reason) => {
    const r = run([m]);
    expect(r.modules).toEqual([]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].reason).toMatch(reason);
    expect(r.warned).toBe(1);
  });

  it("keeps the new forms with template titles and the layout defaults of their type", () => {
    const { modules, dropped } = run([
      { type: "key_figures", variables: ["o2", "p", "o2", "flow", "g", "p"] },
      { type: "category_bars", variable: "material" },
      { type: "group_ranges", variable: "o2" },
      { type: "group_ranges", variable: "o2", by: "phase" },
      { type: "box_summary", variables: ["o2", "p"] },
      { type: "cross_tab", row: "phase", column: "o2" },
      { type: "completeness", variables: ["o2", "material"] },
      { type: "records_table", sort: "o2", order: "desc", columns: ["o2", "p", "material"], limit: 8 },
    ]);
    expect(dropped).toEqual([]);
    expect(modules.map((m) => [m.type, m.section, m.span])).toEqual([
      ["key_figures", "highlights", "full"],
      ["category_bars", "patterns", "half"],
      ["group_ranges", "patterns", "full"],
      ["group_ranges", "patterns", "full"],
      ["box_summary", "patterns", "full"],
      ["cross_tab", "patterns", "full"],
      ["completeness", "coverage", "half"],
      ["records_table", "answers", "full"],
    ]);
    expect(modules[0]).toMatchObject({ variables: ["o2", "p", "flow", "g"] });
    expect(modules[1].title).toBe("Records by Material");
    expect(modules[2].title).toBe("O₂ (%) by document");
    expect(modules[3].title).toBe("O₂ (%) by Fuel phase");
    expect(modules[5].title).toBe("Records by Fuel phase and O₂");
    expect(modules[7]).toMatchObject({ columns: ["p", "material"] });
    expect(modules[7].title).toBe("Records with the highest O₂ (%)");
    expect(modules.every((m) => m.title.length <= 160 && m.caption.length <= 160)).toBe(true);
  });

  it("takes a layout hint only from the lists it knows", () => {
    const { modules } = run([
      { type: "completeness", variables: ["o2"], section: "sources", span: "full" },
      { type: "completeness", variables: ["p"], section: "footer", span: "third" },
      { type: "scatter", x: "o2", y: "p", span: "half" },
    ]);
    expect(modules.map((m) => [m.section, m.span])).toEqual([["sources", "full"], ["coverage", "half"], ["patterns", "full"]]);
  });

  it.each([
    [{ type: "key_figures", variables: [] }, /at least one variable/],
    [{ type: "key_figures", variables: ["material"] }, /not numeric/],
    [{ type: "category_bars", variable: "o2" }, /not categorical/],
    [{ type: "category_bars", variable: "ghost" }, /not in the pack/],
    [{ type: "group_ranges", variable: "material" }, /not numeric/],
    [{ type: "group_ranges", variable: "o2", by: "p" }, /not categorical/],
    [{ type: "box_summary", variables: ["o2", "phase"] }, /not numeric/],
    [{ type: "cross_tab", row: "phase", column: "phase" }, /two different/],
    [{ type: "cross_tab", row: "phase", column: "ghost" }, /not in the pack/],
    [{ type: "completeness", variables: "o2" }, /at least one variable/],
    [{ type: "records_table", sort: "material", order: "desc", columns: [], limit: 5 }, /not numeric/],
    [{ type: "records_table", sort: "o2", order: "up", columns: [], limit: 5 }, /asc or desc/],
    [{ type: "records_table", sort: "o2", order: "asc", columns: ["ghost"], limit: 5 }, /not in the pack/],
    [{ type: "records_table", sort: "o2", order: "asc", columns: [], limit: 50 }, /limit/],
  ])("drops %j", (m, reason) => {
    const r = run([m]);
    expect(r.modules).toEqual([]);
    expect(r.dropped[0].reason).toMatch(reason);
  });

  it("drops duplicate ids and non-array input", () => {
    const r = run([{ id: "a", type: "doc_summaries" }, { id: "a", type: "doc_summaries" }]);
    expect(r.modules).toHaveLength(1);
    expect(r.dropped[0].reason).toMatch(/duplicate id/);
    expect(run("nope").dropped[0].reason).toMatch(/not an array/);
  });
});

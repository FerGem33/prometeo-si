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

  it("drops duplicate ids and non-array input", () => {
    const r = run([{ id: "a", type: "doc_summaries" }, { id: "a", type: "doc_summaries" }]);
    expect(r.modules).toHaveLength(1);
    expect(r.dropped[0].reason).toMatch(/duplicate id/);
    expect(run("nope").dropped[0].reason).toMatch(/not an array/);
  });
});

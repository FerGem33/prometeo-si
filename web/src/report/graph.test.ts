import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Pack, Scenario } from "../engine";
import { buildGraph } from "./graph";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf8")) as Pack;
const scenario: Scenario = { values: { o2: 30, p: 0.7 }, active: ["o2", "p"] };

describe("evidence network", () => {
  it("has one node per study", () => {
    expect(buildGraph(pack, scenario).nodes.length).toBe(pack.studies.length);
  });
  it("is deterministic", () => {
    expect(JSON.stringify(buildGraph(pack, scenario))).toBe(JSON.stringify(buildGraph(pack, scenario)));
  });
  it("edges reference existing nodes and are unique", () => {
    const g = buildGraph(pack, scenario);
    const ids = new Set(g.nodes.map((n) => n.id));
    const keys = new Set(g.edges.map((e) => `${e.a}|${e.b}`));
    expect(keys.size).toBe(g.edges.length);
    for (const e of g.edges) expect(ids.has(e.a) && ids.has(e.b) && e.a !== e.b).toBe(true);
  });
});

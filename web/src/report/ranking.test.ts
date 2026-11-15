import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { closeness, rank } from "../engine";
import type { Lens, Pack, Scenario } from "../engine";
import { presetScenario } from "../state";
import { ariaSort, explainAll, nextSort, overallCloseness, sortStable } from "./ranking";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf-8")) as Pack;
const lens = JSON.parse(readFileSync("public/demo/lens.json", "utf-8")) as Lens;
const sc: Scenario = presetScenario(lens);
const ranking = rank(pack, sc);
const close = closeness(pack, sc);

describe("sortStable", () => {
  test("stable, nulls last in both directions", () => {
    const xs = [{ n: 2, id: "a" }, { n: null, id: "b" }, { n: 1, id: "c" }, { n: 2, id: "d" }];
    expect(sortStable(xs, (x) => x.n, 1).map((x) => x.id)).toEqual(["c", "a", "d", "b"]);
    expect(sortStable(xs, (x) => x.n, -1).map((x) => x.id)).toEqual(["a", "d", "c", "b"]);
  });
  test("nextSort and aria", () => {
    expect(nextSort({ k: "a", dir: 1 }, "a")).toEqual({ k: "a", dir: -1 });
    expect(nextSort({ k: "a", dir: -1 }, "b")).toEqual({ k: "b", dir: 1 });
    expect(ariaSort(false, 1)).toBe("none");
    expect(ariaSort(true, -1)).toBe("descending");
  });
});

describe("explainAll on the real pack and the default preset", () => {
  const a = explainAll(pack, sc, ranking, close);
  const b = explainAll(pack, sc, rank(pack, sc), closeness(pack, sc));
  test("deterministic", () => expect(JSON.stringify(a)).toBe(JSON.stringify(b)));
  test("one row per study, in engine order", () => expect(a.map((e) => e.study)).toEqual(ranking.map((r) => r.study)));
  test("explained values match closeness()", () => {
    for (const e of a) {
      for (const v of e.vars) {
        const c = close[e.study][v.variable];
        expect(v.status === "missing").toBe(!!c.reason || c.missing);
        if (v.status !== "missing") {
          expect(v.score).toBe(c.score);
          expect(v.gap).toBe(c.gap);
          expect(v.nearestRecord).toBe(c.nearest);
        }
      }
      expect(e.reported.length + e.missing.length).toBe(e.vars.length);
      expect(e.overall).toBe(overallCloseness(close[e.study], e.vars.map((v) => v.variable)));
    }
  });
  test("sorting by overall puts nulls last", () => {
    const s = sortStable(a, (e) => e.overall, -1);
    const firstNull = s.findIndex((e) => e.overall === null);
    if (firstNull >= 0) expect(s.slice(firstNull).every((e) => e.overall === null)).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import packJson from "../../public/demo/pack.json";
import lensJson from "../../public/demo/lens.json";
import { evidenceLevels, type Lens, type Pack } from "../engine";
import { presetScenario } from "../state";
import { compareVariants, defaultParts, deleteVariant, loadVariants, makeVariant, reconcileParts, saveVariant, summarizeParts } from "./variants";

const pack = packJson as Pack;
const lens = lensJson as Lens;

function mockStorage(fail = false) {
  const m = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => {
        if (fail) throw new Error("quota");
        m.set(k, v);
      },
      removeItem: (k: string) => void m.delete(k),
    },
  };
}

const lunar = presetScenario(lens, "lunar_base");
const station = presetScenario(lens, "station");

describe("variants", () => {
  beforeEach(() => mockStorage());

  it("saves, lists, replaces by name and deletes per pack", () => {
    const a = makeVariant(" Base ", lunar, defaultParts(lunar));
    expect(a.name).toBe("Base");
    expect(saveVariant(pack.meta.id, a).ok).toBe(true);
    saveVariant(pack.meta.id, makeVariant("Base", station, defaultParts(station)));
    const list = loadVariants(pack.meta.id);
    expect(list).toHaveLength(1);
    expect(list[0].scenario.values.o2).toBe(21);
    expect(loadVariants("other-pack")).toEqual([]);
    expect(deleteVariant(pack.meta.id, list[0].id).list).toEqual([]);
    expect(loadVariants(pack.meta.id)).toEqual([]);
  });

  it("reports a refused write", () => {
    mockStorage(true);
    expect(saveVariant(pack.meta.id, makeVariant("X", lunar, defaultParts(lunar))).ok).toBe(false);
  });

  it("ignores corrupt stored data", () => {
    (window.localStorage as Storage).setItem("prometeo:v1:variants:" + pack.meta.id, JSON.stringify({ not: "a list" }));
    expect(loadVariants(pack.meta.id)).toEqual([]);
  });

  it("compares two variants with engine levels and findings", () => {
    const a = makeVariant("Lunar", lunar, defaultParts(lunar));
    const b = makeVariant("Station", station, defaultParts(station));
    const c = compareVariants(pack, lens, a, b);
    expect(c.levelsA).toEqual(evidenceLevels(pack, lens, lunar));
    expect(c.changes).toEqual([{ variable: "o2", from: "near", to: "studied", direction: "up" }]);
    expect(c.findingsA.length).toBeGreaterThan(0);
  });
});

describe("parts", () => {
  it("default part holds all active variables; reconcile keeps each in exactly one part", () => {
    const parts = defaultParts(lunar);
    expect(parts[0].variables).toEqual(["o2", "p", "material"]);
    const split = [{ id: "a", name: "Part 1", variables: ["o2", "p"] }, { id: "b", name: "Part 2", variables: ["material", "gone"] }];
    expect(reconcileParts(split, { ...lunar, active: ["o2", "material", "flow"] })).toEqual([
      { id: "a", name: "Part 1", variables: ["o2", "flow"] },
      { id: "b", name: "Part 2", variables: ["material"] },
    ]);
  });
  it("summarizes levels in engine order without a verdict", () => {
    const s = summarizeParts(defaultParts(lunar), evidenceLevels(pack, lens, lunar));
    expect(s[0].levels).toEqual([{ variable: "o2", level: "near" }, { variable: "p", level: "not_studied" }, { variable: "material", level: "studied" }]);
  });
});

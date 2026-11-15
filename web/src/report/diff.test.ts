import { describe, expect, it } from "vitest";
import packJson from "../../public/demo/pack.json";
import lensJson from "../../public/demo/lens.json";
import { evidenceLevels, type Lens, type Pack } from "../engine";
import { presetScenario } from "../state";
import { diffLevels } from "./diff";

const pack = packJson as Pack;
const lens = lensJson as Lens;

describe("diffLevels on the real pack", () => {
  const base = presetScenario(lens, "lunar_base");
  const lowered = { ...base, values: { ...base.values, o2: 21 } };
  const before = evidenceLevels(pack, lens, base);
  const after = evidenceLevels(pack, lens, lowered);

  it("is empty for an identical scenario", () => {
    expect(diffLevels(before, before)).toEqual([]);
  });
  it("lunar preset, O2 30 to 21: only O2 changes, from near to studied (up)", () => {
    expect(diffLevels(before, after)).toEqual([{ variable: "o2", from: "near", to: "studied", direction: "up" }]);
  });
  it("the reverse edit moves down", () => {
    expect(diffLevels(after, before)).toEqual([{ variable: "o2", from: "studied", to: "near", direction: "down" }]);
  });
  it("reports added and removed variables", () => {
    expect(diffLevels(before.filter((l) => l.variable !== "p"), before)).toEqual([{ variable: "p", from: null, to: "not_studied", direction: "added" }]);
    expect(diffLevels(before, before.filter((l) => l.variable !== "p"))).toEqual([{ variable: "p", from: "not_studied", to: null, direction: "removed" }]);
  });
});

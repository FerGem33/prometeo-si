import { describe, expect, it } from "vitest";
import { NASA_MISSION_PRESETS } from "./presets";

describe("NASA_MISSION_PRESETS", () => {
  it("contains at least 4 predefined mission configurations", () => {
    expect(NASA_MISSION_PRESETS.length).toBeGreaterThanOrEqual(4);
  });

  it("ensures each preset has valid physical parameters within schema boundaries", () => {
    for (const p of NASA_MISSION_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.badge).toBeTruthy();
      expect(p.scenario.o2).toBeGreaterThanOrEqual(15);
      expect(p.scenario.o2).toBeLessThanOrEqual(40);
      expect(p.scenario.p).toBeGreaterThan(0.2);
      expect(p.scenario.p).toBeLessThanOrEqual(1.5);
      expect(p.designId).toBeTruthy();
    }
  });

  it("includes Artemis Lunar Base with 24% O2 and 0.70 atm", () => {
    const artemis = NASA_MISSION_PRESETS.find((p) => p.id === "artemis_lunar");
    expect(artemis).toBeDefined();
    expect(artemis?.scenario.o2).toBe(24);
    expect(artemis?.scenario.p).toBe(0.70);
  });
});

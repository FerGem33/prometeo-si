import { describe, expect, it } from "vitest";
import { ghostNetwork, hashSeed } from "./ghosts";

describe("ghostNetwork", () => {
  it("is deterministic for a given seed", () => {
    const a = ghostNetwork(760, "prometeo.pack/1:psi-fire:24");
    const b = ghostNetwork(760, "prometeo.pack/1:psi-fire:24");
    expect(a).toEqual(b);
  });

  it("changes when the seed changes", () => {
    const a = ghostNetwork(760, "pack-a");
    const b = ghostNetwork(760, "pack-b");
    expect(a.nodes).not.toEqual(b.nodes);
  });

  it("keeps every point inside the viewBox and every edge within range", () => {
    const g = ghostNetwork(760, "seed");
    expect(g.nodes.length).toBe(58);
    for (const n of g.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(760);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(760);
      expect(n.o).toBeGreaterThan(0);
      expect(n.o).toBeLessThan(0.5);
    }
    for (const e of g.edges) {
      expect(e.a).toBeGreaterThanOrEqual(0);
      expect(e.b).toBeLessThan(g.nodes.length);
      expect(e.a).not.toBe(e.b);
    }
  });

  it("hashes strings to a stable 32 bit seed", () => {
    expect(hashSeed("prometeo")).toBe(hashSeed("prometeo"));
    expect(hashSeed("prometeo")).not.toBe(hashSeed("promete0"));
  });
});

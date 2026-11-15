import { describe, expect, it } from "vitest";
import { niceTicks } from "./ScatterModule";

describe("niceTicks", () => {
  it("returns nice ascending ticks within the range", () => {
    const ticks = niceTicks(0, 10, 6);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(10);
    for (const v of ticks) expect(v).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
  });

  it("rounds to the step's precision", () => {
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.5, 1]);
    expect(niceTicks(0, 1, 11)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it("handles a range that starts below zero", () => {
    const ticks = niceTicks(-3, 7, 4);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    for (const v of ticks) {
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it("collapses a single value", () => {
    expect(niceTicks(5, 5, 4)).toEqual([5]);
  });

  it("sorts an inverted range", () => {
    const ticks = niceTicks(3, 1, 5);
    expect(ticks[0]).toBeLessThanOrEqual(ticks[ticks.length - 1]);
  });

  it("returns [] for non-finite inputs", () => {
    expect(niceTicks(NaN, 1, 5)).toEqual([]);
    expect(niceTicks(0, Infinity, 5)).toEqual([]);
  });
});

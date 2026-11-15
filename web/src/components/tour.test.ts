import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TOUR_STEPS, tourContext, tourStartScenario } from "./JudgeTour";
import { habitatScenario } from "./HabitatFigure";
import type { Lens, Pack } from "../engine";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf-8")) as Pack;
const lens = JSON.parse(readFileSync("public/demo/lens.json", "utf-8")) as Lens;
const ctx = tourContext(pack, lens);
const control = (c: (typeof TOUR_STEPS)[number]["click"]) => (typeof c === "function" ? c(ctx) : c ?? "");

describe("JudgeTour", () => {
  it("follows the order of the pitch: cover, product, report, live case, sources, question, export, scope, close", () => {
    expect(TOUR_STEPS.map((s) => s.stage)).toEqual(["cover", "processing", "report", "report", "report", "report", "dossier", "report", "report"]);
    expect(TOUR_STEPS.at(-1)!.target).toContain(".keys");
  });

  it("gives every stop a name, a title, a pitch, a takeaway and an element to outline", () => {
    for (const step of TOUR_STEPS) {
      expect(step.name).toBeTruthy();
      expect(step.title).toBeTruthy();
      expect(step.pitch(ctx).length).toBeGreaterThan(40);
      expect(step.takeaway).toBeTruthy();
      expect(step.target).toMatch(/\S/);
    }
  });

  // The pitch quotes these results; they must come from the engine on the real pack, not from the text of the tour.
  it("states the results of the engine that the pitch quotes", () => {
    expect(ctx.hook).toMatch(/not recorded in any of the 268 comparable tests/);
    expect(ctx.levels).toMatch(/30 %: Near, not covered/);
    expect(ctx.levels).toMatch(/10\.2 psi\): Not studied/);
    expect(ctx.levels).toMatch(/PMMA: Studied/);
    expect(ctx.firstVar).toBe("oxygen concentration");
    const [first, , report, scenario, , question] = TOUR_STEPS;
    expect(first.pitch(ctx)).toContain(String(ctx.studies));
    expect(first.pitch(ctx)).toContain(String(ctx.sources));
    expect(first.pitch(ctx)).toContain(ctx.hook);
    expect(report.pitch(ctx)).toContain(ctx.baseBlurb);
    expect(scenario.pitch(ctx)).toContain(ctx.levels);
    expect(question.pitch(ctx)).toContain(lens.questions![0]);
  });

  it("opens the report on another setting and then loads the reference case, so the change is visible", () => {
    expect(ctx.baseId).toBeTruthy();
    expect(ctx.baseId).not.toBe(lens.default_preset);
    expect(tourStartScenario(lens)).toEqual(habitatScenario(lens, ctx.baseId));
    expect(control(TOUR_STEPS[2].click)).toContain(`"${ctx.baseId}"`);
    expect(control(TOUR_STEPS[3].click)).toContain(`"${lens.default_preset}"`);
  });

  it("compares conditions and never predicts an outcome", () => {
    const text = TOUR_STEPS.flatMap((s) => [s.title, s.pitch(ctx), s.takeaway]).join(" ");
    expect(text).not.toMatch(/\b(safe|safety|burns?|ignites?|hallucinat\w*)\b/i);
  });

  it("closes on departure the panels a stop opens", () => {
    for (const step of TOUR_STEPS)
      if (step.target === ".prov" || control(step.click).includes(".fold-head")) expect(step.leave).toBeTruthy();
  });
});

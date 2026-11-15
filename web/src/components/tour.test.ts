import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TOUR_STEPS, tourContext, tourStartScenario } from "./JudgeTour";
import { habitatScenario } from "./HabitatFigure";
import type { Lens, Pack } from "../engine";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf-8")) as Pack;
const lens = JSON.parse(readFileSync("public/demo/lens.json", "utf-8")) as Lens;
const ctx = tourContext(pack, lens);
const control = (c: (typeof TOUR_STEPS)[number]["click"]) => (typeof c === "function" ? c(ctx) : c ?? "");
const text = (s: (typeof TOUR_STEPS)[number]) => [s.title, s.pitch(ctx), s.takeaway].join(" ");

describe("JudgeTour", () => {
  it("follows the order of the pitch: cover, product, report, live case, sources, question, export, scope, close", () => {
    expect(TOUR_STEPS.map((s) => s.stage)).toEqual(["cover", "processing", "report", "report", "report", "report", "dossier", "report", "report"]);
    expect(TOUR_STEPS.at(-1)!.target).toContain(".keys");
  });

  it("gives every stop a name, a title, a short pitch, a takeaway and an element to outline", () => {
    for (const step of TOUR_STEPS) {
      expect(step.name).toBeTruthy();
      expect(step.title).toBeTruthy();
      expect(step.pitch(ctx).length).toBeGreaterThan(40);
      expect(step.pitch(ctx).split(/\s+/).length).toBeLessThanOrEqual(60);
      expect(step.takeaway).toBeTruthy();
      expect(step.target).toMatch(/\S/);
    }
  });

  // The tour presents Prometeo to an audience from any field: the example corpus is named only by its counts and
  // the labels of its settings, all read from the pack and the lens.
  it("keeps the text general, with the counts of the example taken from the pack", () => {
    const all = TOUR_STEPS.map(text).join(" ");
    for (const word of [lens.subject, ...pack.schema.variables.map((v) => v.label)].filter(Boolean))
      expect(all.toLowerCase()).not.toContain(String(word).toLowerCase());
    expect(TOUR_STEPS[0].pitch(ctx)).toContain(String(ctx.studies));
    expect(TOUR_STEPS[0].pitch(ctx)).toContain(String(ctx.sources));
  });

  it("explains the outlined panel with the level words the report shows", () => {
    const p = TOUR_STEPS[3].pitch(ctx);
    for (const word of ["Studied", "Near, not covered", "Not studied"]) expect(p).toContain(word);
    expect(p).toContain(ctx.presetLabel);
  });

  it("opens the report on another setting and then loads the reference case, so the change is visible", () => {
    expect(ctx.baseId).toBeTruthy();
    expect(ctx.baseId).not.toBe(lens.default_preset);
    expect(tourStartScenario(lens)).toEqual(habitatScenario(lens, ctx.baseId));
    expect(control(TOUR_STEPS[2].click)).toContain(`"${ctx.baseId}"`);
    expect(control(TOUR_STEPS[3].click)).toContain(`"${lens.default_preset}"`);
  });

  it("compares conditions and never predicts an outcome", () => {
    expect(TOUR_STEPS.map(text).join(" ")).not.toMatch(/\b(safe|safety|burns?|ignites?|hallucinat\w*)\b/i);
  });

  it("closes on departure the panels a stop opens", () => {
    for (const step of TOUR_STEPS)
      if (step.target === ".prov" || control(step.click).includes(".fold-head")) expect(step.leave).toBeTruthy();
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TOUR_STEPS } from "./JudgeTour";
import type { TourContext } from "./JudgeTour";
import type { Lens, Pack } from "../engine";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf-8")) as Pack;
const lens = JSON.parse(readFileSync("public/demo/lens.json", "utf-8")) as Lens;
const preset = lens.presets.find((p) => p.id === lens.default_preset)!;
const ctx: TourContext = {
  tests: (pack.meta.stats.tests ?? 0).toLocaleString("en-US"),
  studies: pack.studies.length,
  unit: lens.unit_of_study ?? "study",
  units: `${lens.unit_of_study ?? "study"}s`,
  sources: pack.meta.stats.sources ?? pack.sources.length,
  subject: lens.subject ?? "tests",
  presetLabel: preset.label,
  presetBlurb: preset.blurb,
  question: lens.questions?.[0] ?? "",
};

const ORDER = ["cover", "scenario", "processing", "report", "dossier"];

describe("JudgeTour", () => {
  it("walks the application in the order a presentation follows", () => {
    const stages = TOUR_STEPS.map((s) => s.stage);
    for (const st of ORDER) expect(stages).toContain(st);
    const pos = stages.map((s) => ORDER.indexOf(s));
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
  });

  it("gives every stop a title, a pitch, a takeaway and an element to outline", () => {
    for (const step of TOUR_STEPS) {
      expect(step.name).toBeTruthy();
      expect(step.title).toBeTruthy();
      expect(step.pitch(ctx).length).toBeGreaterThan(40);
      expect(step.takeaway).toBeTruthy();
      expect(step.target).toMatch(/\S/);
    }
  });

  it("takes the numbers of the corpus from the pack, not from its own text", () => {
    const first = TOUR_STEPS[0].pitch(ctx);
    expect(first).toContain(ctx.tests);
    expect(first).toContain(String(ctx.studies));
    expect(first).toContain(String(ctx.sources));
    expect(TOUR_STEPS.find((s) => s.stage === "scenario")!.pitch(ctx)).toContain(preset.blurb);
  });

  it("compares conditions and never predicts an outcome", () => {
    const text = TOUR_STEPS.flatMap((s) => [s.title, s.pitch(ctx), s.takeaway]).join(" ");
    expect(text).not.toMatch(/\b(safe|safety|burns?|ignites?|hallucinat\w*)\b/i);
  });

  it("undoes the demo action of a stop when the tour leaves it", () => {
    for (const step of TOUR_STEPS) if (step.click) expect(step.leave).toBeTruthy();
  });
});

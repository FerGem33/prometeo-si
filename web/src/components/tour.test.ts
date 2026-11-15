import { describe, expect, it } from "vitest";
import { TOUR_STEPS } from "./JudgeTour";

describe("JudgeTour", () => {
  it("contains 5 comprehensive judge evaluation stops", () => {
    expect(TOUR_STEPS.length).toBe(5);
  });

  it("covers all key application stages in logical pitch order", () => {
    const stages = TOUR_STEPS.map((s) => s.stage);
    expect(stages).toContain("cover");
    expect(stages).toContain("scenario");
    expect(stages).toContain("processing");
    expect(stages).toContain("report");
    expect(stages).toContain("dossier");
  });

  it("ensures each stop has an actionable title, description, and key takeaway for judges", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title).toBeTruthy();
      expect(step.pitch).toBeTruthy();
      expect(step.takeaway).toBeTruthy();
    }
  });
});

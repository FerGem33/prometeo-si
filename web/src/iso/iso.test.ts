import { describe, expect, it } from "vitest";
import { HABITAT_VECTORS, habitatSvg } from "./habitats/build";
import { CHAMBER_VECTORS, chamberSvg } from "./chamber/build";
import { ART, H, RISE, TRAVEL, W } from "./bench-geometry";
import { stageFromUrl } from "../state";
import { flameIntensityForScenario } from "../components/HabitatFigure";

describe("isometric habitats & apparatus engine", () => {
  it("renders all 6 habitat models and preset aliases deterministically", () => {
    const keys = [
      "moon_base",
      "lunar_base",
      "spacecraft",
      "station",
      "rover",
      "suit",
      "generic",
      "custom",
    ];
    for (const k of keys) {
      const svg = habitatSvg(k);
      expect(svg).toBeTruthy();
      expect(svg).toContain("<svg");
      expect(svg).toContain("data-part=");
      expect(svg).toContain("data-tint=");
      expect(habitatSvg(k)).toBe(svg);
    }
    expect(habitatSvg("lunar_base")).toBe(habitatSvg("moon_base"));
    expect(habitatSvg("custom")).toBe(habitatSvg("generic"));
    expect(habitatSvg("unknown_key")).toBeNull();
    expect(HABITAT_VECTORS.rise.length).toBe(2);
  });

  it("renders the microgravity combustion chamber with all animated parts", () => {
    const svg = chamberSvg();
    expect(svg).toContain("<svg");
    expect(svg).toContain('data-part="carriage"');
    expect(svg).toContain('data-part="scanner"');
    expect(svg).toContain('data-part="flame"');
    expect(svg).toContain('data-flame-layer="outer"');
    expect(svg).toContain('data-flame-layer="plume"');
    expect(svg).toContain('data-flame-layer="core"');
    expect(svg).toContain('data-flame-layer="sparks"');
    expect(svg).toContain('data-stage-fx="0"');
    expect(svg).toContain('data-stage-fx="1"');
    expect(svg).toContain('data-stage-fx="2"');
    expect(svg).toContain('data-stage-fx="3"');
    expect(svg).toContain('data-stage-fx="4"');
    expect(svg).toContain('data-part="needle"');
    expect(svg).toContain('data-tint="cyan"');
    expect(svg).toContain('data-tint="coral"');
    expect(CHAMBER_VECTORS.needlePivot.length).toBe(2);
    expect(CHAMBER_VECTORS.flameCenter.length).toBe(2);
  });

  it("paints a scene plate behind every habitat and numbered callouts on the chamber", () => {
    for (const k of ["moon_base", "spacecraft", "station", "rover", "suit", "custom"]) {
      const svg = habitatSvg(k)!;
      expect(svg).toContain('class="iso-plate-bg"');
      // the plate is the first thing painted, so the model always sits on top of it
      expect(svg.indexOf("iso-plate-bg")).toBeLessThan(svg.indexOf("iso-solid"));
    }
    expect(habitatSvg("moon_base")).toContain('data-tint="regolith"');
    expect(habitatSvg("custom")).toContain('data-scene="lab"');
    // each model stands in its own scene; only the console keeps a machined base
    expect(habitatSvg("moon_base")).toContain('data-ground="moon"');
    expect(habitatSvg("station")).toContain('class="iso-asteroid"');
    expect(habitatSvg("suit")).toContain('class="iso-tether"');
    expect(habitatSvg("suit")).toContain('data-part="float"');
    expect(habitatSvg("spacecraft")).toContain('data-down=""');
    const rover = habitatSvg("rover")!;
    expect(rover).toContain('data-ground="mars"');
    expect(rover).toContain('data-part="pass-0"');
    expect(rover).toContain('class="iso-wheel-spin"');
    const chamber = chamberSvg();
    for (const n of [1, 2, 3, 4]) expect(chamber).toContain(`data-callout="${n}"`);
    expect(chamber).toContain('class="iso-gridline"');
  });

  it("builds the isometric test bench geometry", () => {
    expect(W).toBeGreaterThan(200);
    expect(H).toBeGreaterThan(150);
    expect(TRAVEL).toBe(34);
    expect(RISE.length).toBe(2);
    expect(ART.base.top.length).toBeGreaterThan(10);
    expect(ART.sample.top.length).toBeGreaterThan(10);
    expect(ART.sampleCenter.length).toBe(2);
    expect(ART.flameRingOuter.length).toBeGreaterThan(10);
  });

  it("recognizes #processing stage in stageFromUrl", () => {
    expect(stageFromUrl("#processing", "")).toBe("processing");
    expect(stageFromUrl("#scenario", "")).toBe("scenario");
    expect(stageFromUrl("#report", "")).toBe("report");
    expect(stageFromUrl("", "")).toBe("cover");
  });

  it("computes flame intensity from scenario O2 concentration", () => {
    expect(flameIntensityForScenario({ values: { o2: 36, p: 1 }, active: ["o2", "p"] })).toBeGreaterThan(1.0);
    expect(flameIntensityForScenario({ values: { o2: 21, p: 0.7 }, active: ["o2", "p"] })).toBeLessThan(
      flameIntensityForScenario({ values: { o2: 36, p: 1 }, active: ["o2", "p"] }),
    );
  });
});

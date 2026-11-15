import { describe, expect, it } from "vitest";
import { getSoundEnabled, setSoundEnabled, playTelemetryClick, playChamberStageChirp } from "./sound";

describe("Web Audio Telemetry Sound Engine", () => {
  it("manages sound enablement state", () => {
    setSoundEnabled(true);
    expect(getSoundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(getSoundEnabled()).toBe(false);
  });

  it("handles sound playback calls safely in test environment without throwing", () => {
    expect(() => playTelemetryClick()).not.toThrow();
    expect(() => playChamberStageChirp(2)).not.toThrow();
  });
});

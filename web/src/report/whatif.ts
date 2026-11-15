import type { Scenario } from "../engine";

export interface BaselineProfile {
  id: string;
  name: string;
  description: string;
  scenario: Scenario;
}

export const BASELINE_PROFILES: BaselineProfile[] = [
  {
    id: "earth_std",
    name: "Earth Sea-Level (Baseline)",
    description: "21% O₂ · 1.00 atm · 0.20 m/s flow",
    scenario: {
      values: { o2: 21, p: 1.0, flow: 0.20, material: "PMMA" },
      active: ["o2", "p", "flow", "material"],
    },
  },
  {
    id: "iss_std",
    name: "ISS Orbital Module",
    description: "21% O₂ · 1.00 atm · 0.05 m/s forced ventilation",
    scenario: {
      values: { o2: 21, p: 1.0, flow: 0.05, material: "PMMA" },
      active: ["o2", "p", "flow", "material"],
    },
  },
  {
    id: "lunar_std",
    name: "Artemis Exploration Std",
    description: "24% O₂ · 0.70 atm · 0.05 m/s low flow",
    scenario: {
      values: { o2: 24, p: 0.70, flow: 0.05, material: "PMMA" },
      active: ["o2", "p", "flow", "material"],
    },
  },
];

export interface WhatIfDelta {
  o2Delta: number;
  pDelta: number;
  flowDelta: number;
  riskTendency: "elevated" | "reduced" | "equivalent";
  riskSummary: string;
  flammabilityIndexChangePct: number;
}

export function computeWhatIfDelta(proposed: Scenario, baseline: Scenario): WhatIfDelta {
  const propO2 = typeof proposed.values.o2 === "number" ? proposed.values.o2 : 21;
  const baseO2 = typeof baseline.values.o2 === "number" ? baseline.values.o2 : 21;
  const propP = typeof proposed.values.p === "number" ? proposed.values.p : 1.0;
  const baseP = typeof baseline.values.p === "number" ? baseline.values.p : 1.0;
  const propFlow = typeof proposed.values.flow === "number" ? proposed.values.flow : 0.2;
  const baseFlow = typeof baseline.values.flow === "number" ? baseline.values.flow : 0.2;

  const o2Delta = propO2 - baseO2;
  const pDelta = propP - baseP;
  const flowDelta = propFlow - baseFlow;

  // NASA flammability index proxy: (O2% / sqrt(P_atm))
  const propIndex = propO2 / Math.sqrt(Math.max(0.1, propP));
  const baseIndex = baseO2 / Math.sqrt(Math.max(0.1, baseP));
  const flammabilityIndexChangePct = Math.round(((propIndex - baseIndex) / baseIndex) * 100);

  let riskTendency: "elevated" | "reduced" | "equivalent" = "equivalent";
  let riskSummary = "Equivalent flammability profile to baseline";

  if (flammabilityIndexChangePct >= 8 || o2Delta >= 2.0) {
    riskTendency = "elevated";
    riskSummary = `Elevated flammability risk (+${flammabilityIndexChangePct}% index relative to ${baseO2}% O₂ / ${baseP} atm)`;
  } else if (flammabilityIndexChangePct <= -8 || o2Delta <= -2.0) {
    riskTendency = "reduced";
    riskSummary = `Reduced combustion susceptibility (${flammabilityIndexChangePct}% index relative to baseline)`;
  }

  return {
    o2Delta,
    pDelta,
    flowDelta,
    riskTendency,
    riskSummary,
    flammabilityIndexChangePct,
  };
}

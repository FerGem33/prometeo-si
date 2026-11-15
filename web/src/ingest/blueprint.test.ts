import { describe, expect, it } from "vitest";
import type { Pack, Lens } from "../engine/types";
import type { ExtractedVariable, UploadedDoc, UiBlueprint } from "./types";
import {
  suggestDesignPrompts,
  compileUiBlueprint,
  buildLensFromBlueprint,
  VALID_SECTIONS,
} from "./blueprint";

// Sample Battery Corpus fixtures
const batteryDocs: UploadedDoc[] = [
  {
    id: "doc-battery-csv",
    name: "battery_cycling_data.csv",
    kind: "table",
    mediaType: "text/csv",
    bytes: 12000,
    sha256: "abc123battery",
    status: "done",
    uploadedAt: "2026-11-15T10:00:00Z",
    rowCount: 50,
  },
  {
    id: "doc-battery-paper",
    name: "solid_state_electrolyte_study.pdf",
    kind: "paper",
    mediaType: "application/pdf",
    bytes: 450000,
    sha256: "def456battery",
    status: "done",
    uploadedAt: "2026-11-15T10:05:00Z",
    pageCount: 12,
  },
];

const batteryVars: ExtractedVariable[] = [
  {
    id: "spec_capacity",
    label: "Specific Capacity",
    type: "numeric",
    unit: "mAh/g",
    min: 120,
    max: 280,
    sigma: 15,
    include: true,
    citations: [
      {
        docId: "doc-battery-csv",
        docName: "battery_cycling_data.csv",
        kind: "table",
        quote: "Specific Capacity (mAh/g)",
      },
    ],
  },
  {
    id: "c_rate",
    label: "C-Rate",
    type: "numeric",
    unit: "C",
    min: 0.1,
    max: 5.0,
    sigma: 0.2,
    include: true,
    citations: [
      {
        docId: "doc-battery-csv",
        docName: "battery_cycling_data.csv",
        kind: "table",
        quote: "Discharge C-Rate",
      },
    ],
  },
  {
    id: "voltage_nominal",
    label: "Nominal Voltage",
    type: "numeric",
    unit: "V",
    min: 3.2,
    max: 4.2,
    sigma: 0.1,
    include: true,
    citations: [
      {
        docId: "doc-battery-paper",
        docName: "solid_state_electrolyte_study.pdf",
        kind: "paper",
        quote: "Operating cell voltage between 3.2V and 4.2V",
      },
    ],
  },
  {
    id: "electrolyte_type",
    label: "Electrolyte Type",
    type: "categorical",
    unit: null,
    categories: ["LiPF6", "LLZO", "Sulfide-glass"],
    include: true,
    citations: [
      {
        docId: "doc-battery-paper",
        docName: "solid_state_electrolyte_study.pdf",
        kind: "paper",
        quote: "LLZO and sulfide electrolytes tested",
      },
    ],
  },
];

// Sample base Lens (e.g. from demo/lens.json)
const baseDemoLens: Lens = {
  title: "Microgravity combustion evidence for spacecraft and habitat atmospheres",
  kicker: "Scenario assessment",
  subject: "combustion tests",
  unit_of_study: "investigation",
  byline: "Synthesised from NASA Physical Sciences Informatics (PSI) experiment tables",
  disclaimer: "Prometeo compares conditions; not an official NASA product.",
  footer: "Prometeo · NASA Space Apps Challenge 2026",
  presets: [
    {
      id: "lunar_base",
      label: "Lunar base",
      blurb: "Oxygen-enriched atmosphere",
      values: { o2: 30, p: 0.694, material: "PMMA" },
      active: ["o2", "p", "material"],
      source: "NASA Space Apps 2026",
    },
  ],
  default_preset: "lunar_base",
  default_axes: ["o2", "p"],
  evidence: { min_studies: 2 },
  finding_priority: ["never_measured", "above_tested", "below_tested"],
  parts: [
    { id: "atmosphere", label: "Atmosphere", variables: ["o2", "p"] },
  ],
};

// Sample battery Pack
const batteryPack: Pack = {
  contract: "prometeo.pack/1",
  meta: {
    id: "pack-battery",
    title: "Solid State Battery Evidence Pack",
    created_at: "2026-11-15T10:10:00Z",
    source_note: "Synthesized from uploaded documents",
    stats: { studies: 2, records: 40 },
  },
  schema: {
    variables: [
      {
        id: "spec_capacity",
        label: "Specific Capacity",
        unit: "mAh/g",
        type: "num",
        sigma: 15,
        range: [120, 280],
      },
      {
        id: "c_rate",
        label: "C-Rate",
        unit: "C",
        type: "num",
        sigma: 0.2,
        range: [0.1, 5.0],
      },
      {
        id: "voltage_nominal",
        label: "Nominal Voltage",
        unit: "V",
        type: "num",
        sigma: 0.1,
        range: [3.2, 4.2],
      },
      {
        id: "electrolyte_type",
        label: "Electrolyte Type",
        type: "cat",
      },
    ],
    thresholds: { grade_a: 1.0, tolerance: 0.2, closeness_reach: 2.0 },
  },
  sources: [
    { id: "s1", kind: "table", name: "battery_cycling_data.csv", study: "Study-1" },
    { id: "s2", kind: "paper", name: "solid_state_electrolyte_study.pdf", study: "Study-2" },
  ],
  studies: [
    {
      id: "Study-1",
      short: "Cycling",
      title: "Battery Cycling Data",
      summary: { objective: null, subjects: [], conditions: null, variables: ["spec_capacity", "c_rate"], instruments: null },
      attributes: {},
      related: [],
      links: [],
      counts: { records: 30, publications: 1 },
    },
    {
      id: "Study-2",
      short: "Electrolyte",
      title: "Solid State Electrolyte Study",
      summary: { objective: null, subjects: [], conditions: null, variables: ["voltage_nominal", "electrolyte_type"], instruments: null },
      attributes: {},
      related: [],
      links: [],
      counts: { records: 10, publications: 1 },
    },
  ],
  records: [],
  claims: [],
};

describe("suggestDesignPrompts", () => {
  it("mentions real variable labels from battery corpus with zero NASA combustion terms", () => {
    const suggestions = suggestDesignPrompts(batteryDocs, batteryVars);

    expect(suggestions.length).toBeGreaterThanOrEqual(3);

    // Should mention real variable labels extracted from the corpus
    const combined = suggestions.join(" ");
    expect(
      combined.includes("Specific Capacity") ||
        combined.includes("C-Rate") ||
        combined.includes("Nominal Voltage") ||
        combined.includes("Electrolyte Type")
    ).toBe(true);

    // Zero combustion / NASA terms
    const forbiddenTerms = [
      "flame",
      "combustion",
      "microgravity",
      "nasa",
      "pmma",
      "nomex",
      "oxygen",
      "o2",
      "cabin",
      "spacecraft",
      "lunar",
      "freefall",
    ];
    for (const term of forbiddenTerms) {
      expect(combined.toLowerCase()).not.toContain(term);
    }
  });

  it("handles empty or single variable gracefully without throwing", () => {
    const emptySuggestions = suggestDesignPrompts([], []);
    expect(emptySuggestions.length).toBeGreaterThanOrEqual(2);

    const singleVarSuggestions = suggestDesignPrompts(batteryDocs, [batteryVars[0]]);
    expect(singleVarSuggestions.length).toBeGreaterThanOrEqual(2);
    expect(singleVarSuggestions.join(" ")).toContain("Specific Capacity");
  });
});

describe("compileUiBlueprint", () => {
  it("compiles Spanish directive prioritizing gaps and graph, compact density, without ML card", () => {
    const blueprint = compileUiBlueprint(
      "Prioriza mapa de brechas y grafo entre estudios; vista compacta sin tarjeta ML",
      batteryDocs,
      batteryVars
    );

    // Section order should place gaps and graph first
    expect(blueprint.sectionOrder.slice(0, 2)).toEqual(["gaps", "graph"]);
    // Must contain all valid sections exactly once
    expect(new Set(blueprint.sectionOrder)).toEqual(new Set(VALID_SECTIONS));
    expect(blueprint.sectionOrder.length).toBe(VALID_SECTIONS.length);

    // Compact density and ML card hidden
    expect(blueprint.density).toBe("compact");
    expect(blueprint.hideMlCard).toBe(true);

    // defaultAxes must be 0, 1, or 2 valid NUMERIC variables from batteryVars
    expect(blueprint.defaultAxes.length).toBeLessThanOrEqual(2);
    for (const axisId of blueprint.defaultAxes) {
      const v = batteryVars.find((x) => x.id === axisId);
      expect(v).toBeDefined();
      expect(v?.type).toBe("numeric");
    }
  });

  it("compiles English directive with layout and promotes mentioned variable names to highlightedVariables and defaultAxes", () => {
    const blueprint = compileUiBlueprint(
      "Highlight Nominal Voltage and Specific Capacity with grid layout; detailed view",
      batteryDocs,
      batteryVars
    );

    expect(blueprint.variablesLayout).toBe("grid");
    expect(blueprint.density).toBe("editorial");

    // Mentioned variables should be promoted first in highlightedVariables
    expect(blueprint.highlightedVariables.slice(0, 2)).toEqual([
      "voltage_nominal",
      "spec_capacity",
    ]);

    // And defaultAxes should lead with the mentioned numeric variables
    expect(blueprint.defaultAxes.slice(0, 2)).toEqual([
      "voltage_nominal",
      "spec_capacity",
    ]);
  });

  it("respects presetFlags when provided", () => {
    const blueprint = compileUiBlueprint(
      "Standard overview",
      batteryDocs,
      batteryVars,
      ["gaps", "compact"]
    );

    expect(blueprint.sectionOrder[0]).toBe("gaps");
    expect(blueprint.density).toBe("compact");
  });

  it("strictly validates remoteBlueprint against allowlists and discards invalid entries silently", () => {
    const remoteBlueprint: Partial<UiBlueprint> = {
      title: "Custom Remote Title",
      density: "compact",
      variablesLayout: "list",
      // @ts-expect-error testing invalid section injection
      sectionOrder: ["gaps", "invalid_section", "graph", "another_fake"],
      // "non_existent_var" does not exist; "electrolyte_type" is categorical (invalid for defaultAxes)
      defaultAxes: ["non_existent_var", "electrolyte_type", "spec_capacity"],
      highlightedVariables: ["non_existent_var", "c_rate"],
      hideMlCard: true,
    };

    const blueprint = compileUiBlueprint(
      "fallback instruction",
      batteryDocs,
      batteryVars,
      [],
      remoteBlueprint
    );

    expect(blueprint.title).toBe("Custom Remote Title");
    expect(blueprint.density).toBe("compact");
    expect(blueprint.variablesLayout).toBe("list");

    // Invalid sections discarded; valid sections preserved and completed to full VALID_SECTIONS
    expect(blueprint.sectionOrder).not.toContain("invalid_section");
    expect(blueprint.sectionOrder).not.toContain("another_fake");
    expect(blueprint.sectionOrder.slice(0, 2)).toEqual(["gaps", "graph"]);
    expect(new Set(blueprint.sectionOrder)).toEqual(new Set(VALID_SECTIONS));

    // defaultAxes must silently discard non_existent_var AND non-numeric electrolyte_type
    expect(blueprint.defaultAxes).toEqual(["spec_capacity"]);

    // highlightedVariables must silently discard non_existent_var
    expect(blueprint.highlightedVariables).toContain("c_rate");
    expect(blueprint.highlightedVariables).not.toContain("non_existent_var");
  });

  it("enforces pre-flight ruling on defaultAxes: 0 numeric vars -> [], 1 numeric var -> [id]", () => {
    // 0 numeric variables
    const zeroNumVars: ExtractedVariable[] = [batteryVars[3]]; // only electrolyte_type (categorical)
    const bpZero = compileUiBlueprint("Overview", batteryDocs, zeroNumVars);
    expect(bpZero.defaultAxes).toEqual([]);

    // 1 numeric variable
    const oneNumVars: ExtractedVariable[] = [batteryVars[0], batteryVars[3]]; // spec_capacity + categorical
    const bpOne = compileUiBlueprint("Overview", batteryDocs, oneNumVars);
    expect(bpOne.defaultAxes).toEqual(["spec_capacity"]);
  });

  it("prioritizes gaps before graph and does not falsely match map on 'gap map'", () => {
    const blueprint = compileUiBlueprint(
      "Prioritize gap map and graph",
      batteryDocs,
      batteryVars
    );

    // Section order should place gaps and graph first, not map
    expect(blueprint.sectionOrder.slice(0, 2)).toEqual(["gaps", "graph"]);
    // map should appear later in unprioritized sections
    const mapIndex = blueprint.sectionOrder.indexOf("map");
    const gapsIndex = blueprint.sectionOrder.indexOf("gaps");
    const graphIndex = blueprint.sectionOrder.indexOf("graph");
    expect(gapsIndex).toBeLessThan(graphIndex);
    expect(graphIndex).toBeLessThan(mapIndex);
  });

  it("does not falsely promote variable 'rate' from the word 'Generate', but promotes single-char 'p' when mentioned", () => {
    const varsWithRateAndP: ExtractedVariable[] = [
      {
        id: "temperature",
        label: "Temperature",
        type: "numeric",
        unit: "K",
        include: true,
        citations: [],
      },
      {
        id: "rate",
        label: "Reaction Rate",
        type: "numeric",
        unit: "mol/s",
        include: true,
        citations: [],
      },
      {
        id: "p",
        label: "Pressure",
        type: "numeric",
        unit: "atm",
        include: true,
        citations: [],
      },
    ];

    // "Generate a compact view" contains "rate" inside "Generate"
    const bpGenerate = compileUiBlueprint(
      "Generate a compact view",
      batteryDocs,
      varsWithRateAndP
    );
    // rate should NOT be promoted as the first highlighted variable or first default axis
    expect(bpGenerate.highlightedVariables[0]).not.toBe("rate");
    expect(bpGenerate.defaultAxes[0]).not.toBe("rate");

    // Single-char variable 'p' explicitly mentioned should be promoted
    const bpP = compileUiBlueprint(
      "Focus on p and temperature",
      batteryDocs,
      varsWithRateAndP
    );
    expect(bpP.highlightedVariables.slice(0, 2)).toEqual(["p", "temperature"]);
    expect(bpP.defaultAxes.slice(0, 2)).toEqual(["p", "temperature"]);
  });
});

describe("buildLensFromBlueprint", () => {
  it("builds valid Lens matching engine requirements with dynamic corpus metadata and parts", () => {
    const blueprint = compileUiBlueprint(
      "Prioriza mapa de brechas y grafo entre estudios; vista compacta sin tarjeta ML",
      batteryDocs,
      batteryVars
    );

    const lens = buildLensFromBlueprint(blueprint, batteryPack, batteryVars, baseDemoLens);

    // Title and kicker reflected
    expect(lens.title).toBe(blueprint.title);
    expect(lens.kicker).toBe(blueprint.kicker);

    // Dynamic byline reflecting uploaded corpus
    expect(lens.byline).toContain("2 documents");
    expect(lens.byline).toContain("2 studies");

    // Presets must be [] for custom corpus (combustion demo presets discarded)
    expect(lens.presets).toEqual([]);
    expect(lens.default_preset).toBeUndefined();

    // default_axes matches blueprint and numeric variables in pack
    expect(lens.default_axes.length).toBeLessThanOrEqual(2);
    for (const axis of lens.default_axes) {
      const v = batteryPack.schema.variables.find((x) => x.id === axis);
      expect(v).toBeDefined();
      expect(v?.type).toBe("num");
    }

    // Parts must group variables cleanly
    expect(lens.parts).toBeDefined();
    expect(lens.parts!.length).toBeGreaterThan(0);
    for (const part of lens.parts!) {
      expect(part.id).toBeTruthy();
      expect(part.label).toBeTruthy();
      expect(part.variables.length).toBeGreaterThan(0);
      for (const varId of part.variables) {
        expect(batteryPack.schema.variables.some((x) => x.id === varId)).toBe(true);
      }
    }

    // Inherits stable base config like finding_priority and min_studies
    expect(lens.evidence.min_studies).toBe(2);
    expect(lens.finding_priority).toEqual(baseDemoLens.finding_priority);

    // Custom corpus must synthesize corpus-specific sample questions and NOT inherit NASA O2/Nomex questions
    const questions = lens.questions ?? [];
    const joinedQ = questions.join(" ");
    expect(joinedQ).not.toMatch(/Nomex|PMMA/i);
    expect(questions.length).toBeGreaterThan(0);
  });

  it("handles empty or 0-numeric packs cleanly", () => {
    const emptyPack: Pack = {
      ...batteryPack,
      schema: {
        variables: [{ id: "cat1", label: "Category", type: "cat" }],
        thresholds: { grade_a: 1.0, tolerance: 0.2, closeness_reach: 2.0 },
      },
      sources: [],
      studies: [],
    };
    const bp = compileUiBlueprint("Overview", [], []);
    const lens = buildLensFromBlueprint(bp, emptyPack, []);

    expect(lens.default_axes).toEqual([]);
    expect(lens.presets).toEqual([]);
    expect(lens.title).toBeTruthy();
  });
});

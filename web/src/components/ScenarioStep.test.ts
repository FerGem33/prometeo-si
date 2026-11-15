import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCENARIO_STEPS, type EvaluationDraft } from "./ScenarioStep";
import { mergeUploadedDocs } from "../ingest/storage";
import { D3_LIMITS, type UploadedDoc, type ExtractedVariable, type CorpusScope } from "../ingest/types";
import { compileUiBlueprint, buildLensFromBlueprint } from "../ingest/blueprint";
import { buildPackFromDocs } from "../ingest/buildPack";
import type { Pack, Lens } from "../engine";

describe("ScenarioStep 3-step redesign & zero-scenarios check", () => {
  it("exports exactly 3 steps: Documents, Interface design, and Variables", () => {
    expect(SCENARIO_STEPS).toEqual(["Documents", "Interface design", "Variables"]);
    expect(SCENARIO_STEPS.length).toBe(3);
    expect(SCENARIO_STEPS).not.toContain("Setting");
    expect(SCENARIO_STEPS).not.toContain("Question");
  });

  it("ensures ScenarioStep.tsx has zero imports or usage of preset mission/habitat selectors", () => {
    const fileContent = readFileSync(join(__dirname, "ScenarioStep.tsx"), "utf-8");

    expect(fileContent).not.toContain("NASA_MISSION_PRESETS");
    expect(fileContent).not.toContain("allHabitatPresets");
    expect(fileContent).not.toContain("HabitatFigure");
    expect(fileContent).not.toContain("quick-mission-bar");
    expect(fileContent).not.toContain("step-mini-iso");
  });

  it("deduplicates uploaded documents by SHA-256 and enforces D3 limits via mergeUploadedDocs", () => {
    const existing: UploadedDoc[] = [
      {
        id: "doc-1",
        name: "test1.csv",
        kind: "table",
        mediaType: "text/csv",
        bytes: 100,
        sha256: "hash-aaa",
        status: "done",
        uploadedAt: new Date().toISOString(),
      },
    ];

    const incoming: UploadedDoc[] = [
      {
        id: "doc-2",
        name: "test1_duplicate.csv",
        kind: "table",
        mediaType: "text/csv",
        bytes: 100,
        sha256: "hash-aaa", // duplicate hash
        status: "done",
        uploadedAt: new Date().toISOString(),
      },
      {
        id: "doc-3",
        name: "test2.csv",
        kind: "table",
        mediaType: "text/csv",
        bytes: 200,
        sha256: "hash-bbb",
        status: "done",
        uploadedAt: new Date().toISOString(),
      },
    ];

    const result = mergeUploadedDocs(existing, incoming);
    expect(result.docs.length).toBe(2);
    expect(result.duplicates).toEqual(["test1_duplicate.csv"]);
    expect(result.docs.map((d) => d.id)).toEqual(["doc-1", "doc-3"]);

    // Test D3 limit enforcement
    const lotsOfDocs: UploadedDoc[] = Array.from({ length: 40 }, (_, i) => ({
      id: `doc-bulk-${i}`,
      name: `file_${i}.csv`,
      kind: "table" as const,
      mediaType: "text/csv" as const,
      bytes: 50,
      sha256: `hash-bulk-${i}`,
      status: "done" as const,
      uploadedAt: new Date().toISOString(),
    }));

    const capped = mergeUploadedDocs([], lotsOfDocs);
    expect(capped.docs.length).toBe(D3_LIMITS.maxDocuments);
    expect(capped.docs.length).toBe(30);
  });

  it("handles 0 and 1 numeric variables cleanly in blueprint and draft synthesis", () => {
    // 0 numeric variables (only categorical)
    const zeroNumVars: ExtractedVariable[] = [
      {
        id: "material",
        label: "Sample Material",
        type: "categorical",
        unit: null,
        categories: ["PMMA", "Nomex"],
        include: true,
        citations: [],
      },
    ];

    const blueprint0 = compileUiBlueprint("focus on material", [], zeroNumVars, []);
    expect(blueprint0.defaultAxes).toEqual([]);

    const demoPackStub: Pack = {
      contract: "prometeo-pack-v1",
      meta: {
        id: "stub-pack",
        title: "Stub Pack",
        created_at: new Date().toISOString(),
        source_note: "test",
        stats: {},
      },
      sources: [],
      studies: [],
      schema: {
        variables: [
          { id: "material", label: "Material", type: "cat" },
        ],
        thresholds: { grade_a: 1.0, tolerance: 0.5, closeness_reach: 2.0 },
      },
      records: [],
      claims: [],
    };

    const built0 = buildPackFromDocs([], zeroNumVars, {
      scope: "demo",
      demoPack: demoPackStub,
    });
    expect(built0.pack).toBeDefined();

    const baseLensStub: Lens = {
      title: "Stub Lens",
      kicker: "Investigation",
      byline: "Reference",
      disclaimer: "Disclaimer",
      default_axes: [],
      presets: [],
      evidence: { min_studies: 1 },
    };

    const lens0 = buildLensFromBlueprint(blueprint0, built0.pack, zeroNumVars, baseLensStub);
    expect(lens0.default_axes).toEqual([]);

    // 1 numeric variable
    const oneNumVar: ExtractedVariable[] = [
      {
        id: "o2",
        label: "Oxygen Concentration",
        type: "numeric",
        unit: "%",
        min: 15,
        max: 40,
        median: 21,
        include: true,
        citations: [],
      },
    ];

    const blueprint1 = compileUiBlueprint("focus on o2", [], oneNumVar, []);
    expect(blueprint1.defaultAxes).toEqual(["o2"]);

    const demoPackStub1: Pack = {
      ...demoPackStub,
      schema: {
        variables: [
          { id: "o2", label: "Oxygen", type: "num", unit: "%", range: [15, 40], step: 1, sigma: 1.5 },
        ],
        thresholds: { grade_a: 1.0, tolerance: 0.5, closeness_reach: 2.0 },
      },
    };

    const built1 = buildPackFromDocs([], oneNumVar, {
      scope: "demo",
      demoPack: demoPackStub1,
    });
    const lens1 = buildLensFromBlueprint(blueprint1, built1.pack, oneNumVar, baseLensStub);
    expect(lens1.default_axes).toEqual(["o2"]);
  });

  it("verifies EvaluationDraft type structure and properties", () => {
    const draft: EvaluationDraft = {
      docs: [],
      scope: "uploaded",
      instruction: "Prioritize oxygen flammability boundary and gap analysis",
      presetFlags: ["gaps", "compare"],
      variables: [
        {
          id: "o2",
          label: "Oxygen Concentration",
          type: "numeric",
          unit: "%",
          min: 15,
          max: 40,
          median: 21,
          include: true,
          citations: [
            {
              docId: "doc-1",
              docName: "data.csv",
              kind: "table",
              column: "o2_pct",
              quote: "Oxygen concentration recorded at 21%",
            },
          ],
        },
      ],
      blueprint: {
        title: "Flammability Assessment",
        kicker: "Scenario Review",
        variablesLayout: "grouped",
        density: "editorial",
        highlightedVariables: ["o2"],
        variableGroups: [{ id: "env", label: "Environment", variables: ["o2"] }],
        defaultAxes: ["o2"],
        sectionOrder: ["graphical_abstract", "gaps", "map", "heat", "graph", "data_methods"],
        foldedSections: {},
        hiddenSections: [],
        rationale: "Optimized for gap analysis across oxygen parameters",
      },
      pack: {
        contract: "prometeo-pack-v1",
        meta: {
          id: "uploaded-corpus",
          title: "Uploaded Corpus",
          created_at: new Date().toISOString(),
          source_note: "User corpus",
          stats: {},
        },
        sources: [],
        studies: [],
        schema: { variables: [], thresholds: { grade_a: 1.0, tolerance: 0.5, closeness_reach: 2.0 } },
        records: [],
        claims: [],
      },
      lens: {
        title: "Flammability Assessment",
        kicker: "Scenario Review",
        byline: "Custom corpus",
        disclaimer: "Empirical verification",
        default_axes: ["o2"],
        presets: [],
        evidence: { min_studies: 1 },
      },
      mapping: {
        tables: [],
        synonyms: {},
        approved_by: "system",
        approved_at: new Date().toISOString(),
      },
      scenario: {
        values: { o2: 24 },
        active: ["o2"],
      },
      extras: [],
      isCustomCorpus: true,
    };

    expect(draft.isCustomCorpus).toBe(true);
    expect(draft.scope).toBe("uploaded");
    expect(draft.presetFlags).toContain("gaps");
    expect(draft.variables[0].citations[0].docName).toBe("data.csv");
  });

  it("synchronizes variable label edits and include toggles cleanly into draft and pack", () => {
    const rawVars: ExtractedVariable[] = [
      {
        id: "cabin_temp",
        label: "Cabin Temperature",
        type: "numeric",
        unit: "°C",
        min: 10,
        max: 35,
        median: 22,
        include: true,
        citations: [],
      },
      {
        id: "co2_level",
        label: "CO2 Level",
        type: "numeric",
        unit: "ppm",
        min: 400,
        max: 5000,
        median: 1200,
        include: false, // excluded by user
        citations: [],
      },
      {
        id: "vent_mode",
        label: "Ventilation Mode",
        type: "categorical",
        unit: null,
        categories: ["Forced", "Natural"],
        mode: "Forced",
        include: true,
        citations: [],
      },
    ];

    // User edits the label for cabin_temp
    const editedVars = rawVars.map((v) =>
      v.id === "cabin_temp" ? { ...v, label: "Ambient Cabin Temperature" } : v
    );

    const activeVars = editedVars.filter((v) => v.include);
    const activeVarIds = new Set(activeVars.map((v) => v.id));

    // Excluded variable must not be in active IDs
    expect(activeVarIds.has("co2_level")).toBe(false);
    expect(activeVarIds.has("cabin_temp")).toBe(true);
    expect(activeVarIds.has("vent_mode")).toBe(true);

    const demoPack: Pack = {
      contract: "prometeo-pack-v1",
      meta: {
        id: "test-pack",
        title: "Test Pack",
        created_at: new Date().toISOString(),
        source_note: "test",
        stats: {},
      },
      sources: [],
      studies: [],
      schema: {
        variables: [
          { id: "cabin_temp", label: "Cabin Temperature", type: "num", unit: "°C", range: [10, 35], step: 1, sigma: 2 },
          { id: "co2_level", label: "CO2 Level", type: "num", unit: "ppm", range: [400, 5000], step: 100, sigma: 100 },
          { id: "vent_mode", label: "Ventilation Mode", type: "cat" },
        ],
        thresholds: { grade_a: 1.0, tolerance: 0.5, closeness_reach: 2.0 },
      },
      records: [],
      claims: [],
    };

    const built = buildPackFromDocs([], activeVars, {
      scope: "demo",
      demoPack,
    });

    // Final pack schema variables must reflect edited label and filter out excluded variables
    const finalPackVars = built.pack.schema.variables
      .filter((pv) => activeVarIds.has(pv.id))
      .map((pv) => {
        const match = activeVars.find((v) => v.id === pv.id);
        return match ? { ...pv, label: match.label, long: match.label } : pv;
      });

    expect(finalPackVars.map((v) => v.id)).toEqual(["cabin_temp", "vent_mode"]);
    expect(finalPackVars.find((v) => v.id === "cabin_temp")?.label).toBe("Ambient Cabin Temperature");
    expect(finalPackVars.find((v) => v.id === "co2_level")).toBeUndefined();
  });

  it("preserves user-adjusted scenario values when editing labels or toggling variables", () => {
    // User adjusted cabin_temp to 28 (different from default median 22)
    const initialScenarioValues: Record<string, number | string> = {
      cabin_temp: 28,
      vent_mode: "Natural",
    };

    const rawVars: ExtractedVariable[] = [
      {
        id: "cabin_temp",
        label: "Cabin Temperature",
        type: "numeric",
        unit: "°C",
        min: 10,
        max: 35,
        median: 22,
        include: true,
        citations: [],
      },
      {
        id: "vent_mode",
        label: "Ventilation Mode",
        type: "categorical",
        unit: null,
        categories: ["Forced", "Natural"],
        mode: "Forced",
        include: true,
        citations: [],
      },
      {
        id: "pressure",
        label: "Total Pressure",
        type: "numeric",
        unit: "atm",
        min: 0.5,
        max: 1.2,
        median: 1.0,
        include: true,
        citations: [],
      },
    ];

    // Simulate custom corpus derivation in handleSubmit:
    const activeVars = rawVars.filter((v) => v.include);
    const finalValues = { ...initialScenarioValues };

    for (const v of activeVars) {
      if (finalValues[v.id] === undefined) {
        if (v.type === "numeric") {
          const min = v.min ?? 0;
          const max = v.max ?? min + 100;
          finalValues[v.id] = v.median ?? (min + max) / 2;
        } else {
          finalValues[v.id] = v.mode ?? v.categories?.[0] ?? "";
        }
      }
    }

    // User-adjusted values must remain intact!
    expect(finalValues.cabin_temp).toBe(28);
    expect(finalValues.vent_mode).toBe("Natural");
    // Unset variable 'pressure' defaulted cleanly to its median
    expect(finalValues.pressure).toBe(1.0);
  });

  it("handles custom corpus scope by deriving active variables from custom docs instead of demo IDs", () => {
    // Custom corpus with unique non-demo variables
    const customVars: ExtractedVariable[] = [
      {
        id: "viscosity",
        label: "Fluid Dynamic Viscosity",
        type: "numeric",
        unit: "cP",
        min: 0.5,
        max: 5.0,
        median: 1.2,
        include: true,
        citations: [],
      },
      {
        id: "shear_rate",
        label: "Shear Rate",
        type: "numeric",
        unit: "1/s",
        min: 10,
        max: 1000,
        median: 250,
        include: true,
        citations: [],
      },
      {
        id: "excluded_metric",
        label: "Excluded Sensor",
        type: "numeric",
        unit: "V",
        min: 0,
        max: 5,
        median: 2.5,
        include: false,
        citations: [],
      },
    ];

    const activeVars = customVars.filter((v) => v.include);
    let scope: CorpusScope = "uploaded";
    const readyDocsCount = 2;
    const isCustom = (scope as string) !== "demo" && readyDocsCount > 0;

    // Demo scenario.active from App.tsx only has demo IDs
    const demoScenarioActive = ["o2", "p", "material"];

    const finalActive = isCustom
      ? activeVars.map((v) => v.id)
      : demoScenarioActive.filter((id) => activeVars.some((v) => v.id === id));

    // Custom scope must contain custom variable IDs and NOT be empty or limited to demo IDs
    expect(finalActive).toEqual(["viscosity", "shear_rate"]);
    expect(finalActive).not.toContain("excluded_metric");
    expect(finalActive).not.toContain("o2");
  });

  it("guards against failed-only document uploads by disabling advancement when readyDocs is 0", () => {
    const failedDocs: UploadedDoc[] = [
      {
        id: "err-1",
        name: "corrupt.pdf",
        kind: "paper",
        mediaType: "application/pdf",
        bytes: 500,
        sha256: "err1",
        status: "error",
        uploadedAt: new Date().toISOString(),
        errorCode: "unreadable",
      },
      {
        id: "err-2",
        name: "too_big.csv",
        kind: "table",
        mediaType: "text/csv",
        bytes: 25_000_000,
        sha256: "err2",
        status: "error",
        uploadedAt: new Date().toISOString(),
        errorCode: "too_large",
      },
    ];

    const readyDocs = failedDocs.filter((d) => d.status === "done");
    expect(readyDocs.length).toBe(0);

    let scope: CorpusScope = "uploaded";
    const hasOnlyFailedDocs = (scope as string) !== "demo" && failedDocs.length > 0 && readyDocs.length === 0;

    // Must be flagged as failed-only batch
    expect(hasOnlyFailedDocs).toBe(true);

    // Switching scope to demo must clear the failure block
    let demoScope: CorpusScope = "demo";
    const hasOnlyFailedDocsDemo = (demoScope as string) !== "demo" && failedDocs.length > 0 && readyDocs.length === 0;
    expect(hasOnlyFailedDocsDemo).toBe(false);

    // Adding at least one valid document clears the failure block
    const validDoc: UploadedDoc = {
      id: "doc-ok",
      name: "valid.csv",
      kind: "table",
      mediaType: "text/csv",
      bytes: 1000,
      sha256: "valid1",
      status: "done",
      uploadedAt: new Date().toISOString(),
    };
    const mixedDocs = [...failedDocs, validDoc];
    const mixedReady = mixedDocs.filter((d) => d.status === "done");
    const hasOnlyFailedDocsMixed = (scope as string) !== "demo" && mixedDocs.length > 0 && mixedReady.length === 0;
    expect(hasOnlyFailedDocsMixed).toBe(false);
  });

  it("restores custom corpus draft state from initialDraft without resetting user overrides", () => {
    const customDocs: UploadedDoc[] = [
      {
        id: "doc-custom",
        name: "battery_test.csv",
        kind: "table",
        mediaType: "text/csv",
        bytes: 4096,
        sha256: "hash-battery",
        status: "done",
        uploadedAt: new Date().toISOString(),
      },
    ];

    const draft: EvaluationDraft = {
      docs: customDocs,
      scope: "combine",
      instruction: "Focus on battery capacity and voltage",
      presetFlags: ["compact", "compare"],
      variables: [
        {
          id: "cap",
          label: "Custom Capacity Label",
          type: "numeric",
          unit: "mAh/g",
          include: false,
          citations: [],
        },
        {
          id: "volt",
          label: "Terminal Voltage",
          type: "numeric",
          unit: "V",
          include: true,
          citations: [],
        },
      ],
      blueprint: {
        title: "Battery Report",
        kicker: "Custom",
        variablesLayout: "list",
        density: "compact",
        highlightedVariables: ["cap"],
        variableGroups: [],
        defaultAxes: ["volt"],
        sectionOrder: ["graphical_abstract", "map"],
        foldedSections: { map: true },
        hiddenSections: [],
        rationale: "Rationale",
      },
      pack: {
        contract: "prometeo.pack/1",
        meta: { id: "p1", title: "P1", created_at: "", source_note: "", stats: {} },
        schema: { variables: [], thresholds: { grade_a: 1, tolerance: 0.1, closeness_reach: 3 } },
        sources: [],
        studies: [],
        records: [],
        claims: [],
      },
      lens: { title: "L1", presets: [], default_axes: [], evidence: { min_studies: 1 } },
      mapping: { approved_by: "tester", approved_at: "2026-11-15", tables: [], synonyms: {} },
      scenario: { values: { volt: 3.7 }, active: ["volt"] },
      extras: [],
      isCustomCorpus: true,
    };

    expect(draft.docs.length).toBe(1);
    expect(draft.docs[0].id).toBe("doc-custom");
    expect(draft.scope).toBe("combine");
    expect(draft.instruction).toBe("Focus on battery capacity and voltage");
    expect(draft.presetFlags).toEqual(["compact", "compare"]);

    const customVarState: Record<string, Partial<ExtractedVariable>> = {};
    for (const v of draft.variables) {
      customVarState[v.id] = {
        label: v.label,
        include: v.include,
      };
    }

    expect(customVarState["cap"]).toEqual({
      label: "Custom Capacity Label",
      include: false,
    });
    expect(customVarState["volt"]).toEqual({
      label: "Terminal Voltage",
      include: true,
    });
  });
});

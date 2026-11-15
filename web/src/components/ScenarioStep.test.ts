import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCENARIO_STEPS, type EvaluationDraft } from "./ScenarioStep";
import { mergeUploadedDocs } from "../ingest/storage";
import { D3_LIMITS, type UploadedDoc, type ExtractedVariable } from "../ingest/types";
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
});

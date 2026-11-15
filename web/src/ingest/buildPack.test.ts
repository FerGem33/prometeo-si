import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Mapping } from "../components/ctx";
import {
  evidenceLevels,
  findings,
  gaps,
  graph,
  rank,
  type Lens,
  type Pack,
} from "../engine";
import { summarizeOutcomes } from "../report/ml-card";
import { buildPackFromDocs, extractVariablesFromDocs } from "./buildPack";
import type {
  UploadedDoc,
  VariableProposalRemote,
} from "./types";

function createSampleDocs(): { csvDoc: UploadedDoc; pdfDoc: UploadedDoc } {
  const csvDoc: UploadedDoc = {
    id: "doc-csv-battery",
    name: "battery_tests.csv",
    kind: "table",
    mediaType: "text/csv",
    bytes: 2048,
    sha256: "97933ee9ae0b9ebc6b948a67485a0fe2f8218f753253a4f2be93c40d374c44e4",
    status: "done",
    uploadedAt: "2026-11-15T10:00:00.000Z",
    rowCount: 3,
    table: {
      headers: ["Temperature (°C)", "Voltage (V)", "Cathode", "Capacity_mAh_g"],
      columns: [
        {
          name: "Temperature (°C)",
          label: "Temperature",
          unit: "°C",
          type: "numeric",
          nonEmptyCount: 3,
          numericCount: 3,
          min: 20,
          max: 45,
          median: 30,
          sampleCells: [
            { row: 1, raw: "25" },
            { row: 2, raw: "30" },
            { row: 3, raw: "45" },
          ],
        },
        {
          name: "Voltage (V)",
          label: "Voltage",
          unit: "V",
          type: "numeric",
          nonEmptyCount: 3,
          numericCount: 3,
          min: 3.0,
          max: 4.2,
          median: 3.7,
          sampleCells: [
            { row: 1, raw: "3.2" },
            { row: 2, raw: "3.7" },
            { row: 3, raw: "4.2" },
          ],
        },
        {
          name: "Cathode",
          label: "Cathode",
          unit: null,
          type: "categorical",
          nonEmptyCount: 3,
          numericCount: 0,
          categories: ["NMC", "LFP"],
          mode: "NMC",
          sampleCells: [
            { row: 1, raw: "NMC" },
            { row: 2, raw: "LFP" },
            { row: 3, raw: "NMC" },
          ],
        },
        {
          name: "Capacity_mAh_g",
          label: "Capacity_mAh_g",
          unit: "mAh/g",
          type: "numeric",
          nonEmptyCount: 3,
          numericCount: 3,
          min: 140,
          max: 180,
          median: 160,
          sampleCells: [
            { row: 1, raw: "150" },
            { row: 2, raw: "140" },
            { row: 3, raw: "180" },
          ],
        },
      ],
      rows: [
        { row: 1, values: ["25", "3.2", "NMC", "150"] },
        { row: 2, values: ["30", "3.7", "LFP", "140"] },
        { row: 3, values: ["45", "4.2", "NMC", "180"] },
      ],
    },
  };

  const pdfDoc: UploadedDoc = {
    id: "doc-pdf-paper",
    name: "battery_electrochemistry_paper.pdf",
    kind: "paper",
    mediaType: "application/pdf",
    bytes: 14500,
    sha256: "4a663292bd3f65201943cc71bd661a70383639276a9176f64105b285bf0b6deb",
    status: "done",
    uploadedAt: "2026-11-15T10:01:00.000Z",
    pageCount: 6,
    paper: {
      title: "Electrochemistry of Advanced Cathodes in Carbonate Solvents",
      doi: "10.1016/j.jpowsour.2026.04",
      year: 2026,
      pageCount: 6,
      pages: [
        {
          page: 1,
          text: "In this work, the operating Temperature was maintained at 25–60 °C across thermal cycling.",
        },
        {
          page: 3,
          text: "The formulation used Electrolyte: LiPF6 with vinylene carbonate additive.",
        },
      ],
      findings: [
        {
          label: "Temperature",
          rawName: "Temperature",
          type: "numeric",
          unit: "°C",
          min: 25,
          max: 60,
          values: [25, 60],
          page: 1,
          quote: "In this work, the operating Temperature was maintained at 25–60 °C across thermal cycling.",
        },
        {
          label: "Electrolyte",
          rawName: "Electrolyte",
          type: "categorical",
          unit: null,
          values: [],
          categories: ["LiPF6"],
          page: 3,
          quote: "The formulation used Electrolyte: LiPF6 with vinylene carbonate additive.",
        },
      ],
    },
  };

  return { csvDoc, pdfDoc };
}

const minimalLens: Lens = {
  title: "Battery Ingestion Lens",
  presets: [],
  default_axes: ["temperature", "voltage"],
  evidence: { min_studies: 1 },
};

describe("extractVariablesFromDocs", () => {
  it("extracts variables from CSV table and PDF paper docs with evidence citations and realistic ranges", () => {
    const { csvDoc, pdfDoc } = createSampleDocs();
    const vars = extractVariablesFromDocs([csvDoc, pdfDoc]);

    // Check CSV variables appear
    const tempVar = vars.find((v) => v.id === "temperature");
    expect(tempVar).toBeDefined();
    expect(tempVar?.type).toBe("numeric");
    expect(tempVar?.unit).toBe("°C");
    // Range merged across CSV (20–45) and PDF (25–60) => 20 to 60
    expect(tempVar?.min).toBe(20);
    expect(tempVar?.max).toBe(60);
    // Sigma computed with Math.max((hi - lo) * 0.15, 1e-3) => (60 - 20) * 0.15 = 6
    expect(tempVar?.sigma).toBeCloseTo(6, 4);

    // Citations trace back to CSV row/col and PDF page/quote
    expect(tempVar?.citations.length).toBeGreaterThanOrEqual(2);
    const tableCitation = tempVar?.citations.find((c) => c.kind === "table");
    const paperCitation = tempVar?.citations.find((c) => c.kind === "paper");
    expect(tableCitation).toBeDefined();
    expect(tableCitation?.docId).toBe("doc-csv-battery");
    expect(tableCitation?.column).toBe("Temperature (°C)");
    expect(tableCitation?.row).toBe(1);

    expect(paperCitation).toBeDefined();
    expect(paperCitation?.docId).toBe("doc-pdf-paper");
    expect(paperCitation?.page).toBe(1);
    expect(paperCitation?.quote).toContain("25–60 °C");

    // Check voltage variable from CSV
    const voltVar = vars.find((v) => v.id === "voltage");
    expect(voltVar).toBeDefined();
    expect(voltVar?.type).toBe("numeric");
    expect(voltVar?.min).toBe(3.0);
    expect(voltVar?.max).toBe(4.2);
    expect(voltVar?.sigma).toBeCloseTo((4.2 - 3.0) * 0.15, 4);

    // Check categorical cathode variable
    const cathodeVar = vars.find((v) => v.id === "cathode");
    expect(cathodeVar).toBeDefined();
    expect(cathodeVar?.type).toBe("categorical");
    expect(cathodeVar?.categories).toEqual(expect.arrayContaining(["NMC", "LFP"]));
    expect(cathodeVar?.mode).toBe("NMC");

    // Check categorical electrolyte variable from PDF
    const electrolyteVar = vars.find((v) => v.id === "electrolyte");
    expect(electrolyteVar).toBeDefined();
    expect(electrolyteVar?.type).toBe("categorical");
    expect(electrolyteVar?.categories).toContain("LiPF6");

    // Check outcome column detected and flagged with include: false
    const capacityVar = vars.find((v) => v.id.includes("capacity"));
    expect(capacityVar).toBeDefined();
    expect(capacityVar?.include).toBe(false);
  });

  it("canonicalizes compatible units across documents (e.g. °C and K)", () => {
    const csvDoc: UploadedDoc = {
      id: "doc-celsius",
      name: "data_celsius.csv",
      kind: "table",
      mediaType: "text/csv",
      bytes: 100,
      sha256: "1111111111111111111111111111111111111111111111111111111111111111",
      status: "done",
      uploadedAt: "2026-11-15T10:00:00Z",
      table: {
        headers: ["Temperature (°C)"],
        columns: [
          {
            name: "Temperature (°C)",
            label: "Temperature",
            unit: "°C",
            type: "numeric",
            nonEmptyCount: 2,
            numericCount: 2,
            min: 25,
            max: 50,
            median: 37.5,
            sampleCells: [{ row: 1, raw: "25" }],
          },
        ],
        rows: [
          { row: 1, values: ["25"] },
          { row: 2, values: ["50"] },
        ],
      },
    };

    const pdfDoc: UploadedDoc = {
      id: "doc-kelvin",
      name: "paper_kelvin.pdf",
      kind: "paper",
      mediaType: "application/pdf",
      bytes: 500,
      sha256: "2222222222222222222222222222222222222222222222222222222222222222",
      status: "done",
      uploadedAt: "2026-11-15T10:00:00Z",
      paper: {
        pageCount: 1,
        pages: [{ page: 1, text: "Operating Temperature: 298.15 to 373.15 K." }],
        findings: [
          {
            label: "Temperature",
            rawName: "Temperature",
            type: "numeric",
            unit: "K",
            min: 298.15,
            max: 373.15,
            values: [298.15, 373.15],
            page: 1,
            quote: "Operating Temperature: 298.15 to 373.15 K.",
          },
        ],
      },
    };

    const vars = extractVariablesFromDocs([csvDoc, pdfDoc]);
    const tempVar = vars.find((v) => v.id === "temperature");
    expect(tempVar).toBeDefined();
    expect(tempVar?.unit).toBe("°C");
    // 298.15 K = 25 °C, 373.15 K = 100 °C. Merged with 25-50 °C => 25 to 100 °C.
    expect(tempVar?.min).toBeCloseTo(25, 2);
    expect(tempVar?.max).toBeCloseTo(100, 2);
    expect(tempVar?.sigma).toBeCloseTo((100 - 25) * 0.15, 2);
  });

  it("handles remote variable proposals merging with citations", () => {
    const { csvDoc } = createSampleDocs();
    const remoteProposals: VariableProposalRemote[] = [
      {
        id: "pressure",
        label: "Pressure",
        type: "numeric",
        unit: "kPa",
        docId: "doc-csv-battery",
        row: 1,
        quote: "Cell pressure 101.3 kPa",
        min: 100,
        max: 120,
      },
    ];

    const vars = extractVariablesFromDocs([csvDoc], remoteProposals);
    const pressureVar = vars.find((v) => v.id === "pressure");
    expect(pressureVar).toBeDefined();
    expect(pressureVar?.unit).toBe("kPa");
    expect(pressureVar?.min).toBe(100);
    expect(pressureVar?.max).toBe(120);
    expect(pressureVar?.citations[0].quote).toBe("Cell pressure 101.3 kPa");
  });
});

describe("buildPackFromDocs", () => {
  it("builds engine-compatible Pack, Mapping, and Scenario passing evidenceLevels, rank, findings, gaps, and graph", () => {
    const { csvDoc, pdfDoc } = createSampleDocs();
    const vars = extractVariablesFromDocs([csvDoc, pdfDoc]);

    const result = buildPackFromDocs([csvDoc, pdfDoc], vars, {
      title: "Battery Experimental Corpus",
      scope: "uploaded",
    });

    const { pack, mapping, suggestedScenario } = result;

    // Verify contract & metadata
    expect(pack.contract).toBe("prometeo.pack/1");
    expect(pack.meta.title).toBe("Battery Experimental Corpus");

    // Verify pack.sources with accurate SHA-256 and study matching
    expect(pack.sources).toHaveLength(2);
    const csvSource = pack.sources.find((s) => s.id === "doc-csv-battery");
    const pdfSource = pack.sources.find((s) => s.id === "doc-pdf-paper");
    expect(csvSource?.sha256).toBe(csvDoc.sha256);
    expect(pdfSource?.sha256).toBe(pdfDoc.sha256);

    // Verify pack.studies matching uploaded docs
    expect(pack.studies).toHaveLength(2);
    expect(pack.studies.map((s) => s.id)).toEqual(
      expect.arrayContaining(["study-doc-csv-battery", "study-doc-pdf-paper"])
    );

    // Verify every record has valid source.id and study
    expect(pack.records.length).toBeGreaterThan(0);
    for (const record of pack.records) {
      expect(pack.sources.some((s) => s.id === record.source.id)).toBe(true);
      expect(pack.studies.some((s) => s.id === record.study)).toBe(true);
      if (record.confidence === "table") {
        expect(record.source.row).toBeDefined();
      } else if (record.confidence === "paper") {
        expect(record.source.page).toBeDefined();
        expect(record.quote).toBeDefined();
      }
    }

    // Verify outcome columns stored verbatim in record.outcomes
    const csvRecords = pack.records.filter((r) => r.source.id === "doc-csv-battery");
    expect(csvRecords.length).toBe(3);
    expect(csvRecords[0].outcomes).toEqual({ Capacity_mAh_g: "150" });
    expect(csvRecords[1].outcomes).toEqual({ Capacity_mAh_g: "140" });
    expect(csvRecords[2].outcomes).toEqual({ Capacity_mAh_g: "180" });

    // Verify Mapping structure
    expect(mapping.tables).toHaveLength(1);
    expect(mapping.tables[0].source).toBe("doc-csv-battery");
    const outcomeCol = mapping.tables[0].columns.find((c) => c.column === "Capacity_mAh_g");
    expect(outcomeCol).toMatchObject({
      role: "outcome",
      status: "approved",
      variable: null,
    });

    // Verify suggestedScenario initializes with median (numeric) and mode (categorical)
    expect(suggestedScenario.values.temperature).toBe(30);
    expect(suggestedScenario.values.voltage).toBe(3.7);
    expect(suggestedScenario.values.cathode).toBe("NMC");
    expect(suggestedScenario.values.electrolyte).toBe("LiPF6");
    expect(suggestedScenario.active).toEqual(
      expect.arrayContaining(["temperature", "voltage", "cathode", "electrolyte"])
    );

    // Verify engine execution with zero exceptions
    const ev = evidenceLevels(pack, minimalLens, suggestedScenario);
    expect(ev).toBeDefined();
    expect(ev.length).toBeGreaterThan(0);

    const rk = rank(pack, suggestedScenario);
    expect(rk).toBeDefined();
    expect(rk.length).toBe(2);

    const fn = findings(pack, minimalLens, suggestedScenario);
    expect(fn).toBeDefined();
    expect(Array.isArray(fn)).toBe(true);

    const gp = gaps(pack, {
      x: "temperature",
      y: "voltage",
      scenario: suggestedScenario,
    });
    expect(gp).toBeDefined();
    expect(gp.total).toBe(pack.records.filter((r) => r.kind === "test").length);

    const gr = graph(pack, minimalLens);
    expect(gr.nodes.length).toBeGreaterThan(0);
    expect(gr.edges).toBeDefined();

    // Verify summarizeOutcomes from MLCard
    const summaries = summarizeOutcomes(pack.records, mapping);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].column).toBe("Capacity_mAh_g");
    expect(summaries[0].denominator).toBe(3);
    expect(summaries[0].missing).toBe(0);
  });

  it("combines with demoPack and demoMapping when scope === 'combine' without ID collisions", () => {
    const demoPack = JSON.parse(readFileSync("public/demo/pack.json", "utf-8")) as Pack;
    const demoMapping = JSON.parse(readFileSync("public/demo/mapping.json", "utf-8")) as Mapping;

    const { csvDoc, pdfDoc } = createSampleDocs();
    const vars = extractVariablesFromDocs([csvDoc, pdfDoc]);

    const { pack, mapping, suggestedScenario } = buildPackFromDocs(
      [csvDoc, pdfDoc],
      vars,
      {
        scope: "combine",
        demoPack,
        demoMapping,
      }
    );

    // Verify all demo studies are preserved and new custom studies are added
    expect(pack.studies.length).toBe(demoPack.studies.length + 2);
    for (const demoStudy of demoPack.studies) {
      expect(pack.studies.some((s) => s.id === demoStudy.id)).toBe(true);
    }

    // Verify no ID collisions in studies or records
    const studyIds = pack.studies.map((s) => s.id);
    expect(new Set(studyIds).size).toBe(studyIds.length);

    const recordIds = pack.records.map((r) => r.id);
    expect(new Set(recordIds).size).toBe(recordIds.length);

    // Verify all records point to existing sources and studies
    const sourceIds = new Set(pack.sources.map((s) => s.id));
    const studyIdSet = new Set(studyIds);
    for (const r of pack.records) {
      expect(sourceIds.has(r.source.id)).toBe(true);
      expect(studyIdSet.has(r.study)).toBe(true);
    }

    // Verify mapping tables combined
    expect(mapping.tables.length).toBe(demoMapping.tables.length + 1);

    // Verify engine functions run without error on combined pack
    const rk = rank(pack, suggestedScenario);
    expect(rk.length).toBe(pack.studies.length);

    const gr = graph(pack, minimalLens);
    expect(gr.nodes.length).toBeGreaterThan(0);
  });

  it("handles edge cases: 0 numeric variables, 1 numeric variable, and empty table", () => {
    // Empty table
    const emptyDoc: UploadedDoc = {
      id: "doc-empty",
      name: "empty.csv",
      kind: "table",
      mediaType: "text/csv",
      bytes: 0,
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      status: "done",
      uploadedAt: "2026-11-15T10:00:00Z",
      table: {
        headers: [],
        columns: [],
        rows: [],
      },
    };

    // 0 numeric variables (only categorical)
    const catOnlyDoc: UploadedDoc = {
      id: "doc-cat-only",
      name: "categories.csv",
      kind: "table",
      mediaType: "text/csv",
      bytes: 100,
      sha256: "3333333333333333333333333333333333333333333333333333333333333333",
      status: "done",
      uploadedAt: "2026-11-15T10:00:00Z",
      table: {
        headers: ["Cathode"],
        columns: [
          {
            name: "Cathode",
            label: "Cathode",
            unit: null,
            type: "categorical",
            nonEmptyCount: 2,
            numericCount: 0,
            categories: ["NMC", "LFP"],
            mode: "NMC",
            sampleCells: [{ row: 1, raw: "NMC" }],
          },
        ],
        rows: [
          { row: 1, values: ["NMC"] },
          { row: 2, values: ["LFP"] },
        ],
      },
    };

    const vars0 = extractVariablesFromDocs([emptyDoc, catOnlyDoc]);
    expect(vars0).toHaveLength(1);
    expect(vars0[0].id).toBe("cathode");

    const res0 = buildPackFromDocs([emptyDoc, catOnlyDoc], vars0, {
      scope: "uploaded",
    });
    expect(res0.pack.records).toHaveLength(2);
    expect(res0.suggestedScenario.values.cathode).toBe("NMC");

    // 1 numeric variable
    const numOnlyDoc: UploadedDoc = {
      id: "doc-1num",
      name: "single_num.csv",
      kind: "table",
      mediaType: "text/csv",
      bytes: 100,
      sha256: "4444444444444444444444444444444444444444444444444444444444444444",
      status: "done",
      uploadedAt: "2026-11-15T10:00:00Z",
      table: {
        headers: ["Temperature (°C)"],
        columns: [
          {
            name: "Temperature (°C)",
            label: "Temperature",
            unit: "°C",
            type: "numeric",
            nonEmptyCount: 1,
            numericCount: 1,
            min: 25,
            max: 25,
            median: 25,
            sampleCells: [{ row: 1, raw: "25" }],
          },
        ],
        rows: [{ row: 1, values: ["25"] }],
      },
    };

    const vars1 = extractVariablesFromDocs([numOnlyDoc]);
    expect(vars1).toHaveLength(1);
    // When min === max, sigma is Math.max(0, 1e-3) = 1e-3
    expect(vars1[0].sigma).toBe(1e-3);

    const res1 = buildPackFromDocs([numOnlyDoc], vars1, { scope: "uploaded" });
    expect(res1.pack.records).toHaveLength(1);
    expect(res1.suggestedScenario.values.temperature).toBe(25);
  });
});

import { describe, expect, it } from "vitest";
import { generateBibtex, generateExecutiveMarkdown, generateDossierJson } from "./dossier";
import type { Scenario, OverallEvidence, StudyResult, Finding, Pack, Lens } from "../engine";

describe("Dossier Export Utilities", () => {
  const mockPack: Partial<Pack> = {
    contract: "test-contract",
    studies: [{ id: "S1", title: "BASS Experiment", short: "BASS-I", authors: ["L. Gold"], year: 2018 } as any],
    sources: [{ id: "src-1", name: "bass_table.csv", sha256: "abc123", kind: "table", study: "S1" } as any],
    records: [],
  };

  const mockLens: Partial<Lens> = {
    title: "NASA Spacecraft Flammability Portal",
    byline: "Physical Sciences Informatics Harmonization",
    disclaimer: "Official NASA research preview.",
  };

  const mockScenario: Scenario = {
    values: { o2: 24, p: 0.70, material: "PMMA" },
    active: ["o2", "p", "material"],
  };

  const mockOverall: OverallEvidence = {
    level: "strong",
    counts: { A: 2, B: 1, C: 0, D: 0 },
  };

  const mockRanking: StudyResult[] = [
    {
      study: "S1",
      grade: "A",
      distance: 0.25,
      comparable: 1,
      missing: [],
      why: [],
      nearest: "rec-1",
    },
  ];

  const mockFindings: Finding[] = [
    {
      id: "f1",
      level: "support",
      code: "within_tested",
      params: {},
      sources: ["src-1"],
      metric: { value: "1.2", unit: "cm/s" },
    },
  ];

  it("generates markdown document formatted with executive headings and metadata", () => {
    const md = generateExecutiveMarkdown(
      mockPack as Pack,
      mockLens as Lens,
      mockScenario,
      "Artemis Evaluation",
      mockOverall,
      mockRanking,
      mockFindings,
    );
    expect(md).toContain("# NASA FLIGHT DIRECTOR BRIEF");
    expect(md).toContain("NASA Spacecraft Flammability Portal");
    expect(md).toContain("Overall Evidence Level");
    expect(md).toContain("Study Grades");
  });

  it("generates valid JSON export containing scenario, ranking, and findings", () => {
    const jsonStr = generateDossierJson(
      mockPack as Pack,
      mockLens as Lens,
      mockScenario,
      mockOverall,
      mockRanking,
      mockFindings,
    );
    const parsed = JSON.parse(jsonStr);
    expect(parsed.contract).toBe("test-contract");
    expect(parsed.scenario.values.o2).toBe(24);
    expect(parsed.overall.level).toBe("strong");
  });
});

describe("generateBibtex", () => {
  it("writes one entry per distinct DOI with only the fields present", () => {
    const pack = {
      studies: [
        {
          id: "S1", short: "BASS-II", title: "BASS {II} & flames",
          links: [{ kind: "doi", url: "https://doi.org/10.1/abc", label: "10.1/abc" }],
          publications: [{ title: "Spread of flames", doi: "10.2/xyz", authors: "Gold L., Smith J." }],
        },
        { id: "S2", short: "Up", title: "Uploaded paper", links: [], publications: [{ title: "Dup", doi: "10.2/XYZ" }] },
        { id: "S3", short: "NoDoi", title: "No DOI", links: [], publications: [] },
      ],
    } as unknown as Pack;
    const bib = generateBibtex(pack);
    expect(bib).toContain("@article{S1_1,\n  title = {Spread of flames},\n  author = {Gold L. and Smith J.},\n  doi = {10.2/xyz},\n  url = {https://doi.org/10.2/xyz}\n}");
    expect(bib).toContain("@misc{S1,\n  title = {BASS II \\& flames},\n  doi = {10.1/abc}");
    expect(bib.match(/@/g)).toHaveLength(2); // duplicate DOI (case-insensitive) and the study without DOI add nothing
    expect(bib).not.toContain("year");
  });
});

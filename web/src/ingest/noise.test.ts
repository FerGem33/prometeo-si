import { describe, expect, it } from "vitest";
import { isNoiseVariable, studyShortName } from "./buildPack";
import { parseTabularDocument } from "./csv";
import { parsePaperPages } from "./pdf";

describe("noise reduction for large uploaded corpora", () => {
  it("flags bookkeeping columns and PDF fragments, keeps real variables", () => {
    for (const l of ["testNumber", "testMatrixNumber", "Experiment number", "Run No.", "Day/GMT", "Tests Run", "script", "Comments", "Key Results"])
      expect(isNoiseVariable(l, "table"), l).toBe(true);
    for (const l of ["Pressure (atm)", "Heat Flux", "No. of Microheaters", "massVelocity", "Bulk Liquid Temperature"])
      expect(isNoiseVariable(l, "table"), l).toBe(false);
    for (const l of ["Fig 4 Temperature", "that the A power law", "n a DT", "g 25 Tbulk", "Each of these elements was"])
      expect(isNoiseVariable(l, "paper"), l).toBe(true);
    for (const l of ["Superheat", "Dissolved gas content", "Condition"]) expect(isNoiseVariable(l, "paper"), l).toBe(false);
  });

  it("names a study without the repeated ID prefix", () => {
    expect(studyShortName("PSI-4__PSI-4_Experimental table_AsRunEPMT_FBCEFBM.csv")).toBe("PSI-4 · Experimental table AsRunEPMT FBCEFBM");
    expect(studyShortName("my_data.csv")).toBe("my data");
  });

  it("moves a bracketed units row into the header and keeps source row numbers", () => {
    const csv = "Day,Pressure,Temp\n,(atm),(°C)\n088,1,30\n";
    const r = parseTabularDocument("t.csv", new TextEncoder().encode(csv), "text/csv");
    expect(r.headers).toEqual(["Day", "Pressure (atm)", "Temp (°C)"]);
    expect(r.rows.map((x) => x.row)).toEqual([3]);
  });

  it("ignores clock times and the references section of a paper", () => {
    const pages = [
      { page: 1, text: "Start: 4:00 PM.\nCondition: mindfulness vs. control" },
      { page: 2, text: "Body text\nReferences\nVolition and personality: Action versus Guilford Press." },
    ];
    const labels = parsePaperPages(pages, "p.pdf").findings.map((f) => f.label);
    expect(labels).toContain("Condition");
    expect(labels).not.toContain("Volition and personality");
    expect(parsePaperPages(pages, "p.pdf").findings.some((f) => f.unit === "pM")).toBe(false);
  });
});

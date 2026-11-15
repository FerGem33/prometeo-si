import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectNasaCorpus } from "./nasaDetect";
import type { UploadedDoc } from "./types";

const doc = (name: string, extra: Partial<UploadedDoc> = {}): UploadedDoc => ({
  id: name, name, kind: "table", mediaType: "text/csv", bytes: 1, sha256: "x", status: "done", uploadedAt: "", ...extra,
});
const paper = (title: string, text: string): UploadedDoc =>
  doc(`${title}.pdf`, { kind: "paper", mediaType: "application/pdf", paper: { title, pageCount: 1, pages: [{ page: 1, text }], findings: [] } });

describe("detectNasaCorpus", () => {
  it("detects the PSI chamber experiments from real file names", () => {
    const r = detectNasaCorpus([
      doc("PSI-85__PSI-85_Experimental table_NPBX.csv"),
      doc("PSI-81__PSI-81_Experimental table_MABE_Experimental_table.csv"),
      paper("Nucleate Pool Boiling Experiments on the International Space Station", "Experiments in microgravity aboard the ISS."),
    ]);
    expect(r.isNasa).toBe(true);
    expect(r.apparatus).toBe("chamber");
    expect(r.matched).toEqual(expect.arrayContaining(["NPBX", "MABE", "ISS", "microgravity"]));
  });

  it("chooses the habitat model when habitat terms dominate", () => {
    const r = detectNasaCorpus([paper("Lunar base cabin atmospheres", "An airlock and the ECLSS of a lunar base habitat for EVA crews.")]);
    expect(r).toMatchObject({ isNasa: true, apparatus: "habitat" });
  });

  it("uses variable labels and needs two weak terms without a strong one", () => {
    expect(detectNasaCorpus([doc("data.csv")], [{ label: "Gravity level (microgravity)" }]).isNasa).toBe(false);
    expect(detectNasaCorpus([doc("data.csv")], [{ label: "microgravity" }, { label: "parabolic flight" }]).isNasa).toBe(true);
  });

  it("does not match acronyms inside other words or in lower case prose", () => {
    const r = detectNasaCorpus([
      paper("Battery evaluation", "Missing data, a circle of bass players, eva the analyst, bypass. Habitual cases were 10g."),
      doc("evaluation_missing_circle.csv"),
    ]);
    expect(r).toEqual({ isNasa: false, apparatus: null, matched: [] });
  });

  it("ignores failed documents and returns nothing for an empty corpus", () => {
    expect(detectNasaCorpus([doc("NASA_ISS.csv", { status: "error" })]).isNasa).toBe(false);
    expect(detectNasaCorpus([]).isNasa).toBe(false);
  });

  const lote = "/home/alexteori/Descargas/lote";
  it.skipIf(!existsSync(lote))("flags the local verified lote batch by its file names", () => {
    const r = detectNasaCorpus(readdirSync(lote).map((n) => doc(n)));
    expect(r).toMatchObject({ isNasa: true, apparatus: "chamber" });
  });
});

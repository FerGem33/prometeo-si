// Spec "paper inteligente guiado por propósito" (§6): scoring, modules, classification and case notes on real data.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evidenceLevels, type Lens, type Pack } from "../engine";
import { COVERAGE_LETTER } from "../components/CaseModules";
import { extractVariablesFromDocs, variablesFromPack } from "./buildPack";
import { compileUiBlueprint } from "./blueprint";
import { extractCaseFeatures } from "./caseNotes";
import { parseTabularDocument } from "./csv";
import { isPredictionQuestion } from "./localAsk";
import { generateModules, validateModules } from "./modules";
import { extractPdfPages, parsePaperPages } from "./pdf";
import { detectMediaType, sha256Hex } from "./storage";
import type { ExtractedVariable, UploadedDoc } from "./types";
import { scoreVariables } from "./variableScore";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf-8")) as Pack;
const lens = JSON.parse(readFileSync("public/demo/lens.json", "utf-8")) as Lens;
const PURPOSE = lens.purpose_example!;

// The wizard's view of the reference pack: one candidate per schema variable, cited to real source rows.
const packVars: ExtractedVariable[] = variablesFromPack(pack);

describe("reference-pack provenance", () => {
  it("cites real source files with a row or page; normalized records are labelled as such", () => {
    const names = new Set(pack.sources.map((s) => s.name));
    for (const v of packVars) {
      expect(v.citations.length).toBeGreaterThan(0);
      for (const c of v.citations) {
        expect(names.has(c.docName)).toBe(true);
        expect(c.row ?? c.page).toBeDefined();
        if (c.basis === "approved_pack") expect(c.recordId && c.variableId === v.id).toBeTruthy();
      }
    }
  });
});

describe("variable score (§3.2)", () => {
  it("proposes the known variables of the PSI corpus for the example purpose, with reasons", () => {
    const scored = scoreVariables(packVars, { docs: [], purpose: PURPOSE, pack });
    expect(scored.map((v) => v.id).sort()).toEqual(["flow", "g", "material", "o2", "p"]);
    for (const v of scored) {
      expect(v.reasons.length).toBeGreaterThan(1);
      expect(v.reasons[0]).toMatch(/^appears in \d+ of 24 studies$/);
      expect(v.score).toBeGreaterThanOrEqual(0);
      expect(v.score).toBeLessThanOrEqual(100);
    }
    // Gravity is recorded by 19 of the 24 investigations and the purpose names microgravity: it ranks first.
    expect(scored[0].id).toBe("g");
    expect(scored[0].reasons).toContain("appears in 19 of 24 studies");
    expect(scored[0].reasons.some((r) => r.startsWith("matches the purpose: gravity"))).toBe(true);
  });

  it("is stable and drops variables without provenance", () => {
    const withGhost = [...packVars, { ...packVars[0], id: "ghost", citations: [] }];
    const a = scoreVariables(withGhost, { docs: [], purpose: PURPOSE, pack });
    const b = scoreVariables(withGhost, { docs: [], purpose: PURPOSE, pack });
    expect(a).toEqual(b);
    expect(a.some((v) => v.id === "ghost")).toBe(false);
  });

  it("the purpose moves a matching variable up", () => {
    const base = scoreVariables(packVars, { docs: [], purpose: "", pack }).find((v) => v.id === "flow")!;
    const aimed = scoreVariables(packVars, { docs: [], purpose: "effect of forced flow velocity", pack }).find((v) => v.id === "flow")!;
    expect(aimed.score).toBeGreaterThan(base.score);
    expect(aimed.reasons.some((r) => r.startsWith("matches the purpose"))).toBe(true);
  });
});

describe("classification of the case (§4) on the reference pack", () => {
  const lunar = lens.presets.find((p) => p.id === "lunar_base")!;
  const scenario = { values: { ...lunar.values }, active: [...lunar.active] };

  it("control findings: 30 % O₂ at 10.2 psi is not covered in O₂ for solids, and pressure is never recorded", () => {
    expect(lunar.values).toMatchObject({ o2: 30, p: 0.694 });
    const solids = pack.records.filter((r) => r.kind === "test" && r.values.phase === "solid");
    expect(solids.length).toBe(268);
    expect(solids.filter((r) => r.values.p !== undefined).length).toBe(0);
    const levels = evidenceLevels(pack, lens, scenario);
    const o2 = levels.find((l) => l.variable === "o2")!;
    expect(o2.tested?.[1]).toBe(22.2);
    expect(["B", "D"]).toContain(COVERAGE_LETTER[o2.level]);
    expect(COVERAGE_LETTER[levels.find((l) => l.variable === "p")!.level]).toBe("D");
  });

  it("is deterministic", () => {
    const run = () => evidenceLevels(pack, lens, scenario).map((l) => [l.variable, COVERAGE_LETTER[l.level], l.source]);
    expect(run()).toEqual(run());
  });
});

describe("modules (§3.5)", () => {
  const ids = new Set(["o2", "p"]);

  it("validates against the schema and drops invalid modules without throwing", () => {
    const { modules, rejected } = validateModules(
      [
        { type: "scenario_input", title: "Your case", variables: ["o2", "ghost"] },
        { type: "classification", title: "No variables", variables: [] },
        { type: "mystery", title: "x" },
        { type: "key_papers", title: "Papers", limit: 99 },
        { type: "free_chat" },
        null,
      ],
      ids,
    );
    expect(modules).toEqual([{ id: "scenario_input-1", type: "scenario_input", title: "Your case", description: "", variables: ["o2"] }]);
    expect(rejected).toHaveLength(5);
  });

  it("a blueprint with invalid /design modules falls back to the local plan and stays valid", () => {
    const bp = compileUiBlueprint(PURPOSE, [], packVars, [], { modules: [{ type: "mystery" }] as never });
    expect(bp.purpose).toBe(PURPOSE);
    expect(bp.rejectedModules).toEqual(["module 1 (mystery): unknown type"]);
    expect(bp.modules?.map((m) => m.type)).toEqual(["scenario_input", "case_notes", "classification", "key_papers", "free_chat"]);
    expect(bp.sectionOrder.length).toBeGreaterThan(0);
  });

  it("another purpose generates other modules with the same code", () => {
    const survey = generateModules("Literature review of what is known about pipe corrosion", [{ id: "o2", label: "x" }]);
    expect(survey.map((m) => m.type)).toEqual(["key_papers", "free_chat"]);
    const own = generateModules("Evaluate our pipeline design against the corrosion evidence", [{ id: "o2", label: "x" }]);
    expect(own.map((m) => m.type)).toContain("classification");
  });
});

describe("case notes and free chat guards (§3.6, §3.7)", () => {
  it("proposes values from a description, converting units, without applying them", () => {
    const vars = pack.schema.variables.map((v) => ({
      id: v.id,
      label: v.label,
      long: v.long,
      type: v.type,
      unit: v.type === "num" ? v.unit : undefined,
      categories: v.type === "cat" ? [...new Set(pack.records.map((r) => r.values[v.id]).filter((x): x is string => typeof x === "string"))] : undefined,
    }));
    const found = extractCaseFeatures("Our lunar base keeps 30 % oxygen at 10.2 psi; wall panels are PMMA.", vars);
    expect(found.find((f) => f.variable === "o2")?.value).toBe(30);
    const p = found.find((f) => f.variable === "p")!;
    expect(p.fromUnit).toBe("psi");
    expect(p.value).toBeCloseTo(0.694, 3);
    expect(found.find((f) => f.variable === "material")?.value).toBe("PMMA");
  });

  it("recognises questions that ask for a prediction", () => {
    expect(isPredictionQuestion("Is it safe to use PMMA at 30% O2?")).toBe(true);
    expect(isPredictionQuestion("¿Arderá el material?")).toBe(true);
    expect(isPredictionQuestion("What is the maximum oxygen tested?")).toBe(false);
  });
});

const LOTE = process.env.PROMETEO_LOTE_DIR ?? "/home/alexteori/Descargas/lote";
describe.skipIf(!existsSync(LOTE))("variable score on the real batch", () => {
  it("orders the batch variables with reasons and provenance", async () => {
    const docs: UploadedDoc[] = [];
    for (const f of readdirSync(LOTE).sort()) {
      const bytes = new Uint8Array(readFileSync(path.join(LOTE, f)));
      const sha256 = await sha256Hex(bytes);
      const mediaType = detectMediaType(f, "")!;
      const base = { id: `doc_${sha256.slice(0, 12)}`, name: f, mediaType, bytes: bytes.byteLength, sha256, status: "done" as const, uploadedAt: "2026-11-15" };
      if (f.endsWith(".pdf")) {
        const { pages } = await extractPdfPages(bytes);
        docs.push({ ...base, kind: "paper", paper: parsePaperPages(pages, f) });
      } else docs.push({ ...base, kind: "table", table: parseTabularDocument(f, bytes, mediaType) });
    }
    const vars = extractVariablesFromDocs(docs);
    const scored = scoreVariables(vars, { docs, purpose: "boiling heat transfer in microgravity", pack: undefined });
    expect(scored.length).toBe(vars.filter((v) => v.citations.length).length);
    expect(scored.every((v) => v.reasons[0].startsWith("appears in ") && v.citations.length > 0)).toBe(true);
    for (let i = 1; i < scored.length; i++) expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
    expect(scoreVariables(vars, { docs, purpose: "boiling heat transfer in microgravity" }).map((v) => v.id)).toEqual(scored.map((v) => v.id));
  }, 120000);
});

describe("case notes prefer the variable whose unit matches", () => {
  it("a value in W/cm² goes to the heat-flux variable, not to a heater setpoint without unit", () => {
    const found = extractCaseFeatures("The heater runs at 9 W/cm².", [
      { id: "heater_setpoint", label: "Heater setpoint (C)", type: "num" },
      { id: "heat_flux", label: "Heat Flux", type: "num", unit: "W/cm²" },
    ]);
    expect(found).toEqual([{ variable: "heat_flux", value: 9, quote: "The heater runs at 9 W/cm²" }]);
  });
});

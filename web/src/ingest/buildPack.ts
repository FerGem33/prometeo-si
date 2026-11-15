/**
 * Dynamic Variable Extractor, Unit Canonicalizer & Pack Builder.
 * Ingests UploadedDocs (CSVs and PDFs), deduplicates variables, canonicalizes units,
 * records provenance citations, and builds engine-compatible Pack, Mapping, and Scenario.
 */

import type { Mapping } from "../components/ctx";
import type {
  CatVariable,
  DataRecord,
  NumVariable,
  Origin,
  Pack,
  Range,
  Scenario,
  Source,
  Study,
  Variable,
} from "../engine/types";
import type {
  CorpusScope,
  ExtractedVariable,
  UploadedDoc,
  VariableCitation,
  VariableProposalRemote,
} from "./types";

// ============================================================================
// 1. Outcome Column Detection
// ============================================================================

const OUTCOME_KEYWORDS = [
  "rate",
  "yield",
  "capacity",
  "spread",
  "outcome",
  "efficiency",
  "status",
  "loss",
];

export function isOutcomeColumn(nameOrLabel: string): boolean {
  const lower = nameOrLabel.toLowerCase();
  return OUTCOME_KEYWORDS.some((kw) => lower.includes(kw));
}

// ============================================================================
// 2. Slug Normalization
// ============================================================================

export function slugifyVariable(raw: string): string {
  // Strip content after colon (e.g. "Electrolyte: LiPF6" -> "Electrolyte")
  const beforeColon = raw.split(":")[0].trim();
  // Strip parentheses and brackets (e.g. "Temperature (°C)" -> "Temperature")
  const withoutUnits = beforeColon
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .trim();

  const slug = withoutUnits
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "variable";
}

// ============================================================================
// 3. Unit Canonicalization & Linear Conversions
// ============================================================================

export interface UnitConversion {
  factor: number;
  offset: number;
}

interface UnitGroupDef {
  base: string;
  units: Record<string, { factor: number; offset: number }>;
}

const UNIT_GROUPS: Record<string, UnitGroupDef> = {
  temperature: {
    base: "°C",
    units: {
      "°c": { factor: 1, offset: 0 },
      c: { factor: 1, offset: 0 },
      degc: { factor: 1, offset: 0 },
      "deg c": { factor: 1, offset: 0 },
      "° c": { factor: 1, offset: 0 },
      k: { factor: 1, offset: -273.15 },
      kelvin: { factor: 1, offset: -273.15 },
      "°f": { factor: 5 / 9, offset: -160 / 9 },
      f: { factor: 5 / 9, offset: -160 / 9 },
      degf: { factor: 5 / 9, offset: -160 / 9 },
      "deg f": { factor: 5 / 9, offset: -160 / 9 },
    },
  },
  pressure: {
    base: "kPa",
    units: {
      kpa: { factor: 1, offset: 0 },
      pa: { factor: 0.001, offset: 0 },
      mpa: { factor: 1000, offset: 0 },
      bar: { factor: 100, offset: 0 },
      mbar: { factor: 0.1, offset: 0 },
      atm: { factor: 101.325, offset: 0 },
      psi: { factor: 6.894757, offset: 0 },
      torr: { factor: 0.133322, offset: 0 },
      mmhg: { factor: 0.133322, offset: 0 },
    },
  },
  length: {
    base: "m",
    units: {
      m: { factor: 1, offset: 0 },
      km: { factor: 1000, offset: 0 },
      cm: { factor: 0.01, offset: 0 },
      mm: { factor: 0.001, offset: 0 },
      um: { factor: 1e-6, offset: 0 },
      "µm": { factor: 1e-6, offset: 0 },
      nm: { factor: 1e-9, offset: 0 },
      in: { factor: 0.0254, offset: 0 },
      ft: { factor: 0.3048, offset: 0 },
    },
  },
  mass: {
    base: "g",
    units: {
      g: { factor: 1, offset: 0 },
      mg: { factor: 0.001, offset: 0 },
      kg: { factor: 1000, offset: 0 },
    },
  },
  time: {
    base: "s",
    units: {
      s: { factor: 1, offset: 0 },
      sec: { factor: 1, offset: 0 },
      ms: { factor: 0.001, offset: 0 },
      min: { factor: 60, offset: 0 },
      h: { factor: 3600, offset: 0 },
      d: { factor: 86400, offset: 0 },
    },
  },
  electrical_voltage: {
    base: "V",
    units: {
      v: { factor: 1, offset: 0 },
      mv: { factor: 0.001, offset: 0 },
      kv: { factor: 1000, offset: 0 },
    },
  },
  electrical_current: {
    base: "A",
    units: {
      a: { factor: 1, offset: 0 },
      ma: { factor: 0.001, offset: 0 },
      ua: { factor: 1e-6, offset: 0 },
      "µa": { factor: 1e-6, offset: 0 },
    },
  },
  ratio: {
    base: "%",
    units: {
      "%": { factor: 1, offset: 0 },
      "mol/mol": { factor: 100, offset: 0 },
      "mole fraction": { factor: 100, offset: 0 },
      ppm: { factor: 0.0001, offset: 0 },
      ppb: { factor: 1e-7, offset: 0 },
    },
  },
  capacity: {
    base: "mAh/g",
    units: {
      "mah/g": { factor: 1, offset: 0 },
      mah_g: { factor: 1, offset: 0 },
      "ah/kg": { factor: 1, offset: 0 },
    },
  },
};

function normalizeUnitStr(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.trim().toLowerCase();
}

export function findUnitGroup(unitStr: string | null | undefined): { group: string; base: string } | null {
  const norm = normalizeUnitStr(unitStr);
  if (!norm) return null;

  for (const [groupName, def] of Object.entries(UNIT_GROUPS)) {
    if (def.units[norm]) {
      return { group: groupName, base: def.base };
    }
  }
  return null;
}

/**
 * Computes linear conversion (factor & offset) such that:
 * canonicalValue = rawValue * factor + offset
 */
export function getConversion(
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined
): UnitConversion | null {
  const fromNorm = normalizeUnitStr(fromUnit);
  const toNorm = normalizeUnitStr(toUnit);

  if (!fromNorm || !toNorm || fromNorm === toNorm) {
    return null;
  }

  for (const def of Object.values(UNIT_GROUPS)) {
    const fromDef = def.units[fromNorm];
    const toDef = def.units[toNorm];

    if (fromDef && toDef) {
      // fromUnit -> base -> toUnit
      // baseVal = raw * fromDef.factor + fromDef.offset
      // toVal = (baseVal - toDef.offset) / toDef.factor
      // toVal = raw * (fromDef.factor / toDef.factor) + (fromDef.offset - toDef.offset) / toDef.factor
      const factor = fromDef.factor / toDef.factor;
      const offset = (fromDef.offset - toDef.offset) / toDef.factor;
      return { factor, offset };
    }
  }

  return null;
}

export function applyConversion(value: number, conv: UnitConversion | null): number {
  if (!conv) return value;
  return value * conv.factor + conv.offset;
}

// ============================================================================
// 4. extractVariablesFromDocs
// ============================================================================

interface CandidateVariable {
  id: string;
  label: string;
  type: "numeric" | "categorical";
  unit: string | null;
  min?: number;
  max?: number;
  median?: number;
  categories?: string[];
  mode?: string;
  include: boolean;
  citations: VariableCitation[];
}

export function extractVariablesFromDocs(
  docs: UploadedDoc[],
  remoteProposals?: VariableProposalRemote[]
): ExtractedVariable[] {
  const candidates: CandidateVariable[] = [];

  for (const doc of docs) {
    // CSV / Tabular Doc
    if (doc.kind === "table" && doc.table) {
      for (const col of doc.table.columns) {
        const isOutcome = isOutcomeColumn(col.name) || isOutcomeColumn(col.label);
        const slug = slugifyVariable(col.name);
        const firstSample = col.sampleCells?.[0];
        const quote = firstSample
          ? `${col.name} (row ${firstSample.row}: "${firstSample.raw}")`
          : col.name;

        const citation: VariableCitation = {
          docId: doc.id,
          docName: doc.name,
          kind: "table",
          column: col.name,
          row: firstSample?.row ?? 1,
          quote,
        };

        candidates.push({
          id: slug,
          label: col.label || col.name,
          type: col.type,
          unit: col.unit ?? null,
          min: col.min,
          max: col.max,
          median: col.median,
          categories: col.categories ? [...col.categories] : undefined,
          mode: col.mode,
          include: !isOutcome,
          citations: [citation],
        });
      }
    }

    // PDF Paper Doc
    if (doc.kind === "paper" && doc.paper) {
      for (const finding of doc.paper.findings) {
        const slug = slugifyVariable(finding.rawName || finding.label);
        const citation: VariableCitation = {
          docId: doc.id,
          docName: doc.name,
          kind: "paper",
          page: finding.page,
          quote: finding.quote,
        };

        const minVal =
          finding.min ??
          (finding.values && finding.values.length > 0
            ? Math.min(...finding.values)
            : undefined);
        const maxVal =
          finding.max ??
          (finding.values && finding.values.length > 0
            ? Math.max(...finding.values)
            : undefined);

        candidates.push({
          id: slug,
          label: finding.label,
          type: finding.type,
          unit: finding.unit ?? null,
          min: minVal,
          max: maxVal,
          median: undefined,
          categories: finding.categories ? [...finding.categories] : undefined,
          mode: finding.categories?.[0],
          include: true,
          citations: [citation],
        });
      }
    }
  }

  // Incorporate remote proposals if provided
  if (remoteProposals) {
    for (const proposal of remoteProposals) {
      const doc = docs.find((d) => d.id === proposal.docId);
      const slug = proposal.id || slugifyVariable(proposal.label);
      const citation: VariableCitation = {
        docId: proposal.docId,
        docName: doc?.name ?? proposal.docId,
        kind: doc?.kind ?? (proposal.page ? "paper" : "table"),
        page: proposal.page,
        row: proposal.row,
        quote: proposal.quote,
      };

      candidates.push({
        id: slug,
        label: proposal.label,
        type: proposal.type,
        unit: proposal.unit ?? null,
        min: proposal.min,
        max: proposal.max,
        median:
          proposal.min !== undefined && proposal.max !== undefined
            ? (proposal.min + proposal.max) / 2
            : proposal.min,
        categories: proposal.categories ? [...proposal.categories] : undefined,
        mode: proposal.categories?.[0],
        include: true,
        citations: [citation],
      });
    }
  }

  // Deduplicate and merge candidates by slug
  const mergedMap = new Map<string, CandidateVariable>();

  for (const cand of candidates) {
    const existing = mergedMap.get(cand.id);
    if (!existing) {
      mergedMap.set(cand.id, {
        ...cand,
        citations: [...cand.citations],
        categories: cand.categories ? [...cand.categories] : undefined,
      });
      continue;
    }

    // Merge citations
    existing.citations.push(...cand.citations);

    // If any candidate flags include=false (e.g. outcome column), preserve include=false
    existing.include = existing.include && cand.include;

    // Unit compatibility check & range merge for numeric variables
    if (existing.type === "numeric" && cand.type === "numeric") {
      const conv = getConversion(cand.unit, existing.unit);
      const cMin =
        cand.min !== undefined ? applyConversion(cand.min, conv) : undefined;
      const cMax =
        cand.max !== undefined ? applyConversion(cand.max, conv) : undefined;

      if (cMin !== undefined) {
        existing.min =
          existing.min !== undefined ? Math.min(existing.min, cMin) : cMin;
      }
      if (cMax !== undefined) {
        existing.max =
          existing.max !== undefined ? Math.max(existing.max, cMax) : cMax;
      }
      if (cand.median !== undefined) {
        const cMed = applyConversion(cand.median, conv);
        existing.median =
          existing.median !== undefined
            ? (existing.median + cMed) / 2
            : cMed;
      }
    } else if (existing.type === "categorical" || cand.type === "categorical") {
      existing.type = "categorical";
      const set = new Set([
        ...(existing.categories ?? []),
        ...(cand.categories ?? []),
      ]);
      existing.categories = [...set];
      existing.mode = existing.mode ?? cand.mode ?? existing.categories[0];
    }
  }

  // Finalize ExtractedVariable objects with realistic sigma
  const results: ExtractedVariable[] = [];

  for (const item of mergedMap.values()) {
    let sigma: number | undefined;

    if (item.type === "numeric") {
      if (item.min !== undefined && item.max !== undefined) {
        const lo = Math.min(item.min, item.max);
        const hi = Math.max(item.min, item.max);
        item.min = lo;
        item.max = hi;
        sigma = Math.max((hi - lo) * 0.15, 1e-3);
        if (item.median === undefined) {
          item.median = (lo + hi) / 2;
        }
      } else {
        sigma = 1e-3;
      }
    }

    results.push({
      id: item.id,
      label: item.label,
      type: item.type,
      unit: item.unit,
      min: item.min,
      max: item.max,
      sigma,
      median: item.median,
      categories: item.categories,
      mode: item.mode,
      include: item.include,
      citations: item.citations,
    });
  }

  return results;
}

// ============================================================================
// 5. buildPackFromDocs
// ============================================================================

export interface BuildPackOptions {
  title?: string;
  scope: CorpusScope;
  demoPack?: Pack;
  demoMapping?: Mapping;
}

export function buildPackFromDocs(
  docs: UploadedDoc[],
  vars: ExtractedVariable[],
  options: BuildPackOptions
): { pack: Pack; mapping: Mapping; suggestedScenario: Scenario } {
  // If demo scope requested and demoPack provided, return demo directly
  if (options.scope === "demo" && options.demoPack) {
    const demoMapping = options.demoMapping ?? {
      tables: [],
      synonyms: {},
      approved_by: "demo",
      approved_at: new Date().toISOString(),
    };
    const suggestedScenario: Scenario = {
      values: {},
      active: options.demoPack.schema.variables.map((v) => v.id),
    };
    for (const v of options.demoPack.schema.variables) {
      if (v.type === "num") {
        suggestedScenario.values[v.id] = (v.range[0] + v.range[1]) / 2;
      } else {
        suggestedScenario.values[v.id] = "";
      }
    }
    return {
      pack: options.demoPack,
      mapping: demoMapping,
      suggestedScenario,
    };
  }

  // Active variables to include in schema
  const includedVars = vars.filter((v) => v.include !== false);
  const includedVarMap = new Map(includedVars.map((v) => [v.id, v]));

  // Build custom sources and studies
  const customSources: Source[] = [];
  const customStudies: Study[] = [];
  const customRecords: DataRecord[] = [];
  const customMappingTables: Mapping["tables"] = [];

  for (const doc of docs) {
    const studyId = `study-${doc.id}`;
    const studyShort = doc.name.replace(/\.[^.]+$/, "");
    const studyTitle = doc.paper?.title || doc.name;

    const source: Source = {
      id: doc.id,
      kind: doc.kind,
      name: doc.name,
      study: studyId,
      sha256: doc.sha256,
      used: true,
    };
    customSources.push(source);

    const studyVarIds = new Set<string>();
    let testRecordCount = 0;

    // Process Table Document
    if (doc.kind === "table" && doc.table) {
      const mappingColumns: Mapping["tables"][0]["columns"] = [];

      // Determine mapping columns
      for (const col of doc.table.columns) {
        const isOutcome = isOutcomeColumn(col.name) || isOutcomeColumn(col.label);
        if (isOutcome) {
          mappingColumns.push({
            column: col.name,
            variable: null,
            unit: col.unit,
            role: "outcome",
            status: "approved",
          });
          continue;
        }

        const slug = slugifyVariable(col.name);
        const mappedVar = includedVarMap.get(slug);

        if (mappedVar) {
          const conv = getConversion(col.unit, mappedVar.unit);
          mappingColumns.push({
            column: col.name,
            variable: mappedVar.id,
            unit: col.unit,
            convert: conv,
            status: "approved",
          });
        } else {
          mappingColumns.push({
            column: col.name,
            variable: null,
            unit: col.unit,
            status: "ignored",
          });
        }
      }

      customMappingTables.push({
        source: doc.id,
        columns: mappingColumns,
        constants: {},
        notes: [],
      });

      // Build records from table rows
      for (const row of doc.table.rows) {
        const recordId = `${studyId}/${doc.id}/r${row.row}`;
        const recordValues: Record<string, Range | string> = {};
        const recordOrig: Record<string, Origin> = {};
        const recordOutcomes: Record<string, string> = {};

        for (let colIdx = 0; colIdx < doc.table.columns.length; colIdx++) {
          const col = doc.table.columns[colIdx];
          const rawVal = row.values[colIdx];
          if (rawVal === undefined || rawVal === "") continue;

          const isOutcome = isOutcomeColumn(col.name) || isOutcomeColumn(col.label);
          if (isOutcome) {
            recordOutcomes[col.name] = rawVal;
            continue;
          }

          const slug = slugifyVariable(col.name);
          const mappedVar = includedVarMap.get(slug);
          if (!mappedVar) continue;

          studyVarIds.add(mappedVar.id);

          if (mappedVar.type === "numeric") {
            const num = parseFloat(rawVal);
            if (!isNaN(num)) {
              const conv = getConversion(col.unit, mappedVar.unit);
              const converted = applyConversion(num, conv);
              recordValues[mappedVar.id] = [converted, converted];
              recordOrig[mappedVar.id] = {
                column: col.name,
                text: rawVal,
                unit: col.unit,
                factor: conv?.factor ?? null,
              };
            }
          } else {
            recordValues[mappedVar.id] = rawVal.trim();
            recordOrig[mappedVar.id] = {
              column: col.name,
              text: rawVal,
              unit: col.unit,
              factor: null,
            };
          }
        }

        const dataRecord: DataRecord = {
          id: recordId,
          study: studyId,
          label: `Row ${row.row}`,
          values: recordValues,
          kind: "test",
          source: { id: doc.id, row: row.row },
          confidence: "table",
          quote: null,
          flags: [],
          orig: recordOrig,
          outcomes: Object.keys(recordOutcomes).length > 0 ? recordOutcomes : undefined,
        };

        customRecords.push(dataRecord);
        testRecordCount++;
      }
    }

    // Process Paper Document
    if (doc.kind === "paper" && doc.paper) {
      for (let fIdx = 0; fIdx < doc.paper.findings.length; fIdx++) {
        const finding = doc.paper.findings[fIdx];
        const slug = slugifyVariable(finding.rawName || finding.label);
        const mappedVar = includedVarMap.get(slug);

        const recordId = `${studyId}/${doc.id}/p${finding.page}/f${fIdx + 1}`;
        const recordValues: Record<string, Range | string> = {};
        const recordOrig: Record<string, Origin> = {};

        if (mappedVar) {
          studyVarIds.add(mappedVar.id);

          if (mappedVar.type === "numeric") {
            const conv = getConversion(finding.unit, mappedVar.unit);
            const lo = applyConversion(
              finding.min ?? finding.values[0] ?? 0,
              conv
            );
            const hi = applyConversion(
              finding.max ?? finding.values[finding.values.length - 1] ?? lo,
              conv
            );
            recordValues[mappedVar.id] = [Math.min(lo, hi), Math.max(lo, hi)];
            recordOrig[mappedVar.id] = {
              column: null,
              text: finding.quote,
              unit: finding.unit,
              factor: conv?.factor ?? null,
            };
          } else {
            const catVal = finding.categories?.[0] ?? finding.label;
            recordValues[mappedVar.id] = catVal;
            recordOrig[mappedVar.id] = {
              column: null,
              text: finding.quote,
              unit: finding.unit,
              factor: null,
            };
          }
        }

        const dataRecord: DataRecord = {
          id: recordId,
          study: studyId,
          label: `${finding.label} (p. ${finding.page})`,
          values: recordValues,
          kind: "test",
          source: { id: doc.id, page: finding.page },
          confidence: "paper",
          quote: finding.quote,
          flags: [],
          orig: recordOrig,
        };

        customRecords.push(dataRecord);
        testRecordCount++;
      }
    }

    const study: Study = {
      id: studyId,
      short: studyShort,
      title: studyTitle,
      summary: {
        objective: null,
        subjects: [],
        conditions: null,
        variables: [...studyVarIds],
        instruments: null,
      },
      attributes: {},
      related: [],
      links: doc.paper?.doi
        ? [{ kind: "doi", url: `https://doi.org/${doc.paper.doi}`, label: doc.paper.doi }]
        : [],
      counts: {
        records: testRecordCount,
        tests: testRecordCount,
        publications: doc.paper?.doi ? 1 : 0,
        documents: 1,
      },
      publications: doc.paper?.doi
        ? [{ title: doc.paper.title ?? doc.name, doi: doc.paper.doi }]
        : [],
    };

    customStudies.push(study);
  }

  // Build Schema Variables
  const schemaVariables: Variable[] = includedVars.map((v) => {
    if (v.type === "numeric") {
      const lo = v.min ?? 0;
      const hi = v.max ?? lo;
      const numVar: NumVariable = {
        id: v.id,
        label: v.label,
        type: "num",
        unit: v.unit ?? "",
        sigma: v.sigma ?? Math.max((hi - lo) * 0.15, 1e-3),
        range: [lo, hi],
      };
      return numVar;
    } else {
      const catVar: CatVariable = {
        id: v.id,
        label: v.label,
        type: "cat",
        penalty: 2,
      };
      return catVar;
    }
  });

  // Handle Combine Scope with demoPack / demoMapping
  if (options.scope === "combine" && options.demoPack) {
    const demoPack = options.demoPack;
    const demoMapping = options.demoMapping ?? {
      tables: [],
      synonyms: {},
      approved_by: "demo",
      approved_at: new Date().toISOString(),
    };

    const existingStudyIds = new Set(demoPack.studies.map((s) => s.id));
    const existingSourceIds = new Set(demoPack.sources.map((s) => s.id));
    const existingRecordIds = new Set(demoPack.records.map((r) => r.id));

    // Resolve study collisions
    for (const study of customStudies) {
      if (existingStudyIds.has(study.id)) {
        study.id = `custom_${study.id}`;
      }
      existingStudyIds.add(study.id);
    }

    // Resolve source collisions
    for (const source of customSources) {
      if (existingSourceIds.has(source.id)) {
        source.id = `custom_${source.id}`;
      }
      existingSourceIds.add(source.id);
    }

    // Resolve record collisions & align study/source references
    for (const record of customRecords) {
      if (existingRecordIds.has(record.id)) {
        record.id = `custom_${record.id}`;
      }
      existingRecordIds.add(record.id);
    }

    // Combine Schema Variables: preserve all demo variables + append novel custom variables
    const combinedVariables: Variable[] = [...demoPack.schema.variables];
    const demoVarIds = new Set(demoPack.schema.variables.map((v) => v.id));

    for (const cv of schemaVariables) {
      if (!demoVarIds.has(cv.id)) {
        combinedVariables.push(cv);
        demoVarIds.add(cv.id);
      } else {
        // Expand range for matching numeric variable if needed
        const existing = combinedVariables.find((v) => v.id === cv.id);
        if (existing && existing.type === "num" && cv.type === "num") {
          existing.range = [
            Math.min(existing.range[0], cv.range[0]),
            Math.max(existing.range[1], cv.range[1]),
          ];
        }
      }
    }

    const combinedPack: Pack = {
      contract: "prometeo.pack/1",
      meta: {
        id: `${demoPack.meta.id}_combined`,
        title: options.title || `${demoPack.meta.title} + Uploaded`,
        created_at: new Date().toISOString().split("T")[0],
        source_note: `${demoPack.meta.source_note}; plus ${docs.length} uploaded documents`,
        stats: {
          studies: demoPack.studies.length + customStudies.length,
          records: demoPack.records.length + customRecords.length,
          tests:
            (demoPack.meta.stats?.tests ?? demoPack.records.length) +
            customRecords.filter((r) => r.kind === "test").length,
          campaigns:
            (demoPack.meta.stats?.campaigns ?? 0) +
            customRecords.filter((r) => r.kind === "campaign").length,
          sources: demoPack.sources.length + customSources.length,
          flagged:
            (demoPack.meta.stats?.flagged ?? 0) +
            customRecords.filter((r) => r.flags.length > 0).length,
          publications:
            (demoPack.meta.stats?.publications ?? 0) +
            customStudies.reduce((sum, s) => sum + (s.counts?.publications ?? 0), 0),
          documents: (demoPack.meta.stats?.documents ?? 0) + docs.length,
        },
      },
      schema: {
        variables: combinedVariables,
        thresholds: demoPack.schema.thresholds,
        flags: { ...demoPack.schema.flags },
      },
      sources: [...demoPack.sources, ...customSources],
      studies: [...demoPack.studies, ...customStudies],
      records: [...demoPack.records, ...customRecords],
      claims: [...(demoPack.claims ?? [])],
    };

    const combinedMapping: Mapping = {
      tables: [...demoMapping.tables, ...customMappingTables],
      synonyms: { ...demoMapping.synonyms },
      flag_notes: { ...demoMapping.flag_notes },
      approved_by: "system",
      approved_at: new Date().toISOString(),
    };

    // Build suggestedScenario covering all active variables in combined schema
    const scenarioValues: Record<string, number | string> = {};
    const scenarioSigma: Record<string, number> = {};

    for (const v of combinedVariables) {
      if (v.type === "num") {
        const mapped = includedVarMap.get(v.id);
        scenarioValues[v.id] = mapped?.median ?? (v.range[0] + v.range[1]) / 2;
        scenarioSigma[v.id] = v.sigma;
      } else {
        const mapped = includedVarMap.get(v.id);
        scenarioValues[v.id] = mapped?.mode ?? "";
      }
    }

    return {
      pack: combinedPack,
      mapping: combinedMapping,
      suggestedScenario: {
        values: scenarioValues,
        active: combinedVariables.map((v) => v.id),
        sigma: scenarioSigma,
      },
    };
  }

  // Pure Uploaded Scope
  const packMeta = {
    id: options.title ? slugifyVariable(options.title) : "custom_pack",
    title: options.title || "Custom Pack",
    created_at: new Date().toISOString().split("T")[0],
    source_note: `${docs.length} uploaded document(s)`,
    stats: {
      studies: customStudies.length,
      records: customRecords.length,
      tests: customRecords.filter((r) => r.kind === "test").length,
      campaigns: customRecords.filter((r) => r.kind === "campaign").length,
      sources: customSources.length,
      flagged: customRecords.filter((r) => r.flags.length > 0).length,
      publications: customStudies.reduce(
        (sum, s) => sum + (s.counts?.publications ?? 0),
        0
      ),
      documents: docs.length,
    },
  };

  const pack: Pack = {
    contract: "prometeo.pack/1",
    meta: packMeta,
    schema: {
      variables: schemaVariables,
      thresholds: { grade_a: 1.0, tolerance: 0.25, closeness_reach: 3 },
      flags: {},
    },
    sources: customSources,
    studies: customStudies,
    records: customRecords,
    claims: [],
  };

  const mapping: Mapping = {
    tables: customMappingTables,
    synonyms: {},
    flag_notes: {},
    approved_by: "system",
    approved_at: new Date().toISOString(),
  };

  const suggestedScenario: Scenario = {
    values: {},
    active: schemaVariables.map((v) => v.id),
    sigma: {},
  };

  for (const v of schemaVariables) {
    if (v.type === "num") {
      const mapped = includedVarMap.get(v.id);
      suggestedScenario.values[v.id] = mapped?.median ?? (v.range[0] + v.range[1]) / 2;
      suggestedScenario.sigma![v.id] = v.sigma;
    } else {
      const mapped = includedVarMap.get(v.id);
      suggestedScenario.values[v.id] = mapped?.mode ?? "";
    }
  }

  return { pack, mapping, suggestedScenario };
}

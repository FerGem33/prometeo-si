/**
 * Adaptive GenUI UiBlueprint & Lens Compiler.
 *
 * Compiles user design instructions (bilingual ES/EN directives), preset flags,
 * and remote LLM proposals into a fully validated UiBlueprint, and synthesizes
 * engine-compatible Lens contracts dynamically grounded in the ingested corpus.
 */

import type { Lens, Pack, Preset } from "../engine/types";
import type {
  CorpusScope,
  DesignPresetFlag,
  ExtractedVariable,
  ReportSectionId,
  UiBlueprint,
  UploadedDoc,
} from "./types";
import { generateModules, validateModules } from "./modules";

// ============================================================================
// Constants & Allowlists
// ============================================================================

export const VALID_SECTIONS: ReportSectionId[] = [
  "graphical_abstract",
  "map",
  "heat",
  "gaps",
  "graph",
  "data_methods",
];

export const VALID_VARIABLES_LAYOUTS = ["grouped", "list", "grid"] as const;
export const VALID_DENSITIES = ["editorial", "compact"] as const;

// Bilingual keyword map for sections
const SECTION_PATTERNS: { id: ReportSectionId; patterns: (string | RegExp)[] }[] = [
  {
    id: "gaps",
    patterns: [
      /\bmapa\s+de\s+brechas\b/i,
      /\bgap\s+map\b/i,
      /\bbrechas?\b/i,
      /\bhuecos?\b/i,
      /\bgaps?\b/i,
    ],
  },
  {
    id: "graph",
    patterns: [
      /\bgrafo(\s+entre\s+estudios)?\b/i,
      /\bred(\s+de\s+citas)?\b/i,
      /\bcitas(\s+entre\s+estudios)?\b/i,
      /\bgraph\b/i,
      /\bknowledge\s+graph\b/i,
      /\bcitations?\b/i,
      /\brelaciones\b/i,
    ],
  },
  {
    id: "heat",
    patterns: [
      /\bmapa\s+de\s+calor\b/i,
      /\bheat\s*map\b/i,
      /\bheat\b/i,
      /\bcalor\b/i,
      /\bcomparativa\b/i,
      /\bcomparaci[oó]n\b/i,
      /\bcompare\b/i,
      /\bcomparar\b/i,
      /\branking\b/i,
      /\btabla\b/i,
    ],
  },
  {
    id: "map",
    patterns: [
      /\bmapa\s+conceptual\b/i,
      /\blandscape\b/i,
      // Standalone "mapa" or "map" not followed by "de brechas" or "de calor"
      /\bmapa(?!\s+de\s+(?:brechas|calor))\b/i,
      /(?<!\b(?:gap|heat)\s+)\bmap\b(?!\s+(?:map|of\s+gaps))/i,
    ],
  },
  {
    id: "graphical_abstract",
    patterns: [
      /\bgraphical\s+abstract\b/i,
      /\bresumen\s+(gr[aá]fico|visual)\b/i,
      /\babstract\b/i,
      /\bresumen\b/i,
    ],
  },
  {
    id: "data_methods",
    patterns: [
      /\bdata\s*&\s*methods\b/i,
      /\bdatos\s*y\s*m[eé]todos\b/i,
      /\bm[eé]todos\b/i,
      /\bmethods\b/i,
      /\bdatos\b/i,
      /\bdata\b/i,
    ],
  },
];

// ============================================================================
// 1. Corpus-Grounded Prompt Suggestions
// ============================================================================

/**
 * Generates natural design suggestions mentioning real variable labels or document names
 * extracted from the corpus. Zero combustion/NASA terms when corpus is another domain.
 */
export function suggestDesignPrompts(
  docs: UploadedDoc[],
  vars: ExtractedVariable[]
): string[] {
  const activeVars = vars.filter((v) => v.include !== false);
  const labels = (activeVars.length > 0 ? activeVars : vars).map((v) => v.label);

  const docName = docs[0]?.name
    ? docs[0].name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ")
    : null;

  if (labels.length >= 2) {
    const v0 = labels[0];
    const v1 = labels[1];
    const v2 = labels[2] || labels[0];

    return [
      `Prioritize gap analysis and knowledge graph for ${v0} and ${v1}`,
      `Compact executive view comparing studies with ${v0}`,
      `Deep-dive research view: highlight ${v2} and correlation heat map`,
      `Priorizar mapa de brechas y relaciones entre estudios para ${v0}`,
    ];
  }

  if (labels.length === 1) {
    const v0 = labels[0];
    return [
      `Prioritize gap analysis and knowledge graph for ${v0}`,
      `Compact executive view comparing studies with ${v0}`,
      `Detailed research view with correlation heat map for ${v0}`,
      `Priorizar mapa de brechas y relaciones entre estudios para ${v0}`,
    ];
  }

  if (docName) {
    return [
      `Prioritize gap analysis and knowledge graph for ${docName}`,
      `Compact executive view comparing studies across ${docName}`,
      `Deep-dive research view with correlation heat map for ${docName}`,
      `Priorizar mapa de brechas y citas entre estudios para ${docName}`,
    ];
  }

  return [
    "Prioritize gap analysis and knowledge graph across studies",
    "Compact executive view with comparative study ranking",
    "Deep-dive research view with complete evidence heatmap",
    "Priorizar mapa de brechas y relaciones entre estudios",
  ];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches an exact word/identifier in text respecting word boundaries.
 * Prevents false positives like matching "rate" inside "Generate", while
 * allowing single-character variable identifiers like "p".
 */
function findWordMatchIndex(text: string, needle: string): number {
  const trimmed = needle.trim();
  if (!trimmed) return -1;
  const escaped = escapeRegex(trimmed);
  const leading = /^[a-z0-9_]/i.test(trimmed) ? "(?<=^|[^a-z0-9_])" : "";
  const trailing = /[a-z0-9_]$/i.test(trimmed) ? "(?=$|[^a-z0-9_])" : "";
  const regex = new RegExp(`${leading}${escaped}${trailing}`, "i");
  const match = regex.exec(text);
  return match ? match.index : -1;
}

// ============================================================================
// 2. Bilingual ES/EN UiBlueprint Compiler
// ============================================================================

/**
 * Compiles free-text directives, preset flags, and remote proposals into a strictly
 * validated UiBlueprint conforming to allowlists and corpus variable IDs.
 */
export function compileUiBlueprint(
  instruction: string,
  docs: UploadedDoc[],
  vars: ExtractedVariable[],
  presetFlags: DesignPresetFlag[] = [],
  remoteBlueprint?: Partial<UiBlueprint>
): UiBlueprint {
  const instr = instruction || "";
  const lower = instr.toLowerCase();

  const varIdMap = new Map(vars.map((v) => [v.id, v]));
  const numericVarMap = new Map(
    vars.filter((v) => v.type === "numeric").map((v) => [v.id, v])
  );

  // --------------------------------------------------------------------------
  // A. Detect Mentioned Variables in Instruction
  // --------------------------------------------------------------------------
  const mentionedVars: { variable: ExtractedVariable; index: number }[] = [];

  for (const v of vars) {
    const id = v.id;
    const label = v.label;
    const labelClean = v.label.replace(/\([^)]*\)/g, "").trim();

    let earliestIdx = -1;

    const checkAndRecord = (needle: string) => {
      const idx = findWordMatchIndex(instr, needle);
      if (idx !== -1) {
        if (earliestIdx === -1 || idx < earliestIdx) {
          earliestIdx = idx;
        }
      }
    };

    checkAndRecord(id);
    checkAndRecord(label);
    checkAndRecord(labelClean);

    if (earliestIdx !== -1) {
      mentionedVars.push({ variable: v, index: earliestIdx });
    }
  }

  // Sort mentioned variables by their appearance index
  mentionedVars.sort((a, b) => a.index - b.index);
  const mentionedVarIds = mentionedVars.map((m) => m.variable.id);
  const unmentionedVars = vars.filter((v) => !mentionedVarIds.includes(v.id));

  // --------------------------------------------------------------------------
  // B. Section Prioritization & Section Order
  // --------------------------------------------------------------------------
  const sectionMatchPositions: { id: ReportSectionId; index: number }[] = [];

  for (const entry of SECTION_PATTERNS) {
    let earliest = -1;
    for (const pat of entry.patterns) {
      if (typeof pat === "string") {
        const idx = lower.indexOf(pat);
        if (idx !== -1 && (earliest === -1 || idx < earliest)) {
          earliest = idx;
        }
      } else {
        const match = pat.exec(instr);
        if (match && (earliest === -1 || match.index < earliest)) {
          earliest = match.index;
        }
      }
    }

    if (earliest !== -1) {
      sectionMatchPositions.push({ id: entry.id, index: earliest });
    }
  }

  // Sort by appearance in text
  sectionMatchPositions.sort((a, b) => a.index - b.index);
  const prioritizedFromText = sectionMatchPositions.map((s) => s.id);

  // Also include sections from presetFlags
  const prioritizedFromPresets: ReportSectionId[] = [];
  if (presetFlags.includes("gaps") && !prioritizedFromPresets.includes("gaps")) {
    prioritizedFromPresets.push("gaps");
  }
  if (presetFlags.includes("graph") && !prioritizedFromPresets.includes("graph")) {
    prioritizedFromPresets.push("graph");
  }
  if (presetFlags.includes("compare") && !prioritizedFromPresets.includes("heat")) {
    prioritizedFromPresets.push("heat");
  }

  const prioritizedSections = Array.from(
    new Set([...prioritizedFromPresets, ...prioritizedFromText])
  );

  let compiledSectionOrder: ReportSectionId[] = [];

  // Strict remote validation for sectionOrder
  if (Array.isArray(remoteBlueprint?.sectionOrder)) {
    const validRemoteSections = remoteBlueprint.sectionOrder.filter(
      (s): s is ReportSectionId => VALID_SECTIONS.includes(s as ReportSectionId)
    );
    if (validRemoteSections.length > 0) {
      const seen = new Set<ReportSectionId>();
      for (const s of validRemoteSections) {
        if (!seen.has(s)) {
          seen.add(s);
          compiledSectionOrder.push(s);
        }
      }
      for (const s of VALID_SECTIONS) {
        if (!seen.has(s)) {
          seen.add(s);
          compiledSectionOrder.push(s);
        }
      }
    }
  }

  if (compiledSectionOrder.length === 0) {
    const seen = new Set<ReportSectionId>();
    for (const s of prioritizedSections) {
      if (!seen.has(s)) {
        seen.add(s);
        compiledSectionOrder.push(s);
      }
    }
    for (const s of VALID_SECTIONS) {
      if (!seen.has(s)) {
        seen.add(s);
        compiledSectionOrder.push(s);
      }
    }
  }

  // --------------------------------------------------------------------------
  // C. Density & Flags
  // --------------------------------------------------------------------------
  let density: "editorial" | "compact" = "editorial";
  if (
    remoteBlueprint?.density &&
    (VALID_DENSITIES as readonly string[]).includes(remoteBlueprint.density)
  ) {
    density = remoteBlueprint.density;
  } else if (
    presetFlags.includes("compact") ||
    /\b(compact|compacta|ejecutiv[oa]|dense)\b/i.test(instr)
  ) {
    density = "compact";
  }

  let hideMlCard = false;
  if (typeof remoteBlueprint?.hideMlCard === "boolean") {
    hideMlCard = remoteBlueprint.hideMlCard;
  } else if (
    /\b(hide\s+ml|sin\s+ml|ocultar\s+ml|no\s+ml|desactivar\s+ml|quitar\s+ml|sin\s+tarjeta\s+ml|ocultar\s+tarjeta\s+ml)\b/i.test(
      instr
    )
  ) {
    hideMlCard = true;
  }

  let hideStudyCompare = false;
  if (typeof remoteBlueprint?.hideStudyCompare === "boolean") {
    hideStudyCompare = remoteBlueprint.hideStudyCompare;
  } else if (presetFlags.includes("compare")) {
    hideStudyCompare = false;
  } else if (
    /\b(hide\s+compare|sin\s+comparar|sin\s+comparativa|ocultar\s+comparativa|ocultar\s+comparaci[oó]n|ocultar\s+tabla)\b/i.test(
      instr
    )
  ) {
    hideStudyCompare = true;
  }

  let variablesLayout: "grouped" | "list" | "grid" = "grouped";
  if (
    remoteBlueprint?.variablesLayout &&
    (VALID_VARIABLES_LAYOUTS as readonly string[]).includes(
      remoteBlueprint.variablesLayout
    )
  ) {
    variablesLayout = remoteBlueprint.variablesLayout;
  } else if (/\b(grid|cuadr[ií]cula)\b/i.test(instr)) {
    variablesLayout = "grid";
  } else if (/\b(list|lista)\b/i.test(instr)) {
    variablesLayout = "list";
  } else if (/\b(grouped|agrupado|agrupada|grupos)\b/i.test(instr)) {
    variablesLayout = "grouped";
  }

  // --------------------------------------------------------------------------
  // D. Highlighted Variables
  // --------------------------------------------------------------------------
  let highlightedVariables: string[] = [];

  if (Array.isArray(remoteBlueprint?.highlightedVariables)) {
    const validRemote = remoteBlueprint.highlightedVariables.filter(
      (id): id is string => typeof id === "string" && varIdMap.has(id)
    );
    if (validRemote.length > 0) {
      highlightedVariables = Array.from(new Set(validRemote));
    }
  }

  if (highlightedVariables.length === 0) {
    const combined = [
      ...mentionedVarIds,
      ...unmentionedVars.filter((v) => v.include !== false).map((v) => v.id),
      ...unmentionedVars.map((v) => v.id),
    ];
    highlightedVariables = Array.from(new Set(combined));
  }

  // --------------------------------------------------------------------------
  // E. defaultAxes (Pre-flight Ruling: 0, 1, or 2 strictly NUMERIC variables)
  // --------------------------------------------------------------------------
  let defaultAxes: string[] = [];

  if (Array.isArray(remoteBlueprint?.defaultAxes)) {
    const validRemoteNumeric = remoteBlueprint.defaultAxes.filter(
      (id): id is string => typeof id === "string" && numericVarMap.has(id)
    );
    if (validRemoteNumeric.length > 0) {
      defaultAxes = Array.from(new Set(validRemoteNumeric)).slice(0, 2);
    }
  }

  if (defaultAxes.length === 0 && numericVarMap.size > 0) {
    const mentionedNumeric = mentionedVars
      .filter((m) => m.variable.type === "numeric")
      .map((m) => m.variable.id);
    const unmentionedNumeric = unmentionedVars
      .filter((v) => v.type === "numeric")
      .map((v) => v.id);

    const candidates = Array.from(new Set([...mentionedNumeric, ...unmentionedNumeric]));
    defaultAxes = candidates.slice(0, Math.min(2, candidates.length));
  }

  // --------------------------------------------------------------------------
  // F. Variable Groups
  // --------------------------------------------------------------------------
  let variableGroups: { id: string; label: string; variables: string[] }[] = [];

  if (Array.isArray(remoteBlueprint?.variableGroups)) {
    const validGroups = remoteBlueprint.variableGroups
      .map((g) => ({
        id: String(g.id || "group"),
        label: String(g.label || "Group"),
        variables: Array.isArray(g.variables)
          ? g.variables.filter((vId) => typeof vId === "string" && varIdMap.has(vId))
          : [],
      }))
      .filter((g) => g.variables.length > 0);

    if (validGroups.length > 0) {
      variableGroups = validGroups;
    }
  }

  if (variableGroups.length === 0 && vars.length > 0) {
    const numVars = vars.filter((v) => v.type === "numeric").map((v) => v.id);
    const catVars = vars.filter((v) => v.type === "categorical").map((v) => v.id);

    if (numVars.length > 0) {
      variableGroups.push({
        id: "measurements",
        label: "Measurements",
        variables: numVars,
      });
    }
    if (catVars.length > 0) {
      variableGroups.push({
        id: "conditions",
        label: "Conditions & Attributes",
        variables: catVars,
      });
    }
  }

  // --------------------------------------------------------------------------
  // G. Title, Kicker, Folded/Hidden Sections & Rationale
  // --------------------------------------------------------------------------
  const title =
    (typeof remoteBlueprint?.title === "string" && remoteBlueprint.title.trim()) ||
    (docs.length > 1
      ? `Evidence Synthesis of ${docs.length} Uploaded Documents`
      : docs.length === 1
      ? `${docs[0].name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ")} Evidence Synthesis`
      : "Evidence Synthesis & Scenario Assessment");

  const kicker =
    (typeof remoteBlueprint?.kicker === "string" && remoteBlueprint.kicker.trim()) ||
    "Scenario assessment";

  const foldedSections: Record<string, boolean> = {};
  if (
    remoteBlueprint?.foldedSections &&
    typeof remoteBlueprint.foldedSections === "object"
  ) {
    for (const [k, v] of Object.entries(remoteBlueprint.foldedSections)) {
      if (typeof v === "boolean") {
        foldedSections[k] = v;
      }
    }
  }

  const hiddenSections: ReportSectionId[] = [];
  if (Array.isArray(remoteBlueprint?.hiddenSections)) {
    for (const h of remoteBlueprint.hiddenSections) {
      if (VALID_SECTIONS.includes(h as ReportSectionId) && !hiddenSections.includes(h as ReportSectionId)) {
        hiddenSections.push(h as ReportSectionId);
      }
    }
  }

  const rationale =
    (typeof remoteBlueprint?.rationale === "string" && remoteBlueprint.rationale.trim()) ||
    `Configured adaptive view prioritizing ${compiledSectionOrder
      .slice(0, 2)
      .join(" & ")} with ${density} density based on directives.`;

  // H. Purpose-driven modules: /design may propose them; each one is validated and invalid ones are dropped.
  const included = vars.filter((v) => v.include);
  const includedIds = new Set(included.map((v) => v.id));
  const remoteModules = remoteBlueprint?.modules !== undefined ? validateModules(remoteBlueprint.modules, includedIds) : null;
  if (remoteModules?.rejected.length) console.warn("Prometeo: /design modules rejected", remoteModules.rejected);
  const modules = remoteModules?.modules.length ? remoteModules.modules : generateModules(instr, included);

  return {
    purpose: instr.trim(),
    modules,
    rejectedModules: remoteModules?.rejected ?? [],
    title,
    kicker,
    variablesLayout,
    density,
    highlightedVariables,
    variableGroups,
    defaultAxes,
    sectionOrder: compiledSectionOrder,
    foldedSections,
    hiddenSections,
    hideMlCard,
    hideStudyCompare,
    rationale,
  };
}

// ============================================================================
// 3. Dynamic Lens Builder from Blueprint
// ============================================================================

/**
 * Builds an engine-compatible Lens contract from a compiled UiBlueprint and Pack.
 * Dynamically updates title, byline, default_axes, parts, and discards stale presets.
 */
export function buildLensFromBlueprint(
  blueprint: UiBlueprint,
  pack: Pack,
  _vars: ExtractedVariable[],
  baseLens?: Lens,
  scope?: CorpusScope
): Lens {
  // Words about the reference corpus (subject, disclaimer, gaps, groups) do not describe an upload-only corpus.
  const corpus = scope === "uploaded" ? undefined : baseLens;
  const packVarMap = new Map(pack.schema.variables.map((v) => [v.id, v]));
  const packNumericVars = pack.schema.variables
    .filter((v) => v.type === "num")
    .map((v) => v.id);
  const packNumericSet = new Set(packNumericVars);

  // 1. Title & kicker
  const title = blueprint.title || pack.meta?.title || baseLens?.title || "Evidence Synthesis";
  const kicker = blueprint.kicker || baseLens?.kicker || "Scenario assessment";

  // 2. Dynamic byline reflecting uploaded corpus
  const sourceCount = pack.sources.length;
  const studyCount = pack.studies.length;
  const byline =
    sourceCount > 0
      ? `Synthesised from ${sourceCount} ${
          sourceCount === 1 ? "document" : "documents"
        } (${studyCount} ${studyCount === 1 ? "study" : "studies"})`
      : baseLens?.byline || "Evidence synthesised from uploaded corpus";

  // 3. default_axes (Pre-flight ruling: 0, 1, or 2 valid numeric variables from pack.schema)
  const validFromBlueprint = blueprint.defaultAxes.filter((id) =>
    packNumericSet.has(id)
  );
  const combinedNumeric = Array.from(new Set([...validFromBlueprint, ...packNumericVars]));
  const default_axes = combinedNumeric.slice(0, Math.min(2, combinedNumeric.length));

  // 4. Presets (discard stale presets whose active variables do not exist in pack)
  const validPresets: Preset[] = (baseLens?.presets ?? []).filter((preset) =>
    preset.active.length > 0 && preset.active.every((id) => packVarMap.has(id))
  );

  const default_preset =
    validPresets.length > 0
      ? baseLens?.default_preset && validPresets.some((p) => p.id === baseLens.default_preset)
        ? baseLens.default_preset
        : validPresets[0].id
      : undefined;

  // 5. Parts: group pack schema variables
  let parts = (blueprint.variableGroups ?? [])
    .map((g) => ({
      id: g.id,
      label: g.label,
      variables: g.variables.filter((vId) => packVarMap.has(vId)),
    }))
    .filter((g) => g.variables.length > 0);

  if (parts.length === 0 && pack.schema.variables.length > 0) {
    const numIds = pack.schema.variables.filter((v) => v.type === "num").map((v) => v.id);
    const catIds = pack.schema.variables.filter((v) => v.type === "cat").map((v) => v.id);

    const fallbackParts: { id: string; label: string; variables: string[] }[] = [];
    if (numIds.length > 0) {
      fallbackParts.push({ id: "measurements", label: "Measurements", variables: numIds });
    }
    if (catIds.length > 0) {
      fallbackParts.push({
        id: "conditions",
        label: "Conditions & Attributes",
        variables: catIds,
      });
    }
    parts = fallbackParts;
  }

  // 6. Optional variables (variables in pack not present in default_axes)
  const optional_variables = pack.schema.variables
    .map((v) => v.id)
    .filter((id) => !default_axes.includes(id));

  // 7. Dynamic example questions tailored to the corpus schema (avoid leaking NASA questions on custom corpora)
  const isNasaSchema = ["o2", "p", "material"].every((id) => packVarMap.has(id));
  let questions: string[];
  if (isNasaSchema && baseLens?.questions?.length) {
    questions = baseLens.questions;
  } else {
    const dynamicQuestions: string[] = [];
    const numVars = pack.schema.variables.filter((v) => v.type === "num");
    const catVars = pack.schema.variables.filter((v) => v.type === "cat");
    if (numVars.length >= 1) {
      const v0 = numVars[0];
      const mid0 = Number(((v0.range[0] + v0.range[1]) / 2).toPrecision(3));
      dynamicQuestions.push(
        `Set ${v0.label} to ${mid0}${v0.unit ? ` ${v0.unit}` : ""}`
      );
    }
    if (numVars.length >= 2) {
      const v0 = numVars[0];
      const v1 = numVars[1];
      const m0 = Number((v0.range[0] + (v0.range[1] - v0.range[0]) * 0.75).toPrecision(3));
      const m1 = Number((v1.range[0] + (v1.range[1] - v1.range[0]) * 0.25).toPrecision(3));
      dynamicQuestions.push(
        `Compare ${v0.label} at ${m0}${v0.unit ? ` ${v0.unit}` : ""} and ${v1.label} at ${m1}${v1.unit ? ` ${v1.unit}` : ""}`
      );
    }
    if (catVars.length >= 1) {
      const cv = catVars[0];
      const firstCat = pack.records
        .map((r) => r.values[cv.id])
        .find((val): val is string => typeof val === "string" && val.trim().length > 0);
      if (firstCat) {
        dynamicQuestions.push(`Set ${cv.label} to ${firstCat}`);
      }
    }
    questions = dynamicQuestions;
  }

  return {
    title,
    kicker,
    subject: corpus?.subject || "studies",
    unit_of_study: baseLens?.unit_of_study || "investigation",
    byline,
    disclaimer:
      corpus?.disclaimer ||
      "Prometeo compares conditions across evidence records; it does not replace domain experimentation.",
    footer: corpus?.footer || "Prometeo · Evidence Synthesis Engine",
    presets: validPresets,
    default_preset,
    default_axes,
    optional_variables,
    questions,
    evidence: baseLens?.evidence ?? { min_studies: 1 },
    finding_priority:
      baseLens?.finding_priority ?? [
        "never_measured",
        "above_tested",
        "below_tested",
        "category_untested",
        "known_gap",
        "tested_elsewhere",
        "quality_flags",
        "within_tested",
        "category_tested",
        "full_coverage",
      ],
    known_gaps: corpus?.known_gaps ?? [],
    groups: corpus?.groups ?? [],
    partition_labels: corpus?.partition_labels,
    outcome_columns_note: corpus?.outcome_columns_note,
    parts,
    graph: corpus?.graph ?? { attributes: [] },
  };
}
